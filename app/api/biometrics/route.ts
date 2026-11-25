import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { isSchemaMissingError } from '@/services/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:biometrics:status',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipError },
    { data: applications },
    { data: biometric, error: biometricError },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .maybeSingle(),
    supabase
      .from('organization_memberships')
      .select('role')
      .eq('user_id', authUser.id),
    supabase
      .from('role_applications')
      .select('requested_role, status')
      .eq('user_id', authUser.id),
    supabase
      .from('facial_biometrics')
      .select(
        'id, user_id, status, algorithm, template_hash, liveness_score, device_label, enrolled_at, last_verified_at, updated_at',
      )
      .eq('user_id', authUser.id)
      .maybeSingle(),
    supabase
      .from('facial_biometric_verifications')
      .select(
        'id, user_id, biometric_id, event_type, similarity_score, liveness_score, matched, device_label, created_at',
      )
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const role = profile?.role ?? 'tutor';
  const orgRoles = (memberships ?? []).map((item) => item.role);
  const hasVetApplication = (applications ?? []).some(
    (app) => app.requested_role === 'veterinarian' && app.status !== 'rejected',
  );
  const isVeterinarian =
    role === 'veterinarian' ||
    orgRoles.includes('veterinarian') ||
    hasVetApplication;

  if (
    isSchemaMissingError(biometricError) ||
    isSchemaMissingError(profileError) ||
    isSchemaMissingError(membershipError)
  ) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        schemaReady: false,
        enrolled: false,
        isVeterinarian,
        role,
        biometric: null,
        recentLogs: [],
      }),
      rateLimit,
    );
  }

  if (biometricError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        biometricError,
        'Não foi possível consultar o status da biometria facial.',
        500,
      ),
      rateLimit,
    );
  }

  const activeBiometric =
    biometric && biometric.status === 'active' ? biometric : null;

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      schemaReady: true,
      enrolled: Boolean(activeBiometric),
      isVeterinarian,
      role,
      biometric: biometric ?? null,
      recentLogs: recentLogs ?? [],
    }),
    rateLimit,
  );
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:biometrics:revoke',
    limit: 10,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const { error } = await supabase.rpc('revoke_facial_biometrics');
  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível revogar a biometria facial.',
        isSchemaMissingError(error) ? 503 : 400,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: 'biometrics.revoked',
    resource: 'facial_biometrics',
    action: 'revoke',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ revoked: true }),
    rateLimit,
  );
}
