import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json(
        { error: 'Configuração do Supabase ausente na Edge Function.' },
        { status: 500, headers: corsHeaders },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json(
        { error: 'Autenticação necessária.' },
        { status: 401, headers: corsHeaders },
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json().catch(() => null);
    const amountCents = Number(body?.amount_cents ?? 0);
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null;

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return Response.json(
        { error: 'Informe um valor inteiro positivo em centavos.' },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await userClient.rpc('request_commission_anticipation', {
      target_amount_cents: amountCents,
      target_notes: notes,
    });

    if (error) {
      return Response.json(
        { error: error.message || 'Não foi possível solicitar a antecipação.' },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        protocol: data.protocol,
        requested_cents: data.requested_cents,
        status: data.status,
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Erro interno ao processar antecipação.',
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
