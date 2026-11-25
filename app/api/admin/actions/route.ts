import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordRoleApplicationNotificationOutbox,
} from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { validateSafeExternalUrl } from '@/lib/security/ssrf';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  adminReviewRoleApplicationSchema,
  adminUpdateUserRoleSchema,
  saveIntegrationConfigSchema,
} from '@/lib/validations';

const adminActionBodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('update_role'),
      payload: adminUpdateUserRoleSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('review_application'),
      payload: adminReviewRoleApplicationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('save_integration'),
      payload: saveIntegrationConfigSchema,
    })
    .strict(),
]);

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:admin:actions',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = adminActionBodySchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados administrativos inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        profileError,
        'Não foi possível validar suas permissões administrativas.',
        500,
      ),
      rateLimit,
    );
  }

  if (profile?.role !== 'admin') {
    const deniedAudit = {
      event: 'admin.action_denied',
      resource: 'admin_console',
      action: parsed.data.action,
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Acesso restrito a administradores.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  if (parsed.data.action === 'update_role') {
    const { userId, role } = parsed.data.payload;
    if (userId === authUser.id && role !== 'admin') {
      return applyRateLimitHeadersToResponse(
        NextResponse.json(
          { error: 'Não é possível remover o próprio acesso administrativo.' },
          { status: 400 },
        ),
        rateLimit,
      );
    }

    const { data, error } = await supabase.rpc('admin_update_user_role', {
      target_user: userId,
      next_role: role,
    });

    if (error || !data) {
      const status = error?.code === 'P0002' ? 404 : error?.code === '42501' ? 403 : 400;
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          error ?? new Error('Usuário não encontrado.'),
          'Não foi possível atualizar a permissão deste usuário.',
          status,
        ),
        rateLimit,
      );
    }

    const audit = {
      event: 'admin.user_role_updated',
      resource: 'profiles',
      action: 'update_role',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 200,
      requestId,
      metadata: { targetUserId: userId, nextRole: role },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        user: {
          ...data,
          email: data.email ?? undefined,
        },
      }),
      rateLimit,
    );
  }

  if (parsed.data.action === 'review_application') {
    const { applicationId, approve, notes } = parsed.data.payload;
    const { data, error } = await supabase.rpc('review_role_application', {
      target_application: applicationId,
      approve,
      target_notes: notes || null,
    });

    if (error || !data) {
      const status = error?.code === 'P0002' ? 404 : error?.code === '42501' ? 403 : 400;
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          error ?? new Error('Solicitação não encontrada.'),
          'Não foi possível registrar a avaliação deste credenciamento.',
          status,
        ),
        rateLimit,
      );
    }

    await recordRoleApplicationNotificationOutbox({
      recipientUserId: data.user_id,
      approved: approve,
    });

    const audit = {
      event: approve ? 'admin.role_application_approved' : 'admin.role_application_rejected',
      resource: 'role_applications',
      action: 'review',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 200,
      requestId,
      metadata: {
        applicationId: data.id,
        applicantUserId: data.user_id,
        requestedRole: data.requested_role,
        approved: approve,
      },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ application: data }),
      rateLimit,
    );
  }

  const integrationInput = parsed.data.payload;
  const urlCheck = await validateSafeExternalUrl(integrationInput.webhook_endpoint);
  if (!urlCheck.valid) {
    const blockedAudit = {
      event: 'admin.integration_ssrf_blocked',
      resource: 'integration_configs',
      action: 'save',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 400,
      requestId,
      metadata: { provider: integrationInput.provider },
    };
    logAuditEvent(blockedAudit);
    await persistServerAuditLog(blockedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: urlCheck.reason }, { status: 400 }),
      rateLimit,
    );
  }

  const existingQuery = supabase
    .from('integration_configs')
    .select('id')
    .eq('provider', integrationInput.provider);

  const { data: existing, error: existingError } = await (
    integrationInput.organization_id
      ? existingQuery.eq('organization_id', integrationInput.organization_id)
      : existingQuery.is('organization_id', null)
  ).maybeSingle();

  if (existingError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        existingError,
        'Não foi possível consultar a configuração existente da integração.',
        500,
      ),
      rateLimit,
    );
  }

  const payload = {
    organization_id: integrationInput.organization_id ?? null,
    provider: integrationInput.provider,
    environment: integrationInput.environment,
    webhook_endpoint: urlCheck.url.toString(),
    active: integrationInput.active,
    last_status: integrationInput.active ? 'pending_test' : 'paused',
    last_checked_at: null,
  };

  const query = existing
    ? supabase
        .from('integration_configs')
        .update(payload)
        .eq('id', existing.id)
    : supabase.from('integration_configs').insert(payload);

  const { data: savedIntegration, error: saveError } = await query
    .select(
      'id, organization_id, provider, environment, webhook_endpoint, active, last_status, last_checked_at',
    )
    .single();

  if (saveError || !savedIntegration) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        saveError ?? new Error('Falha ao salvar integração.'),
        'Não foi possível salvar a configuração da integração.',
        400,
      ),
      rateLimit,
    );
  }

  const savedAudit = {
    event: 'admin.integration_saved',
    resource: 'integration_configs',
    action: 'save',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      integrationId: savedIntegration.id,
      provider: savedIntegration.provider,
      environment: savedIntegration.environment,
      active: savedIntegration.active,
    },
  };
  logAuditEvent(savedAudit);
  await persistServerAuditLog(savedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ integration: savedIntegration }),
    rateLimit,
  );
}
