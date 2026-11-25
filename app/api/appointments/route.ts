import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordAppointmentNotificationOutbox,
} from '@/lib/notifications/outbox';
import {
  matchesPeriodFilter,
  matchesTextQuery,
  paginateItems,
  parseListFilterParams,
} from '@/lib/pagination';
import { dispatchBackgroundPushWithServiceRole } from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const createAppointmentSchema = z
  .object({
    availability_id: z.string().uuid(),
    pet_id: z.string().uuid(),
    kind: z.enum(['teleconsultation', 'in_person']),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const transitionAppointmentSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['confirmed', 'cancelled', 'completed']),
  })
  .strict();

const appointmentRangeSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (range) => new Date(range.to).getTime() > new Date(range.from).getTime(),
    'O fim do período deve ser posterior ao início.',
  );

const statusFilterSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed']);

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:appointments:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  const rawStatus = request.nextUrl.searchParams.get('status')?.trim() || null;

  if (rawStatus && !statusFilterSchema.safeParse(rawStatus).success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Filtro de status inválido.' }, { status: 400 }),
      rateLimit,
    );
  }

  const isIsoRange = Boolean(from && to && from.includes('T') && to.includes('T'));
  const range = isIsoRange && from && to
    ? appointmentRangeSchema.safeParse({ from, to })
    : null;
  if (range && !range.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um período válido.', details: range.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { page, limit, q, from: filterFrom, to: filterTo } = parseListFilterParams(
    request.nextUrl.searchParams,
    { limit: isIsoRange ? 500 : 100, maxLimit: 500 },
  );

  let appointmentsQuery = supabase
    .from('appointments')
    .select(
      'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
    )
    .order('starts_at', { ascending: range !== null })
    .limit(500);

  if (range?.success) {
    appointmentsQuery = appointmentsQuery
      .gte('starts_at', range.data.from)
      .lt('starts_at', range.data.to);
  }
  if (rawStatus) {
    appointmentsQuery = appointmentsQuery.eq('status', rawStatus as z.infer<typeof statusFilterSchema>);
  }

  const { data, error } = await appointmentsQuery;

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar os agendamentos.',
        500,
      ),
      rateLimit,
    );
  }

  const petIds = Array.from(new Set(data.map((appointment) => appointment.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase
          .from('pets')
          .select('id, name, species')
          .in('id', petIds)
      : { data: [], error: null };

  if (petsError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        petsError,
        'Não foi possível carregar os pacientes dos agendamentos.',
        500,
      ),
      rateLimit,
    );
  }

  const petById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  const enriched = data.map((appointment) => ({
    ...appointment,
    pet: petById.get(appointment.pet_id) ?? null,
  }));

  const filtered = enriched.filter((appointment) => {
    const matchesSearch = q
      ? matchesTextQuery(
          [
            appointment.pet?.name,
            appointment.pet?.species,
            appointment.reason,
            appointment.kind === 'teleconsultation' ? 'teleconsulta' : 'presencial',
          ],
          q,
        )
      : true;
    const matchesDates =
      !isIsoRange && (filterFrom || filterTo)
        ? matchesPeriodFilter(appointment.starts_at, filterFrom, filterTo)
        : true;
    return matchesSearch && matchesDates;
  });

  const { items, pagination } = paginateItems(filtered, { page, limit });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      appointments: items,
      currentUserId: authUser.id,
      pagination,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:appointments:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: availability, error: availabilityError } = await supabase
    .from('professional_availability')
    .select('id, organization_id, veterinarian_id, starts_at, ends_at')
    .eq('id', parsed.data.availability_id)
    .eq('is_available', true)
    .eq('is_blocked', false)
    .gt('starts_at', new Date().toISOString())
    .maybeSingle();

  if (availabilityError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        availabilityError,
        'Não foi possível verificar a disponibilidade.',
        500,
      ),
      rateLimit,
    );
  }
  if (!availability) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Este horário não está mais disponível.' },
        { status: 409 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      availability_id: availability.id,
      organization_id: availability.organization_id,
      veterinarian_id: availability.veterinarian_id,
      starts_at: availability.starts_at,
      ends_at: availability.ends_at,
      tutor_id: authUser.id,
      pet_id: parsed.data.pet_id,
      kind: parsed.data.kind,
      reason: parsed.data.reason || null,
    })
    .select(
      'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
    )
    .single();

  if (error) {
    const isConflict = error.code === '23P01' || error.code === '23505';
    const statusCode = isConflict ? 409 : error.code === '42501' ? 403 : 500;
    const failedAudit = {
      event: 'appointments.create_failed',
      resource: 'appointments',
      action: 'create',
      outcome: (error.code === '42501' ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode,
      requestId,
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        isConflict
          ? 'Este horário acabou de ser reservado. Escolha outro horário.'
          : 'Não foi possível solicitar o agendamento. Confira o pet e tente novamente.',
        statusCode,
      ),
      rateLimit,
    );
  }

  const createdAudit = {
    event: 'appointments.created',
    resource: 'appointments',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: { appointmentId: data.id, kind: data.kind },
  };
  logAuditEvent(createdAudit);

  const whenFormatted = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data.starts_at));

  const [{ data: petRow }, dispatch] = await Promise.all([
    supabase.from('pets').select('id, name, species').eq('id', data.pet_id).maybeSingle(),
    dispatchBackgroundPushWithServiceRole(
      availability.veterinarian_id,
      {
        title: 'Nova solicitação na fila DrVet',
        body: `${data.kind === 'teleconsultation' ? 'Teleconsulta' : 'Consulta presencial'} solicitada para ${whenFormatted}.`,
        url: '/painel/veterinario',
        tag: `queue-${data.id}`,
      },
      'queue',
    ).catch(() => ({ attempted: 0, delivered: 0 })),
    persistServerAuditLog(createdAudit),
  ]);

  await recordAppointmentNotificationOutbox({
    recipientUserId: availability.veterinarian_id,
    event: 'created',
    pushAttempted: dispatch.attempted,
    pushDelivered: dispatch.delivered,
  }).catch(() => null);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      {
        appointment: {
          ...data,
          pet: petRow ?? null,
        },
      },
      { status: 201 },
    ),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:appointments:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = transitionAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('transition_appointment', {
    target_appointment: parsed.data.id,
    next_status: parsed.data.status,
  });

  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 409;
    const failedAudit = {
      event: 'appointments.transition_failed',
      resource: 'appointments',
      action: parsed.data.status,
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { appointmentId: parsed.data.id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'A mudança de status não foi autorizada ou não é válida.',
        status,
      ),
      rateLimit,
    );
  }

  const transitionedAudit = {
    event: 'appointments.transitioned',
    resource: 'appointments',
    action: parsed.data.status,
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { appointmentId: parsed.data.id, nextStatus: parsed.data.status },
  };
  logAuditEvent(transitionedAudit);

  const [{ data: petRow }] = await Promise.all([
    data?.pet_id
      ? supabase.from('pets').select('id, name, species').eq('id', data.pet_id).maybeSingle()
      : Promise.resolve({ data: null }),
    persistServerAuditLog(transitionedAudit),
  ]);

  if (data && (parsed.data.status === 'confirmed' || parsed.data.status === 'cancelled')) {
    const recipientId =
      authUser.id === data.veterinarian_id ? data.tutor_id : data.veterinarian_id;
    const filterType =
      recipientId === data.veterinarian_id ? 'queue' : 'appointments';
    const whenFormatted = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(data.starts_at));

    const dispatch = await dispatchBackgroundPushWithServiceRole(
      recipientId,
      {
        title:
          parsed.data.status === 'confirmed'
            ? 'Consulta veterinária confirmada'
            : 'Consulta veterinária cancelada',
        body:
          parsed.data.status === 'confirmed'
            ? `Seu atendimento foi confirmado para ${whenFormatted}.`
            : `O atendimento de ${whenFormatted} foi cancelado.`,
        url: recipientId === data.veterinarian_id ? '/painel/veterinario' : '/agendamento',
        tag: `status-${data.id}`,
      },
      filterType,
    ).catch(() => ({ attempted: 0, delivered: 0 }));

    await recordAppointmentNotificationOutbox({
      recipientUserId: recipientId,
      event: parsed.data.status,
      pushAttempted: dispatch.attempted,
      pushDelivered: dispatch.delivered,
    }).catch(() => null);
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      appointment: data
        ? {
            ...data,
            pet: petRow ?? null,
          }
        : data,
    }),
    rateLimit,
  );
}
