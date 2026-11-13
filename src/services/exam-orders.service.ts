import type { ExamModality, ExamOrder } from '@/types/entities';
import {
  MOCK_CURRENT_USER_ID,
  MOCK_ORGANIZATION_ID,
  mockAppointments,
  mockDelay,
  mockExamOrders,
} from './mock-db';

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

export async function listarPedidosExames(
  appointmentId?: string,
): Promise<{ examOrders: ExamOrder[] }> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('exam_orders').select('*, pet:pets(id, name, species)'))
  await mockDelay();
  const filtered = appointmentId
    ? mockExamOrders.filter((order) => order.appointment_id === appointmentId)
    : mockExamOrders;
  return {
    examOrders: [...filtered].sort(
      (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
    ),
  };
}

export async function buscarPedidoExamePorId(id: string): Promise<ExamOrder | null> {
  // TODO(AI Studio): trocar por chamada Supabase (supabase.from('exam_orders').select('*').eq('id', id).maybeSingle())
  await mockDelay(100);
  return mockExamOrders.find((order) => order.id === id) ?? null;
}

export async function criarPedidoExame(
  input: CreateExamOrderInput,
): Promise<{ examOrder: ExamOrder }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('create_exam_order', ...))
  await mockDelay();
  const appointment = mockAppointments.find((apt) => apt.id === input.appointment_id);
  if (!appointment) {
    throw new Error('Atendimento não encontrado.');
  }
  const now = new Date().toISOString();
  const created: ExamOrder = {
    id: `exam-${Date.now()}`,
    appointment_id: input.appointment_id,
    organization_id: appointment.organization_id ?? MOCK_ORGANIZATION_ID,
    pet_id: appointment.pet_id,
    veterinarian_id: MOCK_CURRENT_USER_ID,
    modality: input.modality,
    exam_name: input.exam_name.trim(),
    clinical_indication: input.clinical_indication.trim(),
    instructions: input.instructions?.trim() || null,
    status: 'requested',
    result_summary: null,
    laboratory_name: null,
    performed_at: null,
    requested_at: now,
    resulted_at: null,
    created_at: now,
    pet: appointment.pet,
  };
  mockExamOrders.unshift(created);
  return { examOrder: created };
}

export async function registrarResultadoExame(
  input: RecordExamResultInput,
): Promise<{ examOrder: ExamOrder }> {
  // TODO(AI Studio): trocar por chamada Supabase RPC (supabase.rpc('record_exam_result', ...))
  await mockDelay();
  const index = mockExamOrders.findIndex((order) => order.id === input.id);
  if (index === -1) {
    throw new Error('Pedido de exame não encontrado.');
  }
  const updated: ExamOrder = {
    ...mockExamOrders[index],
    status: 'resulted',
    result_summary: input.result_summary.trim(),
    laboratory_name: input.laboratory_name?.trim() || null,
    performed_at: input.performed_at || null,
    resulted_at: new Date().toISOString(),
  };
  mockExamOrders[index] = updated;
  return { examOrder: updated };
}
