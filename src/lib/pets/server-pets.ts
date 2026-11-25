import { z } from 'zod';
import {
  isEmailConfirmedUser,
  normalizeUserRole,
  type EmailConfirmableUser,
  type UserRole,
} from '../auth/guards';
import {
  matchesTextQuery,
  paginateItems,
  type PaginationMeta,
} from '../pagination';
import { createPetSchema, updatePetSchema } from '../validations';
import { isSchemaMissingError, toFriendlyError } from '../../services/errors';
import type { OrganizationRole } from '../../types/database';
import type { Pet } from '../../types/entities';

export const PET_COLUMNS =
  'id, owner_id, name, species, breed, birth_date, sex, notes, created_at, updated_at';

export type PetsScope = 'mine' | 'patients' | 'all';

export interface AuthUserLike extends EmailConfirmableUser {
  id: string;
}

export interface PetsDataClient {
  getProfileRole(userId: string): Promise<{ role: UserRole; error: unknown }>;
  getOrganizationRoles(userId: string): Promise<{ roles: OrganizationRole[]; error: unknown }>;
  isApprovedVeterinarian(userId: string): Promise<{ approved: boolean; error: unknown }>;
  listPetsByOwner(ownerId: string, petId?: string | null): Promise<{ data: Pet[] | null; error: unknown }>;
  listAppointmentPetIdsForVet(vetId: string): Promise<{ petIds: string[]; error: unknown }>;
  listPetsByIds(petIds: string[], petId?: string | null): Promise<{ data: Pet[] | null; error: unknown }>;
  listAllPets(petId?: string | null): Promise<{ data: Pet[] | null; error: unknown }>;
  findPetById(petId: string): Promise<{ data: Pet | null; error: unknown }>;
  insertPet(values: {
    owner_id: string;
    name: string;
    species: string;
    breed: string | null;
    birth_date: string | null;
    sex: 'female' | 'male' | 'unknown' | null;
    notes: string | null;
  }): Promise<{ data: Pet | null; error: unknown }>;
  updatePet(
    petId: string,
    ownerId: string | null,
    values: Record<string, unknown>,
  ): Promise<{ data: Pet | null; error: unknown }>;
  deletePet(petId: string, ownerId: string | null): Promise<{ error: unknown }>;
}

export type PetServiceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string; details?: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabasePetsDataClient(supabase: any): PetsDataClient {
  return {
    async getProfileRole(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      return { role: normalizeUserRole(data?.role), error };
    },
    async getOrganizationRoles(userId) {
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', userId);
      const roles = Array.isArray(data)
        ? (data.map((row: { role?: OrganizationRole }) => row.role).filter(Boolean) as OrganizationRole[])
        : [];
      return { roles, error };
    },
    async isApprovedVeterinarian(userId) {
      const { data, error } = await supabase
        .from('veterinarian_profiles')
        .select('user_id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .limit(1);
      return { approved: Array.isArray(data) && data.length > 0, error };
    },
    async listPetsByOwner(ownerId, petId) {
      let query = supabase
        .from('pets')
        .select(PET_COLUMNS)
        .eq('owner_id', ownerId)
        .order('name');
      if (petId) query = query.eq('id', petId);
      const { data, error } = await query;
      return { data: (data as Pet[] | null) ?? null, error };
    },
    async listAppointmentPetIdsForVet(vetId) {
      const { data, error } = await supabase
        .from('appointments')
        .select('pet_id')
        .eq('veterinarian_id', vetId)
        .limit(500);
      const petIds = Array.isArray(data)
        ? Array.from(
            new Set(
              data
                .map((row: { pet_id?: string | null }) => row.pet_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
            ),
          )
        : [];
      return { petIds, error };
    },
    async listPetsByIds(petIds, petId) {
      if (petIds.length === 0) return { data: [], error: null };
      let query = supabase
        .from('pets')
        .select(PET_COLUMNS)
        .in('id', petIds)
        .order('name');
      if (petId) query = query.eq('id', petId);
      const { data, error } = await query;
      return { data: (data as Pet[] | null) ?? null, error };
    },
    async listAllPets(petId) {
      let query = supabase
        .from('pets')
        .select(PET_COLUMNS)
        .order('name')
        .limit(500);
      if (petId) query = query.eq('id', petId);
      const { data, error } = await query;
      return { data: (data as Pet[] | null) ?? null, error };
    },
    async findPetById(petId) {
      const { data, error } = await supabase
        .from('pets')
        .select(PET_COLUMNS)
        .eq('id', petId)
        .maybeSingle();
      return { data: (data as Pet | null) ?? null, error };
    },
    async insertPet(values) {
      const { data, error } = await supabase
        .from('pets')
        .insert(values)
        .select(PET_COLUMNS)
        .single();
      return { data: (data as Pet | null) ?? null, error };
    },
    async updatePet(petId, ownerId, values) {
      let query = supabase
        .from('pets')
        .update(values)
        .eq('id', petId);
      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }
      const { data, error } = await query.select(PET_COLUMNS).single();
      return { data: (data as Pet | null) ?? null, error };
    },
    async deletePet(petId, ownerId) {
      let query = supabase.from('pets').delete().eq('id', petId);
      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }
      const { error } = await query;
      return { error };
    },
  };
}

