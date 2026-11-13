import { getSupabaseClient } from '@/lib/supabase';
import type { UserRole } from '@/types/database';
import type {
  IntegrationConfig,
  IntegrationEnvironment,
  IntegrationProvider,
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
      last_status: input.active ? '200 OK' : 'paused',
      last_checked_at: new Date().toISOString(),
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
