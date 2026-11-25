import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { buildPixBrCode } from '@/lib/payments/pix';

const checkoutSchema = z
  .object({
    appointmentId: z.string().uuid('Agendamento inválido.'),
    method: z.enum(['pix', 'credit_card', 'voucher']).default('pix'),
    couponCode: z.string().trim().max(32).nullable().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:payments:checkout',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados de checkout inválidos.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: baseOrder, error: orderError } = await supabase.rpc(
    'create_pending_appointment_order',
    {
      target_appointment: parsed.data.appointmentId,
      target_method: parsed.data.method,
      target_coupon: parsed.data.couponCode ?? null,
    },
  );

  if (orderError || !baseOrder) {
    const status =
      orderError?.code === '42501'
        ? 403
        : orderError?.code === '23505'
          ? 409
          : orderError?.code === '22023'
            ? 400
            : 500;
    logAuditEvent({
      event: 'payments.checkout_failed',
      resource: 'payment_orders',
      action: 'checkout',
      outcome: status === 403 ? 'denied' : 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { appointmentId: parsed.data.appointmentId, method: parsed.data.method },
    });
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        orderError,
        orderError?.message || 'Não foi possível gerar a cobrança da consulta.',
        status,
      ),
      rateLimit,
    );
  }

  if (parsed.data.method !== 'pix') {
    logAuditEvent({
      event: 'payments.checkout_created',
      resource: 'payment_orders',
      action: 'checkout',
      outcome: 'allowed',
      actorId: authUser.id,
      statusCode: 200,
      requestId,
      metadata: { orderId: baseOrder.id, method: parsed.data.method },
    });
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ order: baseOrder }),
      rateLimit,
    );
  }

  let pixPayload: string | null = baseOrder.pix_payload ?? null;
  let providerPaymentId: string | null = baseOrder.provider_payment_id ?? null;

  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (mpToken && baseOrder.net_amount_cents > 0 && !providerPaymentId) {
    try {
      const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mpToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': baseOrder.id,
        },
        body: JSON.stringify({
          transaction_amount: Number((baseOrder.net_amount_cents / 100).toFixed(2)),
          description: baseOrder.description,
          payment_method_id: 'pix',
          external_reference: baseOrder.id,
          payer: {
            email: authUser.email || 'tutor@drvets.com.br',
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (mpRes.ok) {
        const mpJson = (await mpRes.json().catch(() => null)) as {
          id?: string | number;
          point_of_interaction?: {
            transaction_data?: { qr_code?: string };
          };
        } | null;
        const qr = mpJson?.point_of_interaction?.transaction_data?.qr_code;
        if (qr) {
          pixPayload = qr;
          providerPaymentId = mpJson?.id ? `MP-${String(mpJson.id)}` : null;
        }
      }
    } catch {
      // Fallback para BR-Code EMVCo padrão caso gateway externo esteja indisponível.
    }
  }

  if (!pixPayload) {
    pixPayload = buildPixBrCode({
      amountCents: baseOrder.net_amount_cents,
      txid: baseOrder.external_reference || baseOrder.id.slice(0, 20),
      description: baseOrder.description,
    });
  }

  const { data: updatedOrder, error: updateError } = await supabase.rpc(
    'create_pending_appointment_order',
    {
      target_appointment: parsed.data.appointmentId,
      target_method: parsed.data.method,
      target_coupon: parsed.data.couponCode ?? null,
      target_pix_payload: pixPayload,
      target_provider_id: providerPaymentId,
    },
  );

  const gatewayMode = providerPaymentId ? 'mercado_pago_pix' : 'static_pix_brcode';
  const gatewayConfigured = Boolean(mpToken);

  logAuditEvent({
    event: 'payments.checkout_created',
    resource: 'payment_orders',
    action: 'checkout',
    outcome: 'allowed',
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      orderId: baseOrder.id,
      method: parsed.data.method,
      gatewayMode,
      gatewayConfigured,
    },
  });

  if (updateError) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        order: { ...baseOrder, pix_payload: pixPayload, provider_payment_id: providerPaymentId },
        gatewayMode,
        gatewayConfigured,
      }),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      order: updatedOrder,
      gatewayMode,
      gatewayConfigured,
    }),
    rateLimit,
  );
}
