import { getSupabaseClient } from '@/lib/supabase';
import type {
  Organization,
  PublicVeterinarian,
  VeterinarianProfile,
} from '@/types/entities';
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
          'organization_id, user_id, registration_number, registration_region, specialty, status, consultation_fee_cents, bio, is_online_now, avatar_path, created_at',
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
    const response = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      organization?: Organization;
    };
    if (!response.ok || !payload.organization) {
      throw new Error(payload.error || 'Não foi possível criar a organização.');
    }
    return { organization: payload.organization };
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
  avatar_path?: string | null;
}): Promise<{ professional: VeterinarianProfile }> {
  try {
    const response = await fetch('/api/organizations/veterinarians', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: input.organization_id,
        user_id: input.user_id.trim(),
        registration_number: input.registration_number.trim(),
        registration_region: input.registration_region.trim().toUpperCase(),
        specialty: input.specialty?.trim() || null,
        avatar_path: input.avatar_path?.trim() || null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      professional?: VeterinarianProfile;
    };
    if (!response.ok || !payload.professional) {
      throw new Error(
        payload.error ||
          'Não foi possível registrar o profissional. Confira o ID do usuário e o CRMV.',
      );
    }
    return { professional: payload.professional };
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
    const response = await fetch('/api/organizations/veterinarians', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: input.organization_id,
        user_id: input.user_id,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      status?: string;
    };
    if (!response.ok || payload.status !== 'approved') {
      throw new Error(payload.error || 'Não foi possível aprovar o profissional.');
    }
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível aprovar o profissional.');
  }
}

export async function listarVeterinariosAprovados(): Promise<{
  professionals: VeterinarianProfile[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: professionals, error } = await supabase
      .from('veterinarian_profiles')
      .select(
        'organization_id, user_id, registration_number, registration_region, specialty, status, consultation_fee_cents, bio, is_online_now, avatar_path, created_at',
      )
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = professionals ?? [];
    const userIds = Array.from(new Set(rows.map((item) => item.user_id)));
    const { data: profileRows } =
      userIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', userIds)
        : { data: [] };

    const displayNameById = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile.display_name]),
    );

    return {
      professionals: rows.map((professional) => ({
        ...professional,
        display_name: displayNameById.get(professional.user_id) || undefined,
      })),
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar os médicos-veterinários credenciados.',
    );
  }
}

export async function buscarCatalogoPublicoVeterinarios(): Promise<{
  veterinarians: PublicVeterinarian[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_public_veterinarians');
    if (error) throw error;
    return { veterinarians: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar o catálogo público de veterinários.',
    );
  }
}

export async function atualizarMeuPerfilVeterinario(input: {
  consultation_fee_cents: number;
  bio?: string | null;
  is_online_now?: boolean;
  avatar_path?: string | null;
}): Promise<{ professional: VeterinarianProfile }> {
  try {
    const response = await fetch('/api/organizations/veterinarians', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consultation_fee_cents: input.consultation_fee_cents,
        bio: input.bio?.trim() || null,
        is_online_now:
          typeof input.is_online_now === 'boolean'
            ? input.is_online_now
            : undefined,
        avatar_path: input.avatar_path?.trim() || null,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      professional?: VeterinarianProfile;
    };
    if (!response.ok || !payload.professional) {
      throw new Error(
        payload.error || 'Não foi possível atualizar seu perfil profissional.',
      );
    }
    return { professional: payload.professional };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar seu perfil profissional.',
    );
  }
}

