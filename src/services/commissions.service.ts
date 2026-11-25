import { getSupabaseClient } from '@/lib/supabase';
import type {
  CommissionEntry,
  CommissionOrigin,
  CommissionStatus,
  CommissionSummary,
  FiscalInvoice,
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
    const response = await fetch('/api/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request_anticipation',
        payload: {
          amount_cents: input.amount_cents,
          notes: input.notes?.trim() || undefined,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      protocol?: string;
      requested_cents?: number;
    };

    if (!response.ok || !payload.protocol || typeof payload.requested_cents !== 'number') {
      throw new Error(
        payload.error || 'Não foi possível registrar a solicitação de antecipação.',
      );
    }

    return {
      protocol: payload.protocol,
      requested_cents: payload.requested_cents,
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar a solicitação de antecipação.',
    );
  }
}

export async function salvarContaRepasse(input: {
  provider: 'asaas' | 'mercadopago';
  payout_account_label: string;
  pix_key: string;
}): Promise<void> {
  try {
    const response = await fetch('/api/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_payout_account',
        payload: {
          provider: input.provider,
          payout_account_label: input.payout_account_label.trim(),
          pix_key: input.pix_key.trim(),
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      updated?: boolean;
    };

    if (!response.ok || !payload.updated) {
      throw new Error(
        payload.error ||
          'Não foi possível salvar os dados bancários e chave PIX de repasse.',
      );
    }
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível salvar os dados bancários e chave PIX de repasse.',
    );
  }
}

export async function listarNotasFiscais(): Promise<{ invoices: FiscalInvoice[] }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('fiscal_invoices')
      .select(
        'id, organization_id, veterinarian_id, invoice_number, period_label, total_cents, tax_id, verification_code, status, provider, notes, issued_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return { invoices: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar as notas fiscais.');
  }
}

export async function solicitarNotaFiscal(input: {
  period_label: string;
  total_cents: number;
  tax_id: string;
  provider: 'drvet_fiscal' | 'bling' | 'omie';
  notes?: string;
}): Promise<{ invoice: FiscalInvoice }> {
  try {
    const response = await fetch('/api/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request_fiscal_invoice',
        payload: {
          period_label: input.period_label.trim(),
          total_cents: input.total_cents,
          tax_id: input.tax_id.trim(),
          provider: input.provider,
          notes: input.notes?.trim() || undefined,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      invoice?: FiscalInvoice;
    };
    if (!response.ok || !payload.invoice) {
      throw new Error(payload.error || 'Não foi possível solicitar a nota fiscal.');
    }
    return { invoice: payload.invoice };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível solicitar a nota fiscal.');
  }
}

export async function atualizarStatusNotaFiscal(input: {
  invoiceId: string;
  status: 'requested' | 'issued' | 'cancelled';
}): Promise<{ invoice: FiscalInvoice }> {
  try {
    const response = await fetch('/api/commissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_fiscal_invoice_status',
        payload: {
          invoiceId: input.invoiceId,
          status: input.status,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      invoice?: FiscalInvoice;
    };
    if (!response.ok || !payload.invoice) {
      throw new Error(payload.error || 'Não foi possível atualizar a nota fiscal.');
    }
    return { invoice: payload.invoice };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível atualizar a nota fiscal.');
  }
}
