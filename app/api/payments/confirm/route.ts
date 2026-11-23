import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const confirmPaymentSchema = z
  .object({
    orderId: z.string().uuid('Identificador do pagamento inválido.'),
    externalReference: z.string().trim().max(80).nullable().optional(),
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
  const parsed = confirmPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos para baixa financeira.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data: order, error } = await supabase.rpc('settle_payment_order', {
    target_order_id: parsed.data.orderId,
    target_reference: parsed.data.externalReference ?? null,
  });

  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 500;
    return supabaseErrorResponse(
      error,
      error.message || 'Não foi possível confirmar a baixa deste pagamento.',
      status,
    );
  }

  return NextResponse.json({ order });
}
