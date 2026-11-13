import { getSupabaseClient } from '@/lib/supabase';
import type { Pet } from '@/types/entities';
import { toFriendlyError } from './errors';

export interface CreatePetInput {
  name: string;
  species: string;
  breed?: string | null;
  birth_date?: string | null;
  sex?: 'female' | 'male' | 'unknown' | null;
  notes?: string | null;
}

export interface UpdatePetInput extends Partial<CreatePetInput> {
  id: string;
}

const PET_COLUMNS =
  'id, owner_id, name, species, breed, birth_date, sex, notes, created_at, updated_at';

export async function listarPets(): Promise<{ pets: Pet[] }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pets')
      .select(PET_COLUMNS)
      .order('name');

    if (error) throw error;
    return { pets: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os pets.');
  }
}

export async function buscarPetPorId(id: string): Promise<Pet | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pets')
      .select(PET_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os dados do pet.');
  }
}

export async function criarPet(input: CreatePetInput): Promise<{ pet: Pet }> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para cadastrar um pet.');
    }

    const { data, error } = await supabase
      .from('pets')
      .insert({
        owner_id: authData.user.id,
        name: input.name.trim(),
        species: input.species.trim(),
        breed: input.breed?.trim() || null,
        birth_date: input.birth_date || null,
        sex: input.sex ?? null,
        notes: input.notes?.trim() || null,
      })
      .select(PET_COLUMNS)
      .single();

    if (error) throw error;
    return { pet: data };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível cadastrar o pet.');
  }
}

export async function atualizarPet(input: UpdatePetInput): Promise<{ pet: Pet }> {
  try {
    const supabase = getSupabaseClient();
    const { id, ...fields } = input;
    const { data, error } = await supabase
      .from('pets')
      .update({
        ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
        ...(fields.species !== undefined ? { species: fields.species.trim() } : {}),
        ...(fields.breed !== undefined ? { breed: fields.breed?.trim() || null } : {}),
        ...(fields.birth_date !== undefined ? { birth_date: fields.birth_date || null } : {}),
        ...(fields.sex !== undefined ? { sex: fields.sex ?? null } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes?.trim() || null } : {}),
      })
      .eq('id', id)
      .select(PET_COLUMNS)
      .single();

    if (error) throw error;
    return { pet: data };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível atualizar os dados do pet.');
  }
}

export async function excluirPet(id: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('pets').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível excluir o pet.');
  }
}
