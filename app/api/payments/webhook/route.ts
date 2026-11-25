import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  computePayloadSha256,
  isWithinReplayWindow,
  verifyMercadoPagoSignature,
  verifySharedWebhookSecret,
} from '@/lib/payments/architecture';
import {
  applyRateLimitHeadersToResponse,
  checkRequestRateLimit,
} from '@/lib/security/api-guard';
import { isSchemaMissingError } from '@/services/errors';
import { getSupabasePublicConfig, isSupabaseConfigured } from '@/lib/supabase/config';
import type { Database } from '@/types/database';

const webhookPayloadSchema = z
  .object({
    orderId: z.string().uuid(),
    externalReference: z.string().trim().max(80).nullable().optional(),
    provider: z.enum(['asaas', 'mercado_pago', 'manual_gateway']).optional(),
    eventId: z.string().trim().min(1).max(160).optional(),
    eventType: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const limitCheck = checkRequestRateLimit(request, {
    routeKey: 'api:payments:webhook',
    limit: 60,
    windowMs: 60_000,
  });
  if (!limitCheck.allowed) return limitCheck.response;

  if (!isSupabaseConfigured()) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 }),
      limitCheck.rateLimit,
    );
  }

  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET?.trim() ?? '';
  const providedSecret = request.headers.get('x-webhook-secret')?.trim() ?? '';
  const mpSignature = request.headers.get('x-signature')?.trim() ?? '';
  const mpRequestId = request.headers.get('x-request-id')?.trim() ?? '';

  if (!expectedSecret) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Assinatura de webhook inválida.' }, { status: 401 }),
      limitCheck.rateLimit,
    );
  }

  if (!mpSignature && !verifySharedWebhookSecret(providedSecret, expectedSecret)) {
    const deniedEvent = {
      event: 'payments.webhook_invalid_signature',
      resource: 'payment_orders',
      action: 'webhook_settle',
      outcome: 'denied' as const,
      statusCode: 401,
    };
    logAuditEvent(deniedEvent);
    await persistServerAuditLog(deniedEvent);
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Assinatura de webhook inválida.' }, { status: 401 }),
      limitCheck.rateLimit,
    );
  }

  const rawBody = await request.text().catch(() => '');
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }

  const parsed = webhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Payload de webhook inválido.' }, { status: 400 }),
      limitCheck.rateLimit,
    );
  }

  if (mpSignature) {
    const queryDataId = request.nextUrl.searchParams.get('data.id')?.trim();
    const mpCheck = verifyMercadoPagoSignature({
      signatureHeader: mpSignature,
      requestIdHeader: mpRequestId,
      dataId: queryDataId || parsed.data.eventId || parsed.data.orderId,
      secret: expectedSecret,
    });
    if (!mpCheck.valid) {
      const deniedEvent = {
        event: 'payments.webhook_invalid_signature',
        resource: 'payment_orders',
        action: 'webhook_settle',
        outcome: 'denied' as const,
        statusCode: 401,
        metadata: { orderId: parsed.data.orderId },
      };
      logAuditEvent(deniedEvent);
      await persistServerAuditLog(deniedEvent);
      return applyRateLimitHeadersToResponse(
        NextResponse.json({ error: 'Assinatura de webhook inválida.' }, { status: 401 }),
        limitCheck.rateLimit,
      );
    }
  }

  const rawTimestamp = request.headers.get('x-webhook-timestamp')?.trim();
  if (rawTimestamp) {
    const parsedTs = Number.parseInt(rawTimestamp, 10);
    if (!isWithinReplayWindow(parsedTs, { maxAgeSeconds: 300 })) {
      const replayEvent = {
        event: 'payments.webhook_replay_rejected',
        resource: 'webhook_events',
        action: 'webhook_settle',
        outcome: 'denied' as const,
        statusCode: 401,
        metadata: { orderId: parsed.data.orderId },
      };
      logAuditEvent(replayEvent);
      await persistServerAuditLog(replayEvent);
      return applyRateLimitHeadersToResponse(
        NextResponse.json(
          { error: 'Timestamp do webhook fora da janela anti-replay.' },
          { status: 401 },
        ),
        limitCheck.rateLimit,
      );
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Chave de serviço do servidor não configurada.' },
        { status: 503 },
      ),
      limitCheck.rateLimit,
    );
  }

  const { url } = getSupabasePublicConfig();
  const adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const provider = parsed.data.provider ?? 'manual_gateway';
  const eventId =
    parsed.data.eventId ||
    request.headers.get('x-webhook-event-id')?.trim() ||
    `order:${parsed.data.orderId}`;
  const eventType = parsed.data.eventType ?? 'payment.confirmed';
  const payloadHash = computePayloadSha256(rawBody || JSON.stringify(parsed.data));

  // Idempotência: verificar se evento já foi processado na tabela webhook_events
  const { data: existingEvent, error: lookupError } = await adminClient
    .from('webhook_events')
    .select('id, status, processed_at')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .maybeSingle();

  const idempotencyTableMissing = lookupError ? isSchemaMissingError(lookupError) : false;

  if (!idempotencyTableMissing && existingEvent) {
    logAuditEvent({
      event: 'payments.webhook_duplicate',
      resource: 'webhook_events',
      action: 'webhook_settle',
      outcome: 'allowed',
      statusCode: 200,
      metadata: {
        provider,
        eventId,
        orderId: parsed.data.orderId,
        duplicate: true,
      },
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        duplicate: true,
        settled: null,
        processedAt: existingEvent.processed_at,
      }),
      limitCheck.rateLimit,
    );
  }

  const { data: order, error } = await adminClient.rpc('settle_payment_order', {
    target_order_id: parsed.data.orderId,
    target_reference: parsed.data.externalReference ?? null,
  });

  if (error) {
    const status = error.code === 'P0002' ? 404 : 400;
    if (!idempotencyTableMissing) {
      await adminClient.from('webhook_events').upsert(
        {
          provider,
          event_id: eventId,
          event_type: eventType,
          order_id: status === 404 ? null : parsed.data.orderId,
          payload_hash: payloadHash,
          status: 'failed',
        },
        { onConflict: 'provider,event_id' },
      );
    }
    logAuditEvent({
      event: 'payments.webhook_failed',
      resource: 'payment_orders',
      action: 'webhook_settle',
      outcome: 'error',
      statusCode: status,
      metadata: { provider, eventId, orderId: parsed.data.orderId },
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: error.message }, { status }),
      limitCheck.rateLimit,
    );
  }

  if (!idempotencyTableMissing) {
    await adminClient.from('webhook_events').insert({
      provider,
      event_id: eventId,
      event_type: eventType,
      order_id: parsed.data.orderId,
      payload_hash: payloadHash,
      status: 'processed',
    });
  }

  const settledAudit = {
    event: 'payments.webhook_settled',
    resource: 'payment_orders',
    action: 'webhook_settle',
    outcome: 'allowed' as const,
    statusCode: 200,
    metadata: {
      provider,
      eventId,
      orderId: parsed.data.orderId,
      idempotencyRecorded: !idempotencyTableMissing,
    },
  };
  logAuditEvent(settledAudit);
  await persistServerAuditLog(settledAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      duplicate: false,
      settled: order,
      idempotencyRecorded: !idempotencyTableMissing,
    }),
    limitCheck.rateLimit,
  );
}
