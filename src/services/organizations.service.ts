import { getSupabaseClient } from '@/lib/supabase';
import type { Organization, VeterinarianProfile } from '@/types/entities';
import { toFriendlyError } from './errors';

export async function listarOrganizacoesEVeterinarios(): Promise<{
  organizations: Organization[];
  professionals: VeterinarianProfile[];
  currentUserId: string;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para consultar as organizações.');
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', authData.user.id);

    if (membershipError) throw membershipError;

    const organizationIds = (memberships ?? []).map(
      (membership) => membership.organization_id,
    );
    if (organizationIds.length === 0) {
      return {
        organizations: [],
        professionals: [],
        currentUserId: authData.user.id,
      };
    }

    const [
      { data: organizations, error: organizationError },
      { data: professionals, error: professionalError },
    ] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, created_at')
        .in('id', organizationIds),
      supabase
        .from('veterinarian_profiles')
        .select(
          'organization_id, user_id, registration_number, registration_region, specialty, status, created_at',
        )
        .in('organization_id', organizationIds),
    ]);

    if (organizationError) throw organizationError;
    if (professionalError) throw professionalError;

    const professionalUserIds = Array.from(
      new Set((professionals ?? []).map((item) => item.user_id)),
    );
    const { data: profileRows } =
      professionalUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', professionalUserIds)
        : { data: [] };

    const displayNameById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile.display_name]),
    );

    return {
      organizations: (organizations ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name,
        created_at: organization.created_at,
        role:
          memberships.find(
            (membership) => membership.organization_id === organization.id,
          )?.role ?? 'staff',
      })),
      professionals: (professionals ?? []).map((professional) => ({
        ...professional,
        display_name: displayNameById.get(professional.user_id) || undefined,
      })),
      currentUserId: authData.user.id,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar as organizações.');
  }
}

export async function criarOrganizacao(
  name: string,
): Promise<{ organization: Organization }> {
  try {
    const supabase = getSupabaseClient();
    const { data: orgId, error } = await supabase.rpc('create_organization', {
      organization_name: name.trim(),
    });
    if (error || !orgId) throw error ?? new Error('Falha ao criar organização.');

    const { data: organization, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('id', orgId)
      .single();

    if (fetchError) throw fetchError;

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        role: 'owner',
        created_at: organization.created_at,
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível criar a organização.');
  }
}

export async function registrarVeterinario(input: {
  organization_id: string;
  user_id: string;
  registration_number: string;
  registration_region: string;
  specialty?: string;
}): Promise<{ professional: VeterinarianProfile }> {
  try {
    const supabase = getSupabaseClient();
    const region = input.registration_region.trim().toUpperCase();
    const { error } = await supabase.rpc('add_veterinarian', {
      target_organization: input.organization_id,
      target_user: input.user_id.trim(),
      target_registration_number: input.registration_number.trim(),
      target_registration_region: region,
      target_specialty: input.specialty?.trim() || null,
    });
    if (error) throw error;

    const { data: professional, error: fetchError } = await supabase
      .from('veterinarian_profiles')
      .select(
        'organization_id, user_id, registration_number, registration_region, specialty, status, created_at',
      )
      .eq('organization_id', input.organization_id)
      .eq('user_id', input.user_id.trim())
      .single();

    if (fetchError) throw fetchError;
    return { professional };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar o profissional. Confira o ID do usuário e o CRMV.',
    );
  }
}

export async function aprovarVeterinario(input: {
  organization_id: string;
  user_id: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('approve_veterinarian', {
      target_organization: input.organization_id,
      target_user: input.user_id,
    });
    if (error) throw error;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível aprovar o profissional.');
  }
}
