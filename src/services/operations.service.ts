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
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para registrar a ciência deste documento.');
    }

    const { data: existing } = await supabase
      .from('legal_acknowledgements')
      .select('id, user_id, document_key, document_version, acknowledged_at')
      .eq('user_id', authData.user.id)
      .eq('document_key', input.documentKey)
      .eq('document_version', input.documentVersion)
      .maybeSingle();

    if (existing) {
      return { acknowledgement: existing };
    }

    const { data, error } = await supabase
      .from('legal_acknowledgements')
      .insert({
        user_id: authData.user.id,
        document_key: input.documentKey,
        document_version: input.documentVersion,
      })
      .select('id, user_id, document_key, document_version, acknowledged_at')
      .single();

    if (error) throw error;
    return { acknowledgement: data };
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
        'id, user_id, requested_role, organization_name, document_id, registration_region, specialty, city, state, status, reviewer_notes, reviewed_at, created_at',
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
}): Promise<{ application: RoleApplication }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('submit_role_application', {
      target_requested_role: input.requested_role,
      target_organization_name: input.organization_name.trim(),
      target_document_id: input.document_id.trim(),
      target_registration_region: input.registration_region?.trim().toUpperCase() || null,
      target_specialty: input.specialty?.trim() || null,
      target_city: input.city?.trim() || null,
      target_state: input.state?.trim().toUpperCase() || null,
    });
    if (error) throw error;
    return { application: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível enviar sua solicitação de credenciamento.',
    );
  }
}
