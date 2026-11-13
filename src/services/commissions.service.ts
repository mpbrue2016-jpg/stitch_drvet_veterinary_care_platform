import type {
  CommissionEntry,
  CommissionOrigin,
  CommissionStatus,
  CommissionSummary,
} from '@/types/entities';
import {
  mockCommissionEntries,
  mockCommissionSummary,
  mockDelay,
} from './mock-db';

export interface ListCommissionsFilter {
  search?: string;
  origin?: CommissionOrigin | '';
  status?: CommissionStatus | '';
}

export async function buscarResumoFinanceiro(): Promise<CommissionSummary> {
  // TODO(AI Studio): trocar por chamada Supabase / Edge Function conectada ao gateway (Asaas / Mercado Pago)
  await mockDelay();
  return { ...mockCommissionSummary };
}

export async function listarComissoes(
  filter?: ListCommissionsFilter,
): Promise<{ entries: CommissionEntry[] }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('commission_ledger').select('*'))
  await mockDelay();
  const query = filter?.search?.trim().toLowerCase() ?? '';
  const filtered = mockCommissionEntries.filter((entry) => {
    if (filter?.origin && entry.origin !== filter.origin) return false;
    if (filter?.status && entry.status !== filter.status) return false;
    if (
      query &&
      !entry.reference.toLowerCase().includes(query) &&
      !entry.tutor_name.toLowerCase().includes(query) &&
      !entry.pet_name.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
  return { entries: filtered };
}

export async function solicitarAntecipacao(input: {
  amount_cents: number;
  notes?: string;
}): Promise<{ protocol: string; requested_cents: number }> {
  // TODO(AI Studio): trocar por chamada Supabase Edge Function para antecipação D+0 via provedor financeiro
  await mockDelay();
  return {
    protocol: `ANT-MOCK-${Date.now().toString().slice(-6)}`,
    requested_cents: input.amount_cents,
  };
}
