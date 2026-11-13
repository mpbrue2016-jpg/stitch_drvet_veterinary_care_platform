import type { VaccinationRecord } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORGANIZATION_ID,
  mockAppointments,
  mockDelay,
  mockVaccinations,
} from './mock-db';

export interface CreateVaccinationInput {
  appointment_id: string;
  vaccine_name: string;
  administered_on: string;
  batch_number?: string | null;
  manufacturer?: string | null;
  next_due_on?: string | null;
  notes?: string | null;
}

export async function listarVacinas(): Promise<{ vaccinations: VaccinationRecord[] }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('vaccination_records').select('*, pet:pets(id, name, species)'))
  await mockDelay();
  return {
    vaccinations: [...mockVaccinations].sort(
      (a, b) =>
        new Date(b.administered_on).getTime() - new Date(a.administered_on).getTime(),
    ),
  };
}

export async function buscarVacinaPorId(id: string): Promise<VaccinationRecord | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('vaccination_records').select('*').eq('id', id).maybeSingle())
  await mockDelay(100);
  return mockVaccinations.find((item) => item.id === id) ?? null;
}

export async function criarRegistroVacina(
  input: CreateVaccinationInput,
): Promise<{ vaccination: VaccinationRecord }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('create_vaccination_record', ...))
  await mockDelay();
  const appointment = mockAppointments.find((apt) => apt.id === input.appointment_id);
  if (!appointment) {
    throw new Error('Atendimento não encontrado.');
  }
  const created: VaccinationRecord = {
    id: `vac-${Date.now()}`,
    appointment_id: input.appointment_id,
    organization_id: appointment.organization_id ?? MOCK_ORGANIZATION_ID,
    pet_id: appointment.pet_id,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    vaccine_name: input.vaccine_name.trim(),
    administered_on: input.administered_on,
    batch_number: input.batch_number?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    next_due_on: input.next_due_on || null,
    notes: input.notes?.trim() || null,
    created_at: new Date().toISOString(),
    pet: appointment.pet,
  };
  mockVaccinations.unshift(created);
  return { vaccination: created };
}
