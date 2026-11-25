import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type {
  PrescriptionDraft,
  PrescriptionItem,
  PrescriptionVerification,
} from '@/types/entities';
import { toFriendlyError } from './errors';

const PRESCRIPTION_COLUMNS =
  'id, appointment_id, organization_id, pet_id, veterinarian_id, items, status, issued_at, verification_code, updated_by, created_at, updated_at';

function parseItems(raw: Json): PrescriptionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { [key: string]: Json | undefined } =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      presentation: typeof item.presentation === 'string' ? item.presentation : '',
      dose: typeof item.dose === 'string' ? item.dose : '',
      route: typeof item.route === 'string' ? item.route : '',
      frequency: typeof item.frequency === 'string' ? item.frequency : '',
      duration: typeof item.duration === 'string' ? item.duration : '',
      quantity: typeof item.quantity === 'string' ? item.quantity : '',
      instructions: typeof item.instructions === 'string' ? item.instructions : '',
    }));
}

export async function listarRascunhosReceita(): Promise<{
  prescriptionDrafts: PrescriptionDraft[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('prescription_drafts')
      .select(PRESCRIPTION_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return {
      prescriptionDrafts: (data ?? []).map((row) => ({
        ...row,
        items: parseItems(row.items),
      })),
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os rascunhos de receita.');
  }
}

export async function buscarRascunhoPorAtendimento(
  appointmentId: string,
): Promise<PrescriptionDraft | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('prescription_drafts')
      .select(PRESCRIPTION_COLUMNS)
      .eq('appointment_id', appointmentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      items: parseItems(data.items),
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o rascunho de receita.');
  }
}

export async function salvarRascunhoReceita(input: {
  appointment_id: string;
  items: PrescriptionItem[];
}): Promise<{ prescriptionDraft: PrescriptionDraft }> {
  try {
    const response = await fetch('/api/prescription-drafts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointment_id: input.appointment_id,
        items: input.items,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      prescriptionDraft?: PrescriptionDraft & { items: Json };
      error?: string;
    } | null;

    if (!response.ok || !payload?.prescriptionDraft) {
      throw new Error(
        payload?.error || 'Não foi possível salvar o rascunho de receita.',
      );
    }

    return {
      prescriptionDraft: {
        ...payload.prescriptionDraft,
        items: parseItems(payload.prescriptionDraft.items),
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível salvar o rascunho de receita.');
  }
}

export async function excluirRascunhoReceita(id: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('prescription_drafts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    throw toFriendlyError(
      error,
      'Rascunhos clínicos não podem ser excluídos diretamente pela aplicação.',
    );
  }
}

export async function emitirReceitaOficial(
  appointmentId: string,
): Promise<{
  prescriptionDraft: PrescriptionDraft;
  documentDigestSha256: string | null;
  digitalSignatureReadiness?: {
    mode: string;
    icpBrasilActive: boolean;
    privateKeyStoredInApp: boolean;
    canonicalHashAlgorithm: string;
  };
}> {
  try {
    const response = await fetch('/api/prescription-drafts/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment_id: appointmentId }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      prescriptionDraft?: PrescriptionDraft & { items: Json };
      documentDigestSha256?: string | null;
      digitalSignatureReadiness?: {
        mode: string;
        icpBrasilActive: boolean;
        privateKeyStoredInApp: boolean;
        canonicalHashAlgorithm: string;
      };
    };

    if (!response.ok || !payload.prescriptionDraft) {
      throw new Error(payload.error || 'Não foi possível emitir a receita.');
    }

    return {
      prescriptionDraft: {
        ...payload.prescriptionDraft,
        items: parseItems(payload.prescriptionDraft.items),
      },
      documentDigestSha256: payload.documentDigestSha256 ?? null,
      digitalSignatureReadiness: payload.digitalSignatureReadiness,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível emitir a receita.');
  }
}

export async function verificarCodigoReceita(
  code: string,
): Promise<PrescriptionVerification | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('verify_prescription_code', {
      target_code: code.trim().toUpperCase(),
    });
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível validar o código desta receita.',
    );
  }
}
