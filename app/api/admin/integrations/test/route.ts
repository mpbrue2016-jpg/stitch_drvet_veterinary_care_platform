import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { validateSafeExternalUrl } from '@/lib/security/ssrf';

const testIntegrationSchema = z
  .object({
    integrationId: z.string().uuid('Identificador de integração inválido.'),
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
  const parsed = testIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Informe uma integração válida para testar.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const [{ data: profile, error: profileError }, { data: config, error: configError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle(),
      supabase
        .from('integration_configs')
        .select('id, organization_id, provider, webhook_endpoint')
        .eq('id', parsed.data.integrationId)
        .maybeSingle(),
    ]);

  if (profileError || configError) {
    return supabaseErrorResponse(
      profileError ?? configError,
      'Não foi possível carregar a configuração da integração.',
      500,
    );
  }

  if (!config) {
    return NextResponse.json(
      { error: 'Integração não encontrada ou sem acesso.' },
      { status: 404 },
    );
  }

  let hasOrgAdmin = false;
  if (config.organization_id) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', config.organization_id)
      .eq('user_id', authData.user.id)
      .maybeSingle();
    hasOrgAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  }

  if (profile?.role !== 'admin' && !hasOrgAdmin) {
    return NextResponse.json(
      { error: 'Apenas administradores podem testar endpoints de integração.' },
      { status: 403 },
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

    return NextResponse.json(
      { error: urlCheck.reason },
      { status: 400 },
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
    return supabaseErrorResponse(
      updateError,
      'Não foi possível salvar o resultado do teste.',
      500,
    );
  }

  return NextResponse.json({
    integration: updated,
    reachable,
  });
}
