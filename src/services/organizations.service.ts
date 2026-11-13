import type { Organization, VeterinarianProfile } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  mockDelay,
  mockOrganizations,
  mockProfessionals,
} from './mock-db';

export async function listarOrganizacoesEVeterinarios(): Promise<{
  organizations: Organization[];
  professionals: VeterinarianProfile[];
  currentUserId: string;
}> {
  // TODO(AI Studio): trocar por chamada Supabase (organizations, organization_memberships e veterinarian_profiles)
  await mockDelay();
  return {
    organizations: [...mockOrganizations],
    professionals: [...mockProfessionals],
    currentUserId: MOCK_CURRENT_USER_ID,
  };
}

export async function criarOrganizacao(name: string): Promise<{ organization: Organization }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('create_organization', { organization_name: name }))
  await mockDelay();
  const created: Organization = {
    id: `org-${Date.now()}`,
    name: name.trim(),
    role: 'owner',
    created_at: new Date().toISOString(),
  };
  mockOrganizations.push(created);
  return { organization: created };
}

export async function registrarVeterinario(input: {
  organization_id: string;
  user_id: string;
  registration_number: string;
  registration_region: string;
  specialty?: string;
}): Promise<{ professional: VeterinarianProfile }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('add_veterinarian', ...))
  await mockDelay();
  const created: VeterinarianProfile = {
    organization_id: input.organization_id,
    user_id: input.user_id.trim(),
    registration_number: input.registration_number.trim(),
    registration_region: input.registration_region.trim().toUpperCase(),
    specialty: input.specialty?.trim() || null,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  mockProfessionals.push(created);
  return { professional: created };
}

export async function aprovarVeterinario(input: {
  organization_id: string;
  user_id: string;
}): Promise<void> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('approve_veterinarian', ...))
  await mockDelay();
  const index = mockProfessionals.findIndex(
    (item) =>
      item.organization_id === input.organization_id && item.user_id === input.user_id,
  );
  if (index === -1) {
    throw new Error('Profissional não encontrado.');
  }
  mockProfessionals[index] = {
    ...mockProfessionals[index],
    status: 'approved',
  };
}
