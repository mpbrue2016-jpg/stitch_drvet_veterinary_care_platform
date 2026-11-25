import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { checkPaymentGatewayReadiness } from '@/lib/payments/architecture';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { evaluateDigitalSignatureReadiness } from '@/lib/clinical/prescription-digest';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { TELECONSULTATION_RECORDING_POLICY } from '@/lib/teleconsultation/consent';
import { isSchemaMissingError } from '@/services/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:admin:mvp-readiness',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profileError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        profileError,
        'Não foi possível validar o perfil administrativo.',
        500,
      ),
      rateLimit,
    );
  }

  if (profile?.role !== 'admin') {
    logAuditEvent({
      event: 'admin.mvp_readiness_denied',
      resource: 'admin_mvp_readiness',
      action: 'read',
      outcome: 'denied',
      actorId: authUser.id,
      statusCode: 403,
      requestId,
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Acesso restrito a administradores.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const gateways = checkPaymentGatewayReadiness(process.env);
  const pushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );

  const [auditRes, webhookRes, outboxRes] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id, actor_id, event, resource, action, outcome, status_code, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('webhook_events')
      .select('id, provider, event_id, event_type, status, processed_at')
      .order('processed_at', { ascending: false })
      .limit(20),
    supabase
      .from('notification_outbox')
      .select('id, channel, template_key, status, attempts, scheduled_for')
      .order('scheduled_for', { ascending: false })
      .limit(20),
  ]);

  const auditSchemaReady = !(auditRes.error && isSchemaMissingError(auditRes.error));
  const webhookSchemaReady = !(
    webhookRes.error && isSchemaMissingError(webhookRes.error)
  );
  const outboxSchemaReady = !(outboxRes.error && isSchemaMissingError(outboxRes.error));

  logAuditEvent({
    event: 'admin.mvp_readiness_viewed',
    resource: 'admin_mvp_readiness',
    action: 'read',
    outcome: 'allowed',
    actorId: authUser.id,
    statusCode: 200,
    requestId,
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      gateways,
      channels: {
        webPushConfigured: pushConfigured,
        recordingPolicy: TELECONSULTATION_RECORDING_POLICY,
        recordingBucketProvisioned: false,
        digitalSignature: evaluateDigitalSignatureReadiness(),
      },
      telemetry: {
        auditSchemaReady,
        webhookSchemaReady,
        outboxSchemaReady,
        auditLogs: auditSchemaReady && !auditRes.error ? (auditRes.data ?? []) : [],
        webhookEvents:
          webhookSchemaReady && !webhookRes.error ? (webhookRes.data ?? []) : [],
        outboxItems:
          outboxSchemaReady && !outboxRes.error ? (outboxRes.data ?? []) : [],
      },
    }),
    rateLimit,
  );
}
