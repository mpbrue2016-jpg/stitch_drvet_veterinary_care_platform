import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const createExamOrderSchema = z
  .object({
    appointment_id: z.string().uuid(),
    modality: z.enum(['laboratory', 'imaging']),
    exam_name: z.string().trim().min(1).max(160),
    clinical_indication: z.string().trim().min(1).max(2000),
    instructions: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const resultSchema = z
  .object({
    id: z.string().uuid(),
    result_summary: z.string().trim().min(1).max(10000),
    laboratory_name: z.string().trim().max(160).nullable().optional(),
    performed_at: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const appointmentId = request.nextUrl.searchParams.get('appointmentId');
  if (
    appointmentId &&
    !z.string().uuid().safeParse(appointmentId).success
  ) {
    return NextResponse.json(
      { error: 'Informe um agendamento válido.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: 'Autenticação necessária.' },
      { status: 401 },
    );
  }

  let query = supabase
    .from('exam_orders')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, modality, exam_name, clinical_indication, instructions, status, result_summary, laboratory_name, performed_at, requested_at, resulted_at',
    )
    .order('requested_at', { ascending: false })
    .limit(200);
  if (appointmentId) query = query.eq('appointment_id', appointmentId);

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar as solicitações de exames.' },
      { status: 500 },
    );
  }

  const petIds = Array.from(new Set(orders.map((order) => order.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };
  if (petsError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os pacientes dos exames.' },
      { status: 500 },
    );
  }

  const petsById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  return NextResponse.json({
    examOrders: orders.map((order) => ({
      ...order,
      pet: petsById.get(order.pet_id) ?? null,
    })),
    currentUserId: authData.user.id,
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createExamOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: 'Autenticação necessária.' },
      { status: 401 },
    );
  }

  const { data, error } = await supabase.rpc('create_exam_order', {
    target_appointment: parsed.data.appointment_id,
    target_modality: parsed.data.modality,
    target_exam_name: parsed.data.exam_name,
    target_clinical_indication: parsed.data.clinical_indication,
    target_instructions: parsed.data.instructions ?? null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : 500;
    return NextResponse.json(
      {
        error:
          error.code === '22023'
            ? 'Revise o exame e a indicação clínica informados.'
            : 'Não foi possível solicitar o exame.',
      },
      { status },
    );
  }

  return NextResponse.json({ examOrder: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      { error: 'Autenticação necessária.' },
      { status: 401 },
    );
  }

  const { data, error } = await supabase.rpc('record_exam_result', {
    target_exam_order: parsed.data.id,
    target_result_summary: parsed.data.result_summary,
    target_laboratory_name: parsed.data.laboratory_name ?? null,
    target_performed_at: parsed.data.performed_at ?? null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : error.code === '55000'
              ? 409
              : 500;
    return NextResponse.json(
      {
        error:
          error.code === '55000'
            ? 'Este resultado já foi registrado e não pode ser alterado.'
            : error.code === '22023'
              ? 'Revise o resultado e a data informados.'
              : 'Não foi possível registrar o resultado.',
      },
      { status },
    );
  }

  return NextResponse.json({ examOrder: data });
}
