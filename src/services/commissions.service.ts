import { getSupabaseClient } from '@/lib/supabase';
import type {
  CommissionEntry,
  CommissionOrigin,
  CommissionStatus,
  CommissionSummary,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export interface ListCommissionsFilter {
  search?: string;
  origin?: CommissionOrigin | '';
  status?: CommissionStatus | '';
}

function currentMonthLabel() {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export async function buscarResumoFinanceiro(): Promise<CommissionSummary> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para consultar o resumo financeiro.');
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { data: ledgerRows, error: ledgerError },
      { data: payoutAccount, error: payoutError },
      { data: pendingAnticipations, error: anticipationError },
    ] = await Promise.all([
      supabase
        .from('commission_ledger')
        .select('net_amount_cents, status, occurred_at'),
      supabase
        .from('payout_accounts')
        .select('provider_connected, payout_account_label, pix_key_masked')
        .eq('veterinarian_id', authData.user.id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('anticipation_requests')
        .select('requested_cents, status')
        .eq('veterinarian_id', authData.user.id)
        .in('status', ['requested', 'approved']),
    ]);

    if (ledgerError) throw ledgerError;
    if (payoutError) throw payoutError;
    if (anticipationError) throw anticipationError;

    const entries = ledgerRows ?? [];
    const reservedCents = (pendingAnticipations ?? []).reduce(
      (total, item) => total + item.requested_cents,
      0,
    );

    const rawAvailable = entries
      .filter((item) => item.status === 'available')
      .reduce((total, item) => total + item.net_amount_cents, 0);

    const pendingCents = entries
      .filter((item) => item.status === 'pending')
      .reduce((total, item) => total + item.net_amount_cents, 0);

    const periodTotalCents = entries
      .filter((item) => item.occurred_at >= monthStart)
      .reduce((total, item) => total + item.net_amount_cents, 0);

    const accumulatedCents = entries.reduce(
      (total, item) => total + item.net_amount_cents,
      0,
    );

    return {
      available_cents: Math.max(0, rawAvailable - reservedCents),
      period_total_cents: periodTotalCents,
      pending_cents: pendingCents,
      accumulated_cents: accumulatedCents,
      provider_connected: payoutAccount?.provider_connected ?? false,
      payout_account_label:
        payoutAccount?.payout_account_label ?? 'Conta de repasse não configurada',
      pix_key_masked: payoutAccount?.pix_key_masked ?? null,
      period_label: currentMonthLabel(),
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o resumo financeiro.');
  }
}

export async function listarComissoes(
  filter?: ListCommissionsFilter,
): Promise<{ entries: CommissionEntry[] }> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('commission_ledger')
      .select(
        'id, reference, tutor_name, pet_name, origin, gross_amount_cents, net_amount_cents, status, occurred_at',
      )
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (filter?.origin) {
      query = query.eq('origin', filter.origin);
    }
    if (filter?.status) {
      query = query.eq('status', filter.status);
    }

    const search = filter?.search?.trim();
    if (search) {
      const escaped = search.replace(/[%_,()]/g, '');
      if (escaped) {
        query = query.or(
          `reference.ilike.%${escaped}%,tutor_name.ilike.%${escaped}%,pet_name.ilike.%${escaped}%`,
        );
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return { entries: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os lançamentos.');
  }
}

export async function solicitarAntecipacao(input: {
  amount_cents: number;
  notes?: string;
}): Promise<{ protocol: string; requested_cents: number }> {
  try {
    const supabase = getSupabaseClient();

    // Tenta executar via Edge Function para validação e auditoria server-side.
    const { data: fnData, error: fnError } = await supabase.functions.invoke<{
      protocol: string;
      requested_cents: number;
      error?: string;
    }>('request-anticipation', {
      body: {
        amount_cents: input.amount_cents,
        notes: input.notes ?? null,
      },
    });

    if (!fnError && fnData?.protocol) {
      return {
        protocol: fnData.protocol,
        requested_cents: fnData.requested_cents,
      };
    }

    // Fallback seguro para a RPC transacional no PostgreSQL caso a Edge Function ainda não esteja publicada.
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'request_commission_anticipation',
      {
        target_amount_cents: input.amount_cents,
        target_notes: input.notes?.trim() || null,
      },
    );

    if (rpcError) throw rpcError;

    return {
      protocol: rpcData.protocol,
      requested_cents: rpcData.requested_cents,
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar a solicitação de antecipação.',
    );
  }
}
