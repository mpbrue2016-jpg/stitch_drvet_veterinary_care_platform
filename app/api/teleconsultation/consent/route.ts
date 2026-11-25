import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { isSchemaMissingError } from '@/services/errors';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  evaluateRecordingReadiness,
  TELECONSULTATION_RECORDING_POLICY,
} from '@/lib/teleconsultation/consent';

const recordConsentSchema = z
  .object({
    sessionId: z.string().uuid('Sessão de teleconsulta inválida.'),
    granted: z.boolean(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:teleconsultation:consent:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const parsedId = z.string().uuid().safeParse(sessionId);
  if (!parsedId.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um identificador de sessão válido.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: session, error: sessionError } = await supabase
    .from('teleconsultation_sessions')
    .select('id, appointment_id, tutor_id, veterinarian_id, status, recording_consent')
    .eq('id', parsedId.data)
    .maybeSingle();

  if (sessionError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        sessionError,
        'Não foi possível carregar a sessão de teleconsulta.',
        500,
      ),
      rateLimit,
    );
  }

  if (!session) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Sessão de teleconsulta não encontrada ou sem acesso.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const { data: consentRow, error: consentError } = await supabase
    .from('teleconsultation_consents')
    .select(
      'session_id, appointment_id, tutor_id, veterinarian_id, policy_version, tutor_consented_at, tutor_revoked_at, vet_consented_at, vet_revoked_at',
    )
    .eq('session_id', session.id)
    .maybeSingle();

  if (consentError && !isSchemaMissingError(consentError)) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        consentError,
        'Não foi possível consultar o termo de consentimento.',
        500,
      ),
      rateLimit,
    );
  }

  const readiness = evaluateRecordingReadiness({
    sessionId: session.id,
    appointmentId: session.appointment_id,
    tutorId: session.tutor_id,
    veterinarianId: session.veterinarian_id,
    sessionStatus: session.status,
    tutorConsentedAt: consentRow?.tutor_consented_at ?? null,
    tutorRevokedAt: consentRow?.tutor_revoked_at ?? null,
    vetConsentedAt: consentRow?.vet_consented_at ?? null,
    vetRevokedAt: consentRow?.vet_revoked_at ?? null,
    storageBucketProvisioned: false, // Bucket privado criptografado de gravação ainda não habilitado no MVP
    policyVersion:
      consentRow?.policy_version ?? TELECONSULTATION_RECORDING_POLICY.policyVersion,
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      consent: consentRow ?? null,
      readiness,
      actorParty:
        authUser.id === session.tutor_id
          ? 'tutor'
          : authUser.id === session.veterinarian_id
            ? 'vet'
            : 'observer',
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:teleconsultation:consent:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = recordConsentSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos para registro de consentimento.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: consentRow, error } = await supabase.rpc(
    'record_teleconsultation_consent',
    {
      target_session: parsed.data.sessionId,
      consent_granted: parsed.data.granted,
    },
  );

  if (error || !consentRow) {
    const status = isSchemaMissingError(error)
      ? 503
      : error?.code === 'P0002'
        ? 404
        : error?.code === '42501'
          ? 403
          : error?.code === '55000'
            ? 409
            : 500;

    logAuditEvent({
      event: 'teleconsultation.consent_failed',
      resource: 'teleconsultation_consents',
      action: parsed.data.granted ? 'grant' : 'revoke',
      outcome: status === 403 ? 'denied' : 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { sessionId: parsed.data.sessionId },
    });

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        isSchemaMissingError(error)
          ? 'A tabela/RPC de consentimento bilateral (migration #15) ainda não foi aplicada neste projeto Supabase.'
          : error?.message || 'Não foi possível registrar seu consentimento.',
        status,
      ),
      rateLimit,
    );
  }

  const { data: session } = await supabase
    .from('teleconsultation_sessions')
    .select('status')
    .eq('id', parsed.data.sessionId)
    .maybeSingle();

  const readiness = evaluateRecordingReadiness({
    sessionId: consentRow.session_id,
    appointmentId: consentRow.appointment_id,
    tutorId: consentRow.tutor_id,
    veterinarianId: consentRow.veterinarian_id,
    sessionStatus: session?.status ?? 'waiting',
    tutorConsentedAt: consentRow.tutor_consented_at,
    tutorRevokedAt: consentRow.tutor_revoked_at,
    vetConsentedAt: consentRow.vet_consented_at,
    vetRevokedAt: consentRow.vet_revoked_at,
    storageBucketProvisioned: false,
    policyVersion: consentRow.policy_version,
  });

  logAuditEvent({
    event: parsed.data.granted
      ? 'teleconsultation.consent_granted'
      : 'teleconsultation.consent_revoked',
    resource: 'teleconsultation_consents',
    action: parsed.data.granted ? 'grant' : 'revoke',
    outcome: 'allowed',
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      sessionId: consentRow.session_id,
      bilateralConsented: readiness.bilateralConsented,
      recordingPermitted: readiness.recordingPermitted,
    },
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      consent: consentRow,
      readiness,
    }),
    rateLimit,
  );
}
