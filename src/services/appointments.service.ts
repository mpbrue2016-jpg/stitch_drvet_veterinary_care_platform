import { getSupabaseClient } from '@/lib/supabase';
import type {
  Appointment,
  AppointmentKind,
  AppointmentStatus,
  PetSummary,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export interface ListAppointmentsParams {
  from?: string;
  to?: string;
}

export interface CreateAppointmentInput {
  availability_id: string;
  pet_id: string;
  kind: AppointmentKind;
  reason?: string | null;
}

const APPOINTMENT_COLUMNS =
  'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at';

async function attachPetSummaries<T extends { pet_id: string }>(
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

export async function listarAgendamentos(
  params?: ListAppointmentsParams,
): Promise<{ appointments: Appointment[]; currentUserId: string }> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para consultar os agendamentos.');
    }

    const hasRange = Boolean(params?.from && params?.to);
    let query = supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .order('starts_at', { ascending: hasRange })
      .limit(hasRange ? 500 : 100);

    if (params?.from && params?.to) {
      query = query.gte('starts_at', params.from).lt('starts_at', params.to);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const petById = await attachPetSummaries(rows);

    return {
      appointments: rows.map((row) => ({
        ...row,
        pet: petById.get(row.pet_id) ?? null,
      })),
      currentUserId: authData.user.id,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os agendamentos.');
  }
}

export async function buscarAgendamentoPorId(
  id: string,
): Promise<Appointment | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const petById = await attachPetSummaries([data]);
    return {
      ...data,
      pet: petById.get(data.pet_id) ?? null,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o agendamento.');
  }
}

export async function criarAgendamento(
  input: CreateAppointmentInput,
): Promise<{ appointment: Appointment }> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para solicitar um agendamento.');
    }

    const { data: slot, error: slotError } = await supabase
      .from('professional_availability')
      .select('id, organization_id, veterinarian_id, starts_at, ends_at')
      .eq('id', input.availability_id)
      .eq('is_available', true)
      .eq('is_blocked', false)
      .gt('starts_at', new Date().toISOString())
      .maybeSingle();

    if (slotError) throw slotError;
    if (!slot) {
      throw new Error('Este horário não está mais disponível.');
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        availability_id: slot.id,
        organization_id: slot.organization_id,
        veterinarian_id: slot.veterinarian_id,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        tutor_id: authData.user.id,
        pet_id: input.pet_id,
        kind: input.kind,
        reason: input.reason?.trim() || null,
      })
      .select(APPOINTMENT_COLUMNS)
      .single();

    if (error) {
      if (error.code === '23P01' || error.code === '23505') {
        throw new Error(
          'Este horário acabou de ser reservado. Escolha outro horário.',
        );
      }
      throw error;
    }

    const petById = await attachPetSummaries([data]);
    return {
      appointment: {
        ...data,
        pet: petById.get(data.pet_id) ?? null,
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível solicitar o agendamento.');
  }
}

export async function atualizarStatusAgendamento(
  id: string,
  status: Extract<AppointmentStatus, 'confirmed' | 'cancelled' | 'completed'>,
): Promise<{ appointment: Appointment }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('transition_appointment', {
      target_appointment: id,
      next_status: status,
    });

    if (error) throw error;

    const petById = await attachPetSummaries([data]);
    return {
      appointment: {
        ...data,
        pet: petById.get(data.pet_id) ?? null,
      },
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'A mudança de status não foi autorizada ou não é válida.',
    );
  }
}

export async function excluirAgendamento(id: string): Promise<void> {
  await atualizarStatusAgendamento(id, 'cancelled');
}
