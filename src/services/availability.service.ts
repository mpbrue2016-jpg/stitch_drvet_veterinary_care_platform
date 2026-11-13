import type { AvailabilitySlot } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  mockAvailability,
  mockDelay,
} from './mock-db';

export interface ListAvailabilityParams {
  mine?: boolean;
  organization_id?: string;
}

export interface CreateAvailabilityInput {
  organization_id: string;
  starts_at: string;
  ends_at: string;
}

export async function listarDisponibilidade(
  params?: ListAvailabilityParams,
): Promise<{ availability: AvailabilitySlot[] }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('professional_availability').select('*'))
  await mockDelay();
  const now = Date.now();
  const items = mockAvailability.filter((slot) => {
    if (params?.organization_id && slot.organization_id !== params.organization_id) {
      return false;
    }
    if (params?.mine) {
      return slot.veterinarian_id === MOCK_CURRENT_USER_ID;
    }
    return slot.is_available && !slot.is_blocked && new Date(slot.starts_at).getTime() > now;
  });
  return {
    availability: [...items].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    ),
  };
}

export async function buscarHorarioPorId(id: string): Promise<AvailabilitySlot | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('professional_availability').select('*').eq('id', id).maybeSingle())
  await mockDelay(100);
  return mockAvailability.find((slot) => slot.id === id) ?? null;
}

export async function criarHorarioDisponivel(
  input: CreateAvailabilityInput,
): Promise<{ slot: AvailabilitySlot }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('professional_availability').insert(...))
  await mockDelay();
  const created: AvailabilitySlot = {
    id: `slot-${Date.now()}`,
    organization_id: input.organization_id,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    is_available: true,
    is_blocked: false,
    block_reason: null,
  };
  mockAvailability.push(created);
  return { slot: created };
}

export async function alternarBloqueioHorario(input: {
  id: string;
  is_blocked: boolean;
  block_reason: string | null;
}): Promise<{ slot: AvailabilitySlot }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('set_availability_block', ...))
  await mockDelay();
  const index = mockAvailability.findIndex((slot) => slot.id === input.id);
  if (index === -1) {
    throw new Error('Horário não encontrado.');
  }
  const current = mockAvailability[index];
  const updated: AvailabilitySlot = {
    ...current,
    is_blocked: input.is_blocked,
    is_available: !input.is_blocked,
    blocked_at: input.is_blocked ? new Date().toISOString() : null,
    block_reason: input.is_blocked ? input.block_reason : null,
  };
  mockAvailability[index] = updated;
  return { slot: updated };
}

export async function excluirHorarioDisponivel(id: string): Promise<void> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('professional_availability').delete().eq('id', id))
  await mockDelay();
  const index = mockAvailability.findIndex((slot) => slot.id === id);
  if (index !== -1) {
    mockAvailability.splice(index, 1);
  }
}
