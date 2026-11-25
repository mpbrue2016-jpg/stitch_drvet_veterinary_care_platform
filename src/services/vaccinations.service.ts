import type { PaginationMeta } from '@/lib/pagination';
import { getSupabaseClient } from '@/lib/supabase';
import type { PetSummary, VaccinationRecord } from '@/types/entities';
import { toFriendlyError } from './errors';

export interface ListVaccinationsParams {
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CreateVaccinationInput {
  appointment_id: string;
  vaccine_name: string;
  administered_on: string;
  batch_number?: string | null;
  manufacturer?: string | null;
  next_due_on?: string | null;
  notes?: string | null;
}

const VACCINATION_COLUMNS =
  'id, appointment_id, organization_id, pet_id, veterinarian_id, vaccine_name, administered_on, batch_number, manufacturer, next_due_on, notes, created_at';

async function attachPets<T extends { pet_id: string }>(
  rows: T[],
): Promise<Map<string, PetSummary>> {
  const petIds = Array.from(new Set(rows.map((row) => row.pet_id)));
  if (petIds.length === 0) return new Map();

  const supabase = getSupabaseClient();
  const { data: pets, error } = await supabase
    .from('pets')
    .select('id, name, species')
    .in('id', petIds);

  if (error) throw error;
  return new Map((pets ?? []).map((pet) => [pet.id, pet]));
}

export async function listarVacinas(
  params?: ListVaccinationsParams,
): Promise<{
  vaccinations: VaccinationRecord[];
  pagination?: PaginationMeta;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.q?.trim()) query.set('q', params.q.trim());
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page && params.page > 0) query.set('page', String(params.page));
    if (params?.limit && params.limit > 0) query.set('limit', String(params.limit));

    const qs = query.toString();
    const response = await fetch(`/api/vaccinations${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as {
      vaccinations?: VaccinationRecord[];
      pagination?: PaginationMeta;
      error?: string;
    } | null;

    if (!response.ok || !payload) {
      throw new Error(
        payload?.error || 'Não foi possível carregar a carteira de vacinas.',
      );
    }

    return {
      vaccinations: payload.vaccinations ?? [],
      pagination: payload.pagination,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar a carteira de vacinas.');
  }
}

export async function buscarVacinaPorId(
  id: string,
): Promise<VaccinationRecord | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vaccination_records')
      .select(VACCINATION_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const petById = await attachPets([data]);
    return {
      ...data,
      pet: petById.get(data.pet_id) ?? null,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o registro vacinal.');
  }
}

export async function criarRegistroVacina(
  input: CreateVaccinationInput,
): Promise<{ vaccination: VaccinationRecord }> {
  try {
    const response = await fetch('/api/vaccinations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointment_id: input.appointment_id,
        vaccine_name: input.vaccine_name.trim(),
        administered_on: input.administered_on,
        batch_number: input.batch_number?.trim() || null,
        manufacturer: input.manufacturer?.trim() || null,
        next_due_on: input.next_due_on || null,
        notes: input.notes?.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      vaccination?: VaccinationRecord;
      error?: string;
    } | null;

    if (!response.ok || !payload?.vaccination) {
      throw new Error(
        payload?.error || 'Não foi possível registrar a vacinação.',
      );
    }

    return { vaccination: payload.vaccination };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível registrar a vacinação.');
  }
}
