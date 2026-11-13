import type { PrescriptionDraft, PrescriptionItem } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORGANIZATION_ID,
  mockAppointments,
  mockDelay,
  mockPrescriptionDrafts,
} from './mock-db';

export async function listarRascunhosReceita(): Promise<{
  prescriptionDrafts: PrescriptionDraft[];
}> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('prescription_drafts').select('*'))
  await mockDelay();
  return { prescriptionDrafts: [...mockPrescriptionDrafts] };
}

export async function buscarRascunhoPorAtendimento(
  appointmentId: string,
): Promise<PrescriptionDraft | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('prescription_drafts').select('*').eq('appointment_id', appointmentId).maybeSingle())
  await mockDelay(100);
  return (
    mockPrescriptionDrafts.find((draft) => draft.appointment_id === appointmentId) ?? null
  );
}

export async function salvarRascunhoReceita(input: {
  appointment_id: string;
  items: PrescriptionItem[];
}): Promise<{ prescriptionDraft: PrescriptionDraft }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('save_prescription_draft', ...))
  await mockDelay();
  const now = new Date().toISOString();
  const index = mockPrescriptionDrafts.findIndex(
    (draft) => draft.appointment_id === input.appointment_id,
  );
  if (index !== -1) {
    const updated: PrescriptionDraft = {
      ...mockPrescriptionDrafts[index],
      items: input.items,
      updated_by: MOCK_CURRENT_USER_ID,
      updated_at: now,
    };
    mockPrescriptionDrafts[index] = updated;
    return { prescriptionDraft: updated };
  }

  const appointment = mockAppointments.find((apt) => apt.id === input.appointment_id);
  const created: PrescriptionDraft = {
    id: `rx-draft-${Date.now()}`,
    appointment_id: input.appointment_id,
    organization_id: appointment?.organization_id ?? MOCK_ORGANIZATION_ID,
    pet_id: appointment?.pet_id ?? 'pet-pipoca-001',
    veterinarian_id: MOCK_CURRENT_USER_ID,
    items: input.items,
    updated_by: MOCK_CURRENT_USER_ID,
    created_at: now,
    updated_at: now,
  };
  mockPrescriptionDrafts.unshift(created);
  return { prescriptionDraft: created };
}

export async function excluirRascunhoReceita(id: string): Promise<void> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('prescription_drafts').delete().eq('id', id))
  await mockDelay();
  const index = mockPrescriptionDrafts.findIndex((draft) => draft.id === id);
  if (index !== -1) {
    mockPrescriptionDrafts.splice(index, 1);
  }
}
