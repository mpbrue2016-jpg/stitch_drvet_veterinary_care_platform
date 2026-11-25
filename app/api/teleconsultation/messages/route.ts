import { NextResponse, type NextRequest } from 'next/server';
import { normalizeUserRole } from '@/lib/auth/guards';
import {
  canPostTeleconsultationMessage,
  type TeleconsultationSessionStatus,
} from '@/lib/clinical/server-flows';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { sendTeleconsultationMessageSchema } from '@/lib/validations';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:teleconsultation:messages:write',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = sendTeleconsultationMessageSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Mensagem inválida.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [{ data: profile }, { data: sessionRow, error: sessionError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, role')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase
        .from('teleconsultation_sessions')
        .select('id, tutor_id, veterinarian_id, status')
        .eq('id', parsed.data.sessionId)
        .maybeSingle(),
    ]);

  if (sessionError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        sessionError,
        'Não foi possível localizar a sala de teleconsulta.',
        500,
      ),
      rateLimit,
    );
  }

  if (!sessionRow) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Sala de teleconsulta não encontrada.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const actorRole = normalizeUserRole(
    profile?.role ?? authUser.user_metadata?.role,
  );
  const guard = canPostTeleconsultationMessage({
    actorId: authUser.id,
    actorRole,
    tutorId: sessionRow.tutor_id,
    veterinarianId: sessionRow.veterinarian_id,
    sessionStatus: sessionRow.status as TeleconsultationSessionStatus,
  });

  if (!guard.allowed) {
    const deniedAudit = {
      event: 'teleconsultation.message_denied',
      resource: 'teleconsultation_messages',
      action: 'send_message',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: guard.status,
      requestId,
      metadata: {
        sessionId: sessionRow.id,
        sessionStatus: sessionRow.status,
      },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: guard.reason }, { status: guard.status }),
      rateLimit,
    );
  }

  const senderName =
    profile?.display_name ||
    String(authUser.user_metadata?.display_name ?? '') ||
    authUser.email ||
    'Participante';

  const { data, error } = await supabase
    .from('teleconsultation_messages')
    .insert({
      session_id: sessionRow.id,
      sender_id: authUser.id,
      sender_name: senderName,
      message: parsed.data.message,
    })
    .select('id, session_id, sender_id, sender_name, message, created_at')
    .single();

  if (error || !data) {
    const failedAudit = {
      event: 'teleconsultation.message_failed',
      resource: 'teleconsultation_messages',
      action: 'send_message',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
      metadata: { sessionId: sessionRow.id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível enviar a mensagem.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const sentAudit = {
    event: 'teleconsultation.message_sent',
    resource: 'teleconsultation_messages',
    action: 'send_message',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      sessionId: sessionRow.id,
      messageId: data.id,
      length: parsed.data.message.length,
    },
  };
  logAuditEvent(sentAudit);
  await persistServerAuditLog(sentAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ message: data }, { status: 201 }),
    rateLimit,
  );
}
