import { getSupabaseClient } from '@/lib/supabase';
import type { PetSummary, VaccinationRecord } from '@/types/entities';
import { toFriendlyError } from './errors';

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

export async function listarVacinas(): Promise<{
  vaccinations: VaccinationRecord[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('vaccination_records')
      .select(VACCINATION_COLUMNS)
      .order('administered_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const rows = data ?? [];
    const petById = await attachPets(rows);

    return {
      vaccinations: rows.map((row) => ({
        ...row,
        pet: petById.get(row.pet_id) ?? null,
      })),
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('create_vaccination_record', {
      target_appointment: input.appointment_id,
      target_vaccine_name: input.vaccine_name.trim(),
      target_administered_on: input.administered_on,
      target_batch_number: input.batch_number?.trim() || null,
      target_manufacturer: input.manufacturer?.trim() || null,
      target_next_due_on: input.next_due_on || null,
      target_notes: input.notes?.trim() || null,
    });

    if (error) throw error;

    const petById = await attachPets([data]);
    return {
      vaccination: {
        ...data,
        pet: petById.get(data.pet_id) ?? null,
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível registrar a vacinação.');
  }
}
