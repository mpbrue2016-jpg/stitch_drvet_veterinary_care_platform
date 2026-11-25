import type { PaginationMeta } from '@/lib/pagination';
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
  q?: string;
  status?: AppointmentStatus | '';
  page?: number;
  limit?: number;
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
): Promise<{
  appointments: Appointment[];
  currentUserId: string;
  pagination?: PaginationMeta;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.q?.trim()) query.set('q', params.q.trim());
    if (params?.status) query.set('status', params.status);
    if (params?.page && params.page > 0) query.set('page', String(params.page));
    if (params?.limit && params.limit > 0) query.set('limit', String(params.limit));

    const qs = query.toString();
    const response = await fetch(`/api/appointments${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as {
      appointments?: Appointment[];
      currentUserId?: string;
      pagination?: PaginationMeta;
      error?: string;
    } | null;

    if (!response.ok || !payload) {
      throw new Error(
        payload?.error || 'Não foi possível carregar os agendamentos.',
      );
    }

    return {
      appointments: payload.appointments ?? [],
      currentUserId: payload.currentUserId ?? '',
      pagination: payload.pagination,
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
    const response = await fetch('/api/appointments', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        availability_id: input.availability_id,
        pet_id: input.pet_id,
        kind: input.kind,
        reason: input.reason?.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      appointment?: Appointment;
      error?: string;
    } | null;

    if (!response.ok || !payload?.appointment) {
      throw new Error(
        payload?.error || 'Não foi possível solicitar o agendamento.',
      );
    }

    return { appointment: payload.appointment };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível solicitar o agendamento.');
  }
}

export async function atualizarStatusAgendamento(
  id: string,
  status: Extract<AppointmentStatus, 'confirmed' | 'cancelled' | 'completed'>,
): Promise<{ appointment: Appointment }> {
  try {
    const response = await fetch('/api/appointments', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });

    const payload = (await response.json().catch(() => null)) as {
      appointment?: Appointment;
      error?: string;
    } | null;

    if (!response.ok || !payload?.appointment) {
      throw new Error(
        payload?.error ||
          'A mudança de status não foi autorizada ou não é válida.',
      );
    }

    return { appointment: payload.appointment };
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
