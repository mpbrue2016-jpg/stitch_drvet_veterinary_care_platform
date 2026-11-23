import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados de checkout inválidos.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
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
    return supabaseErrorResponse(
      orderError,
      orderError?.message || 'Não foi possível gerar a cobrança da consulta.',
      status,
    );
  }

  if (parsed.data.method !== 'pix') {
    return NextResponse.json({ order: baseOrder });
  }

  let pixPayload: string | null = baseOrder.pix_payload ?? null;
  let providerPaymentId: string | null = baseOrder.provider_payment_id ?? null;

  // Integração real opcional com Mercado Pago quando credencial privada está no servidor.
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
            email: authData.user.email || 'tutor@drvets.com.br',
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

  if (updateError) {
    return NextResponse.json({
      order: { ...baseOrder, pix_payload: pixPayload, provider_payment_id: providerPaymentId },
    });
  }

  return NextResponse.json({ order: updatedOrder });
}
