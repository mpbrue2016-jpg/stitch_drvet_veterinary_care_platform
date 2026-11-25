import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  matchesPeriodFilter,
  matchesTextQuery,
  paginateItems,
  parseListFilterParams,
} from '@/lib/pagination';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsedDate = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsedDate.valueOf()) &&
      parsedDate.toISOString().slice(0, 10) === value
    );
  });

const vaccinationSchema = z
  .object({
    appointment_id: z.string().uuid(),
    vaccine_name: z.string().trim().min(1).max(160),
    administered_on: dateSchema,
    batch_number: z.string().trim().max(80).nullable().optional(),
    manufacturer: z.string().trim().max(120).nullable().optional(),
    next_due_on: dateSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.next_due_on == null ||
      value.next_due_on >= value.administered_on,
    {
      message: 'A próxima dose não pode ser anterior à data de aplicação.',
      path: ['next_due_on'],
    },
  );

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:vaccinations:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const { page, limit, q, from, to } = parseListFilterParams(
    request.nextUrl.searchParams,
    { limit: 50, maxLimit: 200 },
  );

  const { data: records, error } = await supabase
    .from('vaccination_records')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, vaccine_name, administered_on, batch_number, manufacturer, next_due_on, notes, created_at',
    )
    .order('administered_on', { ascending: false })
    .limit(500);

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar a carteira de vacinação.',
        500,
      ),
      rateLimit,
    );
  }

  const petIds = Array.from(new Set(records.map((record) => record.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };

  if (petsError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        petsError,
        'Não foi possível carregar os pacientes das vacinas.',
        500,
      ),
      rateLimit,
    );
  }

  const petsById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  const enriched = records.map((record) => ({
    ...record,
    pet: petsById.get(record.pet_id) ?? null,
  }));

  const filtered = enriched.filter(
    (record) =>
      matchesTextQuery(
        [
          record.vaccine_name,
          record.manufacturer,
          record.batch_number,
          record.pet?.name,
          record.pet?.species,
        ],
        q,
      ) && matchesPeriodFilter(record.administered_on, from, to),
  );

  const { items, pagination } = paginateItems(filtered, { page, limit });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      vaccinations: items,
      currentUserId: authUser.id,
      pagination,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:vaccinations:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = vaccinationSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('create_vaccination_record', {
    target_appointment: parsed.data.appointment_id,
    target_vaccine_name: parsed.data.vaccine_name,
    target_administered_on: parsed.data.administered_on,
    target_batch_number: parsed.data.batch_number ?? null,
    target_manufacturer: parsed.data.manufacturer ?? null,
    target_next_due_on: parsed.data.next_due_on ?? null,
    target_notes: parsed.data.notes ?? null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : 500;
    const failedAudit = {
      event: 'vaccinations.create_failed',
      resource: 'vaccination_records',
      action: 'create',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { appointmentId: parsed.data.appointment_id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '22023'
          ? 'Confira o nome da vacina e as datas informadas.'
          : 'Não foi possível registrar a vacinação.',
        status,
      ),
      rateLimit,
    );
  }

  const createdAudit = {
    event: 'vaccinations.created',
    resource: 'vaccination_records',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: { appointmentId: parsed.data.appointment_id },
  };
  logAuditEvent(createdAudit);

  const [{ data: petRow }] = await Promise.all([
    data?.pet_id
      ? supabase.from('pets').select('id, name, species').eq('id', data.pet_id).maybeSingle()
      : Promise.resolve({ data: null }),
    persistServerAuditLog(createdAudit),
  ]);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      { vaccination: data ? { ...data, pet: petRow ?? null } : data },
      { status: 201 },
    ),
    rateLimit,
  );
}