function dbFailure(error: unknown, fallbackMessage: string): PetServiceResult<never> {
  if (isSchemaMissingError(error)) {
    return {
      ok: false,
      status: 503,
      code: 'SCHEMA_MISSING',
      error: toFriendlyError(error, fallbackMessage).message,
    };
  }
  return {
    ok: false,
    status: 500,
    error: fallbackMessage,
  };
}

function validateConfirmedUser(
  user: AuthUserLike | null | undefined,
): PetServiceResult<AuthUserLike> {
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: 'Autenticação necessária.',
    };
  }
  if (!isEmailConfirmedUser(user)) {
    return {
      ok: false,
      status: 403,
      code: 'EMAIL_NOT_CONFIRMED',
      error: 'Confirme seu e-mail pelo link enviado antes de acessar os dados de pets.',
    };
  }
  return { ok: true, status: 200, data: user };
}

function applyPetSearchAndPagination(
  pets: Pet[],
  options: { q?: string | null; page?: number; limit?: number },
): { pets: Pet[]; pagination: PaginationMeta } {
  const query = options.q?.trim() ?? '';
  const filtered = query
    ? pets.filter((pet) =>
        matchesTextQuery([pet.name, pet.species, pet.breed, pet.notes], query),
      )
    : pets;

  const { items, pagination } = paginateItems(filtered, {
    page: options.page ?? 1,
    limit: options.limit ?? 50,
  });

  return { pets: items, pagination };
}

