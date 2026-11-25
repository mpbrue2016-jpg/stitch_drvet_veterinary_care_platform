import { NextResponse, type NextRequest } from 'next/server';
import { normalizeUserRole } from '@/lib/auth/guards';
import {
  canManageTeleconsultationSession,
  canTransitionTeleconsultationStatus,
  type TeleconsultationSessionStatus,
} from '@/lib/clinical/server-flows';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  openTeleconsultationSessionSchema,
  updateTeleconsultationSessionSchema,
} from '@/lib/validations';

const SESSION_COLUMNS =
  'id, appointment_id, organization_id, pet_id, tutor_id, veterinarian_id, room_code, status, recording_consent, started_at, ended_at, notes, created_at, updated_at';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:teleconsultation:session:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = openTeleconsultationSessionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('open_teleconsultation_session', {
    target_appointment: parsed.data.appointmentId,
  });

  if (error || !data) {
    const status =
      error?.code === '42501'
        ? 403
        : error?.code === 'P0002'
          ? 404
          : 400;
    const failedAudit = {
      event: 'teleconsultation.session_open_failed',
      resource: 'teleconsultation_sessions',
      action: 'open_session',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: {
        appointmentId: parsed.data.appointmentId,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível abrir a sala de teleconsulta.',
        status,
      ),
      rateLimit,
    );
  }

  const openedAudit = {
    event: 'teleconsultation.session_opened',
    resource: 'teleconsultation_sessions',
    action: 'open_session',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      sessionId: data.id,
      appointmentId: parsed.data.appointmentId,
      status: data.status,
    },
  };
  logAuditEvent(openedAudit);
  await persistServerAuditLog(openedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ session: data }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:teleconsultation:session:write',
    limit: 40,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateTeleconsultationSessionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [{ data: profile }, { data: existingSession, error: lookupError }] =
    await Promise.all([
      supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle(),
      supabase
        .from('teleconsultation_sessions')
        .select('id, veterinarian_id, status, started_at, ended_at')
        .eq('id', parsed.data.sessionId)
        .maybeSingle(),
    ]);

  if (lookupError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        lookupError,
        'Não foi possível localizar a sessão de teleconsulta.',
        500,
      ),
      rateLimit,
    );
  }

  if (!existingSession) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Sessão de teleconsulta não encontrada.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const actorRole = normalizeUserRole(
    profile?.role ?? authUser.user_metadata?.role,
  );
  if (
    !canManageTeleconsultationSession({
      actorId: authUser.id,
      actorRole,
      sessionVeterinarianId: existingSession.veterinarian_id,
    })
  ) {
    const deniedAudit = {
      event: 'teleconsultation.session_update_denied',
      resource: 'teleconsultation_sessions',
      action: 'update_session',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: {
        sessionId: parsed.data.sessionId,
      },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Somente o veterinário designado ou administrador pode alterar a sala.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  if (
    parsed.data.status !== undefined &&
    !canTransitionTeleconsultationStatus(
      existingSession.status as TeleconsultationSessionStatus,
      parsed.data.status,
    )
  ) {
    const invalidTransitionAudit = {
      event: 'teleconsultation.session_invalid_transition',
      resource: 'teleconsultation_sessions',
      action: 'update_session',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 409,
      requestId,
      metadata: {
        sessionId: parsed.data.sessionId,
        currentStatus: existingSession.status,
        targetStatus: parsed.data.status,
      },
    };
    logAuditEvent(invalidTransitionAudit);
    await persistServerAuditLog(invalidTransitionAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Esta sessão já foi encerrada e não pode retroceder de estado.' },
        { status: 409 },
      ),
      rateLimit,
    );
  }

  const nowIso = new Date().toISOString();
  const patch: {
    status?: TeleconsultationSessionStatus;
    notes?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
  } = {};

  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    if (parsed.data.status === 'in_progress' && !existingSession.started_at) {
      patch.started_at = nowIso;
    }
    if (parsed.data.status === 'ended' && !existingSession.ended_at) {
      patch.ended_at = nowIso;
    }
  }

  if (parsed.data.notes !== undefined) {
    patch.notes = parsed.data.notes?.trim() || null;
  }

  const { data, error } = await supabase
    .from('teleconsultation_sessions')
    .update(patch)
    .eq('id', parsed.data.sessionId)
    .select(SESSION_COLUMNS)
    .single();

  if (error || !data) {
    const failedAudit = {
      event: 'teleconsultation.session_update_failed',
      resource: 'teleconsultation_sessions',
      action: 'update_session',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
      metadata: {
        sessionId: parsed.data.sessionId,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível atualizar a sessão de teleconsulta.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const updatedAudit = {
    event: 'teleconsultation.session_updated',
    resource: 'teleconsultation_sessions',
    action: 'update_session',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      sessionId: data.id,
      status: data.status,
      hasNotesUpdate: parsed.data.notes !== undefined,
    },
  };
  logAuditEvent(updatedAudit);
  await persistServerAuditLog(updatedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ session: data }),
    rateLimit,
  );
}
