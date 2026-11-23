import { getSupabaseClient } from '@/lib/supabase';
import type { UserRole } from '@/types/database';
import type {
  IntegrationConfig,
  IntegrationEnvironment,
  IntegrationProvider,
  RoleApplication,
  UserProfile,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export async function listarUsuariosAdmin(): Promise<{
  users: UserProfile[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw error;
    return {
      users: (data ?? []).map((row) => ({
        ...row,
        email: row.email ?? undefined,
      })),
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar a lista de usuários (acesso administrativo).',
    );
  }
}

export async function atualizarRoleUsuarioAdmin(input: {
  userId: string;
  role: UserRole;
}): Promise<{ user: UserProfile }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('admin_update_user_role', {
      target_user: input.userId,
      next_role: input.role,
    });
    if (error) throw error;
    return {
      user: {
        ...data,
        email: data.email ?? undefined,
      },
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar a permissão deste usuário.',
    );
  }
}

export async function listarIntegracoes(): Promise<{
  integrations: IntegrationConfig[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('integration_configs')
      .select(
        'id, organization_id, provider, environment, webhook_endpoint, active, last_status, last_checked_at',
      )
      .order('provider');

    if (error) throw error;
    return { integrations: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar as configurações de integração.',
    );
  }
}

export async function salvarIntegracao(input: {
  organization_id?: string | null;
  provider: IntegrationProvider;
  environment: IntegrationEnvironment;
  webhook_endpoint: string;
  active: boolean;
}): Promise<{ integration: IntegrationConfig }> {
  try {
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('integration_configs')
      .select('id')
      .eq('provider', input.provider)
      .maybeSingle();

    const payload = {
      organization_id: input.organization_id ?? null,
      provider: input.provider,
      environment: input.environment,
      webhook_endpoint: input.webhook_endpoint.trim(),
      active: input.active,
      last_status: input.active ? 'pending_test' : 'paused',
      last_checked_at: null,
    };

    const query = existing
      ? supabase
          .from('integration_configs')
          .update(payload)
          .eq('id', existing.id)
      : supabase.from('integration_configs').insert(payload);

    const { data, error } = await query
      .select(
        'id, organization_id, provider, environment, webhook_endpoint, active, last_status, last_checked_at',
      )
      .single();

    if (error) throw error;
    return { integration: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível salvar a configuração da integração.',
    );
  }
}

export async function testarIntegracao(
  integrationId: string,
): Promise<{ integration: IntegrationConfig; reachable: boolean }> {
  const response = await fetch('/api/admin/integrations/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationId }),
  });

  const payload = (await response.json().catch(() => null)) as {
    integration?: IntegrationConfig;
    reachable?: boolean;
    error?: string;
  } | null;

  if (!response.ok || !payload?.integration) {
    throw new Error(
      payload?.error || 'Não foi possível validar o endpoint informado.',
    );
  }

  return {
    integration: payload.integration,
    reachable: Boolean(payload.reachable),
  };
}

export async function listarSolicitacoesPerfil(): Promise<{
  applications: RoleApplication[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('role_applications')
      .select(
        'id, user_id, requested_role, organization_name, document_id, registration_region, specialty, city, state, status, reviewer_notes, reviewed_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return { applications: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar as solicitações de credenciamento.',
    );
  }
}

export async function avaliarSolicitacaoPerfil(input: {
  applicationId: string;
  approve: boolean;
  notes?: string;
}): Promise<{ application: RoleApplication }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('review_role_application', {
      target_application: input.applicationId,
      approve: input.approve,
      target_notes: input.notes?.trim() || null,
    });

    if (error) throw error;
    return { application: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar a avaliação deste credenciamento.',
    );
  }
}