export async function listAuthorizedPets(
  client: PetsDataClient,
  user: AuthUserLike | null | undefined,
  options: {
    scope?: string | null;
    petId?: string | null;
    q?: string | null;
    page?: number;
    limit?: number;
  } = {},
): Promise<PetServiceResult<{ pets: Pet[]; pagination: PaginationMeta }>> {
  const authCheck = validateConfirmedUser(user);
  if (!authCheck.ok) return authCheck;
  const currentUser = authCheck.data;

  const rawScope = options.scope?.trim() || 'mine';
  if (rawScope !== 'mine' && rawScope !== 'patients' && rawScope !== 'all') {
    return {
      ok: false,
      status: 400,
      error: 'Escopo de consulta inválido.',
    };
  }
  const scope: PetsScope = rawScope;

  let petId: string | null = null;
  if (options.petId) {
    const parsedPetId = z.string().uuid().safeParse(options.petId);
    if (!parsedPetId.success) {
      return { ok: false, status: 400, error: 'Identificador de pet inválido.' };
    }
    petId = parsedPetId.data;
  }

  const { role, error: profileError } = await client.getProfileRole(currentUser.id);
  if (profileError) {
    return dbFailure(profileError, 'Não foi possível validar suas permissões de perfil.');
  }

  if (scope === 'mine') {
    const { data, error } = await client.listPetsByOwner(currentUser.id, petId);
    if (error) {
      return dbFailure(error, 'Não foi possível carregar os pets.');
    }

    // Defense-in-depth: never return pets from other tutors even if DB filtering/RLS fails.
    const ownPets = (data ?? []).filter(
      (pet) => pet.owner_id === currentUser.id && (!petId || pet.id === petId),
    );
    if (petId && ownPets.length === 0) {
      return { ok: false, status: 404, error: 'Pet não encontrado ou sem acesso.' };
    }
    return {
      ok: true,
      status: 200,
      data: applyPetSearchAndPagination(ownPets, options),
    };
  }

  if (scope === 'patients') {
    const [{ roles: orgRoles, error: orgError }, { approved, error: vetError }] =
      await Promise.all([
        client.getOrganizationRoles(currentUser.id),
        client.isApprovedVeterinarian(currentUser.id),
      ]);
    if (orgError || vetError) {
      return dbFailure(
        orgError ?? vetError,
        'Não foi possível validar vínculo profissional.',
      );
    }

    const canAccessPatients =
      role === 'admin' ||
      role === 'veterinarian' ||
      approved ||
      orgRoles.includes('veterinarian');
    if (!canAccessPatients) {
      return {
        ok: false,
        status: 403,
        error: 'Acesso restrito a médicos-veterinários autorizados.',
      };
    }

    if (role === 'admin') {
      const { data, error } = await client.listAllPets(petId);
      if (error) {
        return dbFailure(error, 'Não foi possível carregar os pacientes.');
      }
      const list = (data ?? []).filter((pet) => !petId || pet.id === petId);
      if (petId && list.length === 0) {
        return { ok: false, status: 404, error: 'Paciente não encontrado.' };
      }
      return {
        ok: true,
        status: 200,
        data: applyPetSearchAndPagination(list, options),
      };
    }

    const { petIds, error: apptError } = await client.listAppointmentPetIdsForVet(
      currentUser.id,
    );
    if (apptError) {
      return dbFailure(apptError, 'Não foi possível validar os pacientes atendidos.');
    }

    const allowedPetIds = new Set(petIds);
    if (petId && !allowedPetIds.has(petId)) {
      return {
        ok: false,
        status: 403,
        error: 'Você só pode visualizar pacientes vinculados aos seus atendimentos.',
      };
    }

    if (allowedPetIds.size === 0) {
      return {
        ok: true,
        status: 200,
        data: applyPetSearchAndPagination([], options),
      };
    }

    const { data, error } = await client.listPetsByIds(Array.from(allowedPetIds), petId);
    if (error) {
      return dbFailure(error, 'Não foi possível carregar os pacientes vinculados.');
    }

    const authorizedPets = (data ?? []).filter((pet) => allowedPetIds.has(pet.id));
    return {
      ok: true,
      status: 200,
      data: applyPetSearchAndPagination(authorizedPets, options),
    };
  }

  // scope === 'all'
  if (role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'Apenas administradores podem listar todos os pets da plataforma.',
    };
  }

  const { data, error } = await client.listAllPets(petId);
  if (error) {
    return dbFailure(error, 'Não foi possível carregar os pets.');
  }
  const list = (data ?? []).filter((pet) => !petId || pet.id === petId);
  if (petId && list.length === 0) {
    return { ok: false, status: 404, error: 'Pet não encontrado.' };
  }
  return {
    ok: true,
    status: 200,
    data: applyPetSearchAndPagination(list, options),
  };
}

export async function createAuthorizedPet(
  client: PetsDataClient,
  user: AuthUserLike | null | undefined,
  body: unknown,
): Promise<PetServiceResult<{ pet: Pet }>> {
  const authCheck = validateConfirmedUser(user);
  if (!authCheck.ok) return authCheck;
  const currentUser = authCheck.data;

  const parsed = createPetSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
      details: parsed.error.flatten(),
    };
  }

  const { data, error } = await client.insertPet({
    owner_id: currentUser.id,
    name: parsed.data.name,
    species: parsed.data.species,
    breed: parsed.data.breed || null,
    birth_date: parsed.data.birth_date || null,
    sex: parsed.data.sex ?? null,
    notes: parsed.data.notes || null,
  });

  if (error || !data) {
    return dbFailure(error, 'Não foi possível cadastrar o pet.');
  }

  return { ok: true, status: 201, data: { pet: data } };
}

