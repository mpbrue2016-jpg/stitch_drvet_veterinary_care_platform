import type { PaginationMeta } from '@/lib/pagination';
import { getSupabaseClient } from '@/lib/supabase';
import type { ExamModality, ExamOrder, PetSummary } from '@/types/entities';
import { toFriendlyError } from './errors';

export interface ListExamOrdersParams {
  appointmentId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

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
  appointmentIdOrParams?: string | ListExamOrdersParams,
): Promise<{ examOrders: ExamOrder[]; pagination?: PaginationMeta }> {
  try {
    const params: ListExamOrdersParams =
      typeof appointmentIdOrParams === 'string'
        ? { appointmentId: appointmentIdOrParams }
        : (appointmentIdOrParams ?? {});

    const query = new URLSearchParams();
    if (params.appointmentId) query.set('appointmentId', params.appointmentId);
    if (params.q?.trim()) query.set('q', params.q.trim());
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.page && params.page > 0) query.set('page', String(params.page));
    if (params.limit && params.limit > 0) query.set('limit', String(params.limit));

    const qs = query.toString();
    const response = await fetch(`/api/exam-orders${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as {
      examOrders?: ExamOrder[];
      pagination?: PaginationMeta;
      error?: string;
    } | null;

    if (!response.ok || !payload) {
      throw new Error(
        payload?.error || 'Não foi possível carregar os pedidos de exames.',
      );
    }

    return {
      examOrders: payload.examOrders ?? [],
      pagination: payload.pagination,
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
    const response = await fetch('/api/exam-orders', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointment_id: input.appointment_id,
        modality: input.modality,
        exam_name: input.exam_name.trim(),
        clinical_indication: input.clinical_indication.trim(),
        instructions: input.instructions?.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      examOrder?: ExamOrder;
      error?: string;
    } | null;

    if (!response.ok || !payload?.examOrder) {
      throw new Error(
        payload?.error || 'Não foi possível criar o pedido de exame.',
      );
    }

    return { examOrder: payload.examOrder };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível criar o pedido de exame.');
  }
}

export async function registrarResultadoExame(
  input: RecordExamResultInput,
): Promise<{ examOrder: ExamOrder }> {
  try {
    const response = await fetch('/api/exam-orders', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: input.id,
        result_summary: input.result_summary.trim(),
        laboratory_name: input.laboratory_name?.trim() || null,
        performed_at: input.performed_at || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      examOrder?: ExamOrder;
      error?: string;
    } | null;

    if (!response.ok || !payload?.examOrder) {
      throw new Error(
        payload?.error || 'Não foi possível registrar o resultado do exame.',
      );
    }

    return { examOrder: payload.examOrder };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível registrar o resultado do exame.');
  }
}
