import type { Appointment, AppointmentKind, AppointmentStatus } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORGANIZATION_ID,
  MOCK_TUTOR_ID,
  mockAppointments,
  mockAvailability,
  mockDelay,
  mockPets,
} from './mock-db';

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

export async function listarAgendamentos(
  params?: ListAppointmentsParams,
): Promise<{ appointments: Appointment[]; currentUserId: string }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('appointments').select('*, pet:pets(id, name, species)'))
  await mockDelay();
  let list = [...mockAppointments];
  if (params?.from && params?.to) {
    const fromTime = new Date(params.from).getTime();
    const toTime = new Date(params.to).getTime();
    list = list.filter((item) => {
      const startTime = new Date(item.starts_at).getTime();
      return startTime >= fromTime && startTime < toTime;
    });
    list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  } else {
    list.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  }
  return {
    appointments: list,
    currentUserId: MOCK_CURRENT_USER_ID,
  };
}

export async function buscarAgendamentoPorId(id: string): Promise<Appointment | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('appointments').select('*').eq('id', id).maybeSingle())
  await mockDelay(100);
  return mockAppointments.find((item) => item.id === id) ?? null;
}

export async function criarAgendamento(
  input: CreateAppointmentInput,
): Promise<{ appointment: Appointment }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('appointments').insert(...).select().single())
  await mockDelay();
  const slotIndex = mockAvailability.findIndex((s) => s.id === input.availability_id);
  const slot = slotIndex >= 0 ? mockAvailability[slotIndex] : null;
  if (!slot || !slot.is_available || slot.is_blocked) {
    throw new Error('Este horário não está mais disponível.');
  }
  const pet = mockPets.find((p) => p.id === input.pet_id);
  if (!pet) {
    throw new Error('Selecione um pet válido antes de continuar.');
  }

  mockAvailability[slotIndex] = { ...slot, is_available: false };

  const created: Appointment = {
    id: `apt-${Date.now()}`,
    availability_id: slot.id,
    organization_id: slot.organization_id || MOCK_ORGANIZATION_ID,
    pet_id: pet.id,
    tutor_id: MOCK_TUTOR_ID,
    veterinarian_id: slot.veterinarian_id || MOCK_CURRENT_USER_ID,
    kind: input.kind,
    status: 'pending',
    reason: input.reason?.trim() || null,
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    pet: { id: pet.id, name: pet.name, species: pet.species },
  };
  mockAppointments.unshift(created);
  return { appointment: created };
}

export async function atualizarStatusAgendamento(
  id: string,
  status: Extract<AppointmentStatus, 'confirmed' | 'cancelled' | 'completed'>,
): Promise<{ appointment: Appointment }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('transition_appointment', ...))
  await mockDelay();
  const index = mockAppointments.findIndex((item) => item.id === id);
  if (index === -1) {
    throw new Error('Agendamento não encontrado.');
  }
  const updated: Appointment = {
    ...mockAppointments[index],
    status,
  };
  mockAppointments[index] = updated;
  return { appointment: updated };
}

export async function excluirAgendamento(id: string): Promise<void> {
  // TODO(AI Studio): trocar por chamada Supabase (cancelamento/exclusão controlada)
  await mockDelay();
  const index = mockAppointments.findIndex((item) => item.id === id);
  if (index !== -1) {
    mockAppointments.splice(index, 1);
  }
}
