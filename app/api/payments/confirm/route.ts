import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const confirmPaymentSchema = z
  .object({
    orderId: z.string().uuid('Identificador do pagamento inválido.'),
    externalReference: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:payments:confirm',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = confirmPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos para baixa financeira.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: order, error } = await supabase.rpc('settle_payment_order', {
    target_order_id: parsed.data.orderId,
    target_reference: parsed.data.externalReference ?? null,
  });

  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
    logAuditEvent({
      event: 'payments.confirm_failed',
      resource: 'payment_orders',
      action: 'settle',
      outcome: status === 403 ? 'denied' : 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { orderId: parsed.data.orderId },
    });
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.message || 'Não foi possível confirmar a baixa deste pagamento.',
        status,
      ),
      rateLimit,
    );
  }

  logAuditEvent({
    event: 'payments.confirmed',
    resource: 'payment_orders',
    action: 'settle',
    outcome: 'allowed',
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { orderId: parsed.data.orderId },
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ order }),
    rateLimit,
  );
}
