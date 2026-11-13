import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

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
  const providedSecret = req.headers.get('x-webhook-secret');
  if (!webhookSecret || providedSecret !== webhookSecret) {
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
  const reference = typeof payload?.reference === 'string' ? payload.reference.trim() : '';
  const nextStatus = payload?.status;

  if (
    !reference ||
    !['available', 'pending', 'paid'].includes(String(nextStatus))
  ) {
    return Response.json(
      { error: 'Payload inválido: informe reference e status válido.' },
      { status: 400, headers: corsHeaders },
    );
  }

  // service_role usado exclusivamente no servidor (Edge Function) para conciliação via webhook.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
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
