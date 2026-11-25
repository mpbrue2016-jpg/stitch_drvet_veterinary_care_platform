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
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_role',
        payload: {
          userId: input.userId,
          role: input.role,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      user?: UserProfile;
    };
    if (!response.ok || !payload.user) {
      throw new Error(
        payload.error || 'Não foi possível atualizar a permissão deste usuário.',
      );
    }
    return { user: payload.user };
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
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_integration',
        payload: {
          organization_id: input.organization_id ?? null,
          provider: input.provider,
          environment: input.environment,
          webhook_endpoint: input.webhook_endpoint.trim(),
          active: input.active,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      integration?: IntegrationConfig;
    };
    if (!response.ok || !payload.integration) {
      throw new Error(
        payload.error || 'Não foi possível salvar a configuração da integração.',
      );
    }
    return { integration: payload.integration };
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
    const response = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'review_application',
        payload: {
          applicationId: input.applicationId,
          approve: input.approve,
          notes: input.notes?.trim() || undefined,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      application?: RoleApplication;
    };
    if (!response.ok || !payload.application) {
      throw new Error(
        payload.error ||
          'Não foi possível registrar a avaliação deste credenciamento.',
      );
    }
    return { application: payload.application };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar a avaliação deste credenciamento.',
    );
  }
}

export interface AdminMvpReadinessPayload {
  gateways: Array<{
    provider: 'asaas' | 'mercado_pago';
    configured: boolean;
    webhookVerificationReady: boolean;
    missingEnvVars: string[];
  }>;
  channels: {
    webPushConfigured: boolean;
    recordingPolicy: {
      policyVersion: string;
      retentionDays: number;
      storageBucket: string;
      requiresDualConsent: boolean;
      requiresPrivateEncryptedBucket: boolean;
      allowClientLocalRecording: boolean;
    };
    recordingBucketProvisioned: boolean;
    digitalSignature?: {
      mode: string;
      icpBrasilActive: boolean;
      privateKeyStoredInApp: boolean;
      canonicalHashAlgorithm: string;
      schemaVersion: string;
    };
  };
  telemetry: {
    auditSchemaReady: boolean;
    webhookSchemaReady: boolean;
    outboxSchemaReady: boolean;
    auditLogs: Array<{
      id: string;
      actor_id: string | null;
      event: string;
      resource: string;
      action: string;
      outcome: string;
      status_code: number | null;
      created_at: string;
    }>;
    webhookEvents: Array<{
      id: string;
      provider: string;
      event_id: string;
      event_type: string;
      status: string;
      processed_at: string;
    }>;
    outboxItems: Array<{
      id: string;
      channel: string;
      template_key: string;
      status: string;
      attempts: number;
      scheduled_for: string;
    }>;
  };
}

export async function buscarProntidaoMvpAdmin(): Promise<AdminMvpReadinessPayload> {
  const response = await fetch('/api/admin/mvp-readiness', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as
    | (AdminMvpReadinessPayload & { error?: string })
    | null;
  if (!response.ok || !payload?.gateways) {
    throw new Error(
      payload?.error || 'Não foi possível carregar o painel de prontidão MVP.',
    );
  }
  return payload;
}