export async function updateAuthorizedPet(
  client: PetsDataClient,
  user: AuthUserLike | null | undefined,
  body: unknown,
): Promise<PetServiceResult<{ pet: Pet }>> {
  const authCheck = validateConfirmedUser(user);
  if (!authCheck.ok) return authCheck;
  const currentUser = authCheck.data;

  const parsed = updatePetSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos para atualizar o pet.',
      details: parsed.error.flatten(),
    };
  }

  const { role, error: profileError } = await client.getProfileRole(currentUser.id);
  if (profileError) {
    return dbFailure(profileError, 'Não foi possível validar suas permissões.');
  }

  const { data: existing, error: findError } = await client.findPetById(parsed.data.id);
  if (findError) {
    return dbFailure(findError, 'Não foi possível localizar o pet.');
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Pet não encontrado.' };
  }
  if (existing.owner_id !== currentUser.id && role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'Você não tem permissão para editar este pet.',
    };
  }

  const fields = parsed.data;
  const updatePayload: Record<string, unknown> = {};
  if (fields.name !== undefined) updatePayload.name = fields.name;
  if (fields.species !== undefined) updatePayload.species = fields.species;
  if (fields.breed !== undefined) updatePayload.breed = fields.breed || null;
  if (fields.birth_date !== undefined) updatePayload.birth_date = fields.birth_date || null;
  if (fields.sex !== undefined) updatePayload.sex = fields.sex ?? null;
  if (fields.notes !== undefined) updatePayload.notes = fields.notes || null;

  if (Object.keys(updatePayload).length === 0) {
    return { ok: true, status: 200, data: { pet: existing } };
  }

  const scopedOwnerId = role === 'admin' ? null : currentUser.id;
  const { data, error } = await client.updatePet(parsed.data.id, scopedOwnerId, updatePayload);
  if (error || !data) {
    return dbFailure(error, 'Não foi possível atualizar os dados do pet.');
  }

  return { ok: true, status: 200, data: { pet: data } };
}

export async function deleteAuthorizedPet(
  client: PetsDataClient,
  user: AuthUserLike | null | undefined,
  rawPetId: string | null | undefined,
): Promise<PetServiceResult<{ deleted: true }>> {
  const authCheck = validateConfirmedUser(user);
  if (!authCheck.ok) return authCheck;
  const currentUser = authCheck.data;

  const parsedId = z.string().uuid('Identificador do pet inválido.').safeParse(rawPetId);
  if (!parsedId.success) {
    return {
      ok: false,
      status: 400,
      error: parsedId.error.issues[0]?.message ?? 'Identificador de pet inválido.',
    };
  }

  const { role, error: profileError } = await client.getProfileRole(currentUser.id);
  if (profileError) {
    return dbFailure(profileError, 'Não foi possível validar suas permissões.');
  }

  const { data: existing, error: findError } = await client.findPetById(parsedId.data);
  if (findError) {
    return dbFailure(findError, 'Não foi possível localizar o pet.');
  }
  if (!existing) {
    return { ok: false, status: 404, error: 'Pet não encontrado.' };
  }
  if (existing.owner_id !== currentUser.id && role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error: 'Você não tem permissão para excluir este pet.',
    };
  }

  const scopedOwnerId = role === 'admin' ? null : currentUser.id;
  const { error } = await client.deletePet(parsedId.data, scopedOwnerId);
  if (error) {
    return dbFailure(
      error,
      'Não foi possível excluir este pet (ele pode possuir consultas vinculadas).',
    );
  }

  return { ok: true, status: 200, data: { deleted: true } };
}
