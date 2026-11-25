import { getSupabaseClient } from '@/lib/supabase';
import type { LegalAcknowledgement, RoleApplication } from '@/types/entities';
import { toFriendlyError } from './errors';

export async function listarCientesLegais(): Promise<{
  acknowledgements: LegalAcknowledgement[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return { acknowledgements: [] };

    const { data, error } = await supabase
      .from('legal_acknowledgements')
      .select('id, user_id, document_key, document_version, acknowledged_at')
      .eq('user_id', authData.user.id)
      .order('acknowledged_at', { ascending: false });

    if (error) throw error;
    return { acknowledgements: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível consultar termos aceitos.');
  }
}

export async function registrarCienciaLegal(input: {
  documentKey: string;
  documentVersion: string;
}): Promise<{ acknowledgement: LegalAcknowledgement }> {
  try {
    const response = await fetch('/api/legal-acknowledgements', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentKey: input.documentKey,
        documentVersion: input.documentVersion,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      acknowledgement?: LegalAcknowledgement;
      error?: string;
    } | null;

    if (!response.ok || !payload?.acknowledgement) {
      throw new Error(
        payload?.error || 'Não foi possível registrar sua ciência do documento.',
      );
    }

    return { acknowledgement: payload.acknowledgement };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar sua ciência do documento.',
    );
  }
}

export async function listarMinhasSolicitacoesPerfil(): Promise<{
  applications: RoleApplication[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return { applications: [] };

    const { data, error } = await supabase
      .from('role_applications')
      .select(
        'id, user_id, requested_role, organization_name, document_id, registration_region, specialty, city, state, avatar_path, status, reviewer_notes, reviewed_at, created_at',
      )
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { applications: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível consultar suas solicitações de credenciamento.',
    );
  }
}

export async function enviarSolicitacaoPerfil(input: {
  requested_role: 'veterinarian' | 'partner';
  organization_name: string;
  document_id: string;
  registration_region?: string | null;
  specialty?: string | null;
  city?: string | null;
  state?: string | null;
  avatar_path?: string | null;
}): Promise<{ application: RoleApplication }> {
  try {
    const response = await fetch('/api/role-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_role: input.requested_role,
        organization_name: input.organization_name.trim(),
        document_id: input.document_id.trim(),
        registration_region: input.registration_region?.trim().toUpperCase() || null,
        specialty: input.specialty?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim().toUpperCase() || null,
        avatar_path: input.avatar_path?.trim() || null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      application?: RoleApplication;
    };
    if (!response.ok || !payload.application) {
      throw new Error(
        payload.error || 'Não foi possível enviar sua solicitação de credenciamento.',
      );
    }
    return { application: payload.application };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível enviar sua solicitação de credenciamento.',
    );
  }
}
