import type { Pet } from '@/types/entities';
import { MOCK_TUTOR_ID, mockDelay, mockPets } from './mock-db';

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

export async function listarPets(): Promise<{ pets: Pet[] }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('pets').select('*'))
  await mockDelay();
  return { pets: [...mockPets] };
}

export async function buscarPetPorId(id: string): Promise<Pet | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('pets').select('*').eq('id', id).maybeSingle())
  await mockDelay(100);
  return mockPets.find((pet) => pet.id === id) ?? null;
}

export async function criarPet(input: CreatePetInput): Promise<{ pet: Pet }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('pets').insert(...).select().single())
  await mockDelay();
  const now = new Date().toISOString();
  const created: Pet = {
    id: `pet-${Date.now()}`,
    owner_id: MOCK_TUTOR_ID,
    name: input.name.trim(),
    species: input.species.trim(),
    breed: input.breed?.trim() || null,
    birth_date: input.birth_date || null,
    sex: input.sex ?? null,
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now,
  };
  mockPets.push(created);
  return { pet: created };
}

export async function atualizarPet(input: UpdatePetInput): Promise<{ pet: Pet }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('pets').update(...).eq('id', input.id))
  await mockDelay();
  const index = mockPets.findIndex((pet) => pet.id === input.id);
  if (index === -1) {
    throw new Error('Pet não encontrado.');
  }
  const updated: Pet = {
    ...mockPets[index],
    ...input,
    updated_at: new Date().toISOString(),
  };
  mockPets[index] = updated;
  return { pet: updated };
}

export async function excluirPet(id: string): Promise<void> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('pets').delete().eq('id', id))
  await mockDelay();
  const index = mockPets.findIndex((pet) => pet.id === id);
  if (index !== -1) {
    mockPets.splice(index, 1);
  }
}
