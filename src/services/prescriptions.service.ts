import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type { PrescriptionDraft, PrescriptionItem } from '@/types/entities';
import { toFriendlyError } from './errors';

const PRESCRIPTION_COLUMNS =
  'id, appointment_id, organization_id, pet_id, veterinarian_id, items, updated_by, created_at, updated_at';

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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('save_prescription_draft', {
      target_appointment: input.appointment_id,
      target_items: input.items as unknown as Json,
    });

    if (error) throw error;

    return {
      prescriptionDraft: {
        ...data,
        items: parseItems(data.items),
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
