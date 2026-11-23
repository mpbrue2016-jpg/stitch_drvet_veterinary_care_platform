import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return Response.json(
      { error: 'Método não permitido.' },
      { status: 405, headers: corsHeaders },
    );
  }

  const webhookSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('x-webhook-secret') ?? '';
  if (!webhookSecret || !timingSafeEqualString(providedSecret, webhookSecret)) {
    return Response.json(
      { error: 'Assinatura do webhook inválida.' },
      { status: 401, headers: corsHeaders },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: 'Variáveis de ambiente do servidor não configuradas.' },
      { status: 500, headers: corsHeaders },
    );
  }

  const payload = await req.json().catch(() => null);
  const orderId = typeof payload?.orderId === 'string' ? payload.orderId.trim() : '';
  const reference = typeof payload?.reference === 'string' ? payload.reference.trim() : '';
  const nextStatus = payload?.status;

  // service_role usado exclusivamente no servidor (Edge Function) para conciliação via webhook.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (orderId) {
    const { data: settledOrder, error: settleError } = await adminClient.rpc(
      'settle_payment_order',
      {
        target_order_id: orderId,
        target_reference: reference || null,
      },
    );

    if (settleError) {
      return Response.json(
        { error: settleError.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json({ settled: settledOrder }, { status: 200, headers: corsHeaders });
  }

  if (
    !reference ||
    !['available', 'pending', 'paid'].includes(String(nextStatus))
  ) {
    return Response.json(
      { error: 'Payload inválido: informe orderId ou reference e status válido.' },
      { status: 400, headers: corsHeaders },
    );
  }

  const { data, error } = await adminClient
    .from('commission_ledger')
    .update({ status: nextStatus })
    .eq('reference', reference)
    .select('id, reference, status')
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!data) {
    return Response.json(
      { error: 'Lançamento não encontrado.' },
      { status: 404, headers: corsHeaders },
    );
  }

  return Response.json({ updated: data }, { status: 200, headers: corsHeaders });
});
