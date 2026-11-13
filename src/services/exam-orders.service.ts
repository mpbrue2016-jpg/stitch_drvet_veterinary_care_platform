import { getSupabaseClient } from '@/lib/supabase';
import type { ExamModality, ExamOrder, PetSummary } from '@/types/entities';
import { toFriendlyError } from './errors';

export interface CreateExamOrderInput {
  appointment_id: string;
  modality: ExamModality;
  exam_name: string;
  clinical_indication: string;
  instructions?: string | null;
}

export interface RecordExamResultInput {
  id: string;
  result_summary: string;
  laboratory_name?: string | null;
  performed_at?: string | null;
}

const EXAM_ORDER_COLUMNS =
  'id, appointment_id, organization_id, pet_id, veterinarian_id, modality, exam_name, clinical_indication, instructions, status, result_summary, laboratory_name, performed_at, requested_at, resulted_at, created_at';

async function attachPets<T extends { pet_id: string }>(
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

export async function listarPedidosExames(
  appointmentId?: string,
): Promise<{ examOrders: ExamOrder[] }> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('exam_orders')
      .select(EXAM_ORDER_COLUMNS)
      .order('requested_at', { ascending: false })
      .limit(100);

    if (appointmentId) {
      query = query.eq('appointment_id', appointmentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const petById = await attachPets(rows);

    return {
      examOrders: rows.map((row) => ({
        ...row,
        pet: petById.get(row.pet_id) ?? null,
      })),
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os pedidos de exames.');
  }
}

export async function buscarPedidoExamePorId(
  id: string,
): Promise<ExamOrder | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('exam_orders')
      .select(EXAM_ORDER_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const petById = await attachPets([data]);
    return {
      ...data,
      pet: petById.get(data.pet_id) ?? null,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o pedido de exame.');
  }
}

export async function criarPedidoExame(
  input: CreateExamOrderInput,
): Promise<{ examOrder: ExamOrder }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('create_exam_order', {
      target_appointment: input.appointment_id,
      target_modality: input.modality,
      target_exam_name: input.exam_name.trim(),
      target_clinical_indication: input.clinical_indication.trim(),
      target_instructions: input.instructions?.trim() || null,
    });

    if (error) throw error;

    const petById = await attachPets([data]);
    return {
      examOrder: {
        ...data,
        pet: petById.get(data.pet_id) ?? null,
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível criar o pedido de exame.');
  }
}

export async function registrarResultadoExame(
  input: RecordExamResultInput,
): Promise<{ examOrder: ExamOrder }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('record_exam_result', {
      target_exam_order: input.id,
      target_result_summary: input.result_summary.trim(),
      target_laboratory_name: input.laboratory_name?.trim() || null,
      target_performed_at: input.performed_at || null,
    });

    if (error) throw error;

    const petById = await attachPets([data]);
    return {
      examOrder: {
        ...data,
        pet: petById.get(data.pet_id) ?? null,
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível registrar o resultado do exame.');
  }
}
