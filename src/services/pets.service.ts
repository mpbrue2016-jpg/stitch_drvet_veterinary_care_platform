import type { PaginationMeta } from '@/lib/pagination';
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

async function parsePetsApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;

  if (!response.ok) {
    if (payload?.code === 'SCHEMA_MISSING') {
      throw new Error(
        payload.error ||
          'As tabelas do DrVet ainda não foram inicializadas neste projeto Supabase.',
      );
    }
    throw new Error(payload?.error || fallbackMessage);
  }

  if (!payload) {
    throw new Error(fallbackMessage);
  }

  return payload;
}

export async function listarPets(options?: {
  scope?: 'mine' | 'patients' | 'all';
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{ pets: Pet[]; pagination?: PaginationMeta }> {
  try {
    const params = new URLSearchParams();
    if (options?.scope) {
      params.set('scope', options.scope);
    }
    if (options?.q?.trim()) {
      params.set('q', options.q.trim());
    }
    if (options?.page && options.page > 0) {
      params.set('page', String(options.page));
    }
    if (options?.limit && options.limit > 0) {
      params.set('limit', String(options.limit));
    }
    const query = params.toString();
    const response = await fetch(`/api/pets${query ? `?${query}` : ''}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await parsePetsApiResponse<{
      pets: Pet[];
      pagination?: PaginationMeta;
    }>(response, 'Não foi possível carregar os pets.');
    return { pets: data.pets ?? [], pagination: data.pagination };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os pets.');
  }
}

export async function buscarPetPorId(id: string): Promise<Pet | null> {
  try {
    const response = await fetch(`/api/pets?id=${encodeURIComponent(id)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (response.status === 404) {
      return null;
    }
    const data = await parsePetsApiResponse<{ pets: Pet[] }>(
      response,
      'Não foi possível carregar os dados do pet.',
    );
    return data.pets?.[0] ?? null;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os dados do pet.');
  }
}

export async function criarPet(input: CreatePetInput): Promise<{ pet: Pet }> {
  try {
    const response = await fetch('/api/pets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name.trim(),
        species: input.species.trim(),
        breed: input.breed?.trim() || null,
        birth_date: input.birth_date || null,
        sex: input.sex ?? null,
        notes: input.notes?.trim() || null,
      }),
    });
    return await parsePetsApiResponse<{ pet: Pet }>(
      response,
      'Não foi possível cadastrar o pet.',
    );
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível cadastrar o pet.');
  }
}

export async function atualizarPet(input: UpdatePetInput): Promise<{ pet: Pet }> {
  try {
    const { id, ...fields } = input;
    const response = await fetch('/api/pets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
        ...(fields.species !== undefined ? { species: fields.species.trim() } : {}),
        ...(fields.breed !== undefined ? { breed: fields.breed?.trim() || null } : {}),
        ...(fields.birth_date !== undefined ? { birth_date: fields.birth_date || null } : {}),
        ...(fields.sex !== undefined ? { sex: fields.sex ?? null } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes?.trim() || null } : {}),
      }),
    });
    return await parsePetsApiResponse<{ pet: Pet }>(
      response,
      'Não foi possível atualizar os dados do pet.',
    );
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível atualizar os dados do pet.');
  }
}

export async function excluirPet(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/pets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await parsePetsApiResponse<{ deleted: boolean }>(
      response,
      'Não foi possível excluir o pet.',
    );
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível excluir o pet.');
  }
}
