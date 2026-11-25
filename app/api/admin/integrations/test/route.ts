import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { validateSafeExternalUrl } from '@/lib/security/ssrf';

const testIntegrationSchema = z
  .object({
    integrationId: z.string().uuid('Identificador de integração inválido.'),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:admin:integrations:test',
    limit: 15,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = testIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe uma integração válida para testar.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [{ data: profile, error: profileError }, { data: config, error: configError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase
        .from('integration_configs')
        .select('id, organization_id, provider, webhook_endpoint')
        .eq('id', parsed.data.integrationId)
        .maybeSingle(),
    ]);

  if (profileError || configError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        profileError ?? configError,
        'Não foi possível carregar a configuração da integração.',
        500,
      ),
      rateLimit,
    );
  }

  if (!config) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Integração não encontrada ou sem acesso.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  let hasOrgAdmin = false;
  if (config.organization_id) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', config.organization_id)
      .eq('user_id', authUser.id)
      .maybeSingle();
    hasOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  }

  if (profile?.role !== 'admin' && !hasOrgAdmin) {
    logAuditEvent({
      event: 'admin.integration_test_denied',
      resource: 'integration_configs',
      action: 'test',
      outcome: 'denied',
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: { integrationId: config.id },
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Apenas administradores podem testar endpoints de integração.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const urlCheck = await validateSafeExternalUrl(config.webhook_endpoint);
  if (!urlCheck.valid) {
    const failedAt = new Date().toISOString();
    await supabase
      .from('integration_configs')
      .update({
        last_status: `Bloqueado: ${urlCheck.reason}`,
        last_checked_at: failedAt,
        active: false,
      })
      .eq('id', config.id);

    logAuditEvent({
      event: 'admin.integration_ssrf_blocked',
      resource: 'integration_configs',
      action: 'test',
      outcome: 'denied',
      actorId: authUser.id,
      statusCode: 400,
      requestId,
      metadata: { integrationId: config.id, provider: config.provider },
    });

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: urlCheck.reason }, { status: 400 }),
      rateLimit,
    );
  }

  let lastStatus = 'Erro de conexão';
  let reachable = false;
  const checkedAt = new Date().toISOString();

  try {
    let response = await fetch(urlCheck.url.toString(), {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(urlCheck.url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
    }

    reachable = response.status >= 200 && response.status < 400;
    lastStatus = `${response.status} ${response.statusText || (reachable ? 'OK' : 'HTTP')}`.trim();
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Timeout (5s)'
        : 'Host inacessível';
    lastStatus = msg;
    reachable = false;
  }

  const { data: updated, error: updateError } = await supabase
    .from('integration_configs')
    .update({
      last_status: lastStatus,
      last_checked_at: checkedAt,
      active: reachable,
    })
    .eq('id', config.id)
    .select(
      'id, organization_id, provider, environment, webhook_endpoint, active, last_status, last_checked_at',
    )
    .single();

  if (updateError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        updateError,
        'Não foi possível salvar o resultado do teste.',
        500,
      ),
      rateLimit,
    );
  }

  logAuditEvent({
    event: 'admin.integration_tested',
    resource: 'integration_configs',
    action: 'test',
    outcome: reachable ? 'allowed' : 'error',
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { integrationId: config.id, provider: config.provider, reachable },
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      integration: updated,
      reachable,
    }),
    rateLimit,
  );
}
