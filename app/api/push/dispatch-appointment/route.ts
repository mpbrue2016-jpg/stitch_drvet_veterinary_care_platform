import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAppointmentNotificationOutbox } from '@/lib/notifications/outbox';
import { dispatchBackgroundPushWithServiceRole } from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const dispatchSchema = z
  .object({
    appointmentId: z.string().uuid(),
    event: z.enum(['created', 'confirmed', 'cancelled']),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:dispatch-appointment',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Parâmetros inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('id, tutor_id, veterinarian_id, kind, status, starts_at')
    .eq('id', parsed.data.appointmentId)
    .maybeSingle();

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível localizar o agendamento para notificação.',
        500,
      ),
      rateLimit,
    );
  }

  if (!appointment) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Agendamento não encontrado ou sem permissão.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const whenFormatted = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(appointment.starts_at));

  if (parsed.data.event === 'created') {
    if (appointment.tutor_id !== authUser.id) {
      return applyRateLimitHeadersToResponse(
        NextResponse.json({ error: 'Operação não permitida.' }, { status: 403 }),
        rateLimit,
      );
    }
    const dispatch = await dispatchBackgroundPushWithServiceRole(
      appointment.veterinarian_id,
      {
        title: 'Nova solicitação na fila DrVet',
        body: `${appointment.kind === 'teleconsultation' ? 'Teleconsulta' : 'Consulta presencial'} solicitada para ${whenFormatted}.`,
        url: '/painel/veterinario',
        tag: `queue-${appointment.id}`,
      },
      'queue',
    );
    const outbox = await recordAppointmentNotificationOutbox({
      recipientUserId: appointment.veterinarian_id,
      event: 'created',
      pushAttempted: dispatch.attempted,
      pushDelivered: dispatch.delivered,
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ dispatch, outbox }),
      rateLimit,
    );
  }

  const isParticipant =
    appointment.veterinarian_id === authUser.id ||
    appointment.tutor_id === authUser.id;
  if (!isParticipant) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Operação não permitida.' }, { status: 403 }),
      rateLimit,
    );
  }

  const recipientId =
    authUser.id === appointment.veterinarian_id
      ? appointment.tutor_id
      : appointment.veterinarian_id;
  const filterType = recipientId === appointment.veterinarian_id ? 'queue' : 'appointments';

  const dispatch = await dispatchBackgroundPushWithServiceRole(
    recipientId,
    {
      title:
        parsed.data.event === 'confirmed'
          ? 'Consulta veterinária confirmada'
          : 'Consulta veterinária cancelada',
      body:
        parsed.data.event === 'confirmed'
          ? `Seu atendimento foi confirmado para ${whenFormatted}.`
          : `O atendimento de ${whenFormatted} foi cancelado.`,
      url: recipientId === appointment.veterinarian_id ? '/painel/veterinario' : '/agendamento',
      tag: `status-${appointment.id}`,
    },
    filterType,
  );

  const outbox = await recordAppointmentNotificationOutbox({
    recipientUserId: recipientId,
    event: parsed.data.event,
    pushAttempted: dispatch.attempted,
    pushDelivered: dispatch.delivered,
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ dispatch, outbox }),
    rateLimit,
  );
}
