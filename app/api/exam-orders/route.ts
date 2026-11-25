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

const createExamOrderSchema = z
  .object({
    appointment_id: z.string().uuid(),
    modality: z.enum(['laboratory', 'imaging']),
    exam_name: z.string().trim().min(1).max(160),
    clinical_indication: z.string().trim().min(1).max(2000),
    instructions: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const resultSchema = z
  .object({
    id: z.string().uuid(),
    result_summary: z.string().trim().min(1).max(10000),
    laboratory_name: z.string().trim().max(160).nullable().optional(),
    performed_at: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:exam-orders:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const appointmentId = request.nextUrl.searchParams.get('appointmentId');
  if (
    appointmentId &&
    !z.string().uuid().safeParse(appointmentId).success
  ) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um agendamento válido.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { page, limit, q, from, to } = parseListFilterParams(
    request.nextUrl.searchParams,
    { limit: 50, maxLimit: 200 },
  );

  let query = supabase
    .from('exam_orders')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, modality, exam_name, clinical_indication, instructions, status, result_summary, laboratory_name, performed_at, requested_at, resulted_at',
    )
    .order('requested_at', { ascending: false })
    .limit(500);
  if (appointmentId) query = query.eq('appointment_id', appointmentId);

  const { data: orders, error } = await query;
  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar as solicitações de exames.',
        500,
      ),
      rateLimit,
    );
  }

  const petIds = Array.from(new Set(orders.map((order) => order.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };
  if (petsError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        petsError,
        'Não foi possível carregar os pacientes dos exames.',
        500,
      ),
      rateLimit,
    );
  }

  const petsById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  const enriched = orders.map((order) => ({
    ...order,
    pet: petsById.get(order.pet_id) ?? null,
  }));

  const filtered = enriched.filter(
    (order) =>
      matchesTextQuery(
        [
          order.exam_name,
          order.clinical_indication,
          order.laboratory_name,
          order.pet?.name,
          order.pet?.species,
        ],
        q,
      ) && matchesPeriodFilter(order.requested_at, from, to),
  );

  const { items, pagination } = paginateItems(filtered, { page, limit });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      examOrders: items,
      currentUserId: authUser.id,
      pagination,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:exam-orders:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createExamOrderSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('create_exam_order', {
    target_appointment: parsed.data.appointment_id,
    target_modality: parsed.data.modality,
    target_exam_name: parsed.data.exam_name,
    target_clinical_indication: parsed.data.clinical_indication,
    target_instructions: parsed.data.instructions ?? null,
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
      event: 'exam_orders.create_failed',
      resource: 'exam_orders',
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
          ? 'Revise o exame e a indicação clínica informados.'
          : 'Não foi possível solicitar o exame.',
        status,
      ),
      rateLimit,
    );
  }

  const createdAudit = {
    event: 'exam_orders.created',
    resource: 'exam_orders',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: { appointmentId: parsed.data.appointment_id, modality: parsed.data.modality },
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
      { examOrder: data ? { ...data, pet: petRow ?? null } : data },
      { status: 201 },
    ),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:exam-orders:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('record_exam_result', {
    target_exam_order: parsed.data.id,
    target_result_summary: parsed.data.result_summary,
    target_laboratory_name: parsed.data.laboratory_name ?? null,
    target_performed_at: parsed.data.performed_at ?? null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : error.code === '55000'
              ? 409
              : 500;
    const failedAudit = {
      event: 'exam_orders.result_failed',
      resource: 'exam_orders',
      action: 'record_result',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { examOrderId: parsed.data.id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '55000'
          ? 'Este resultado já foi registrado e não pode ser alterado.'
          : error.code === '22023'
            ? 'Revise o resultado e a data informados.'
            : 'Não foi possível registrar o resultado.',
        status,
      ),
      rateLimit,
    );
  }

  const recordedAudit = {
    event: 'exam_orders.result_recorded',
    resource: 'exam_orders',
    action: 'record_result',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { examOrderId: parsed.data.id },
  };
  logAuditEvent(recordedAudit);

  const [{ data: petRow }] = await Promise.all([
    data?.pet_id
      ? supabase.from('pets').select('id, name, species').eq('id', data.pet_id).maybeSingle()
      : Promise.resolve({ data: null }),
    persistServerAuditLog(recordedAudit),
  ]);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      examOrder: data ? { ...data, pet: petRow ?? null } : data,
    }),
    rateLimit,
  );
}
