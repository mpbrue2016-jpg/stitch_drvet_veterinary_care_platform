import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { updateProfileSchema } from '@/lib/validations';

const strictSelfProfileSchema = updateProfileSchema.strict();

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:profile:update',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = strictSelfProfileSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Dados de perfil inválidos.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.display_name,
      phone: parsed.data.phone?.trim() || null,
    })
    .eq('id', authUser.id)
    .select('id, display_name, email, phone, role, created_at, updated_at')
    .single();

  if (error || !updated) {
    const failedAudit = {
      event: 'profile.update_failed',
      resource: 'profiles',
      action: 'update',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível atualizar os dados do seu perfil.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const updatedAudit = {
    event: 'profile.updated',
    resource: 'profiles',
    action: 'update',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      hasPhone: Boolean(updated.phone),
    },
  };
  logAuditEvent(updatedAudit);
  await persistServerAuditLog(updatedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      profile: {
        ...updated,
        email: updated.email ?? authUser.email,
      },
    }),
    rateLimit,
  );
}
