import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const vitalsSchema = z
  .object({
    weight_kg: z.number().positive().max(500).nullable(),
    temperature_c: z.number().min(20).max(50).nullable(),
    heart_rate_bpm: z.number().int().positive().max(1000).nullable(),
    respiratory_rate_rpm: z.number().int().positive().max(500).nullable(),
    mucous_membranes: z.string().trim().max(100).nullable(),
    capillary_refill_seconds: z.number().min(0).max(30).nullable(),
  })
  .strict();

const saveClinicalRecordSchema = z
  .object({
    appointment_id: z.string().uuid(),
    subjective: z.string().max(10000),
    objective: z.string().max(10000),
    assessment: z.string().max(10000),
    plan: z.string().max(10000),
    vitals: vitalsSchema,
    status: z.enum(['draft', 'finalized']),
  })
  .strict();

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const appointmentId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get('appointmentId'));
  if (!appointmentId.success) {
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

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, status, veterinarian_id, starts_at')
    .eq('id', appointmentId.data)
    .maybeSingle();

  if (appointmentError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar o agendamento.' },
      { status: 500 },
    );
  }
  if (!appointment) {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
  }

  const { data: clinicalRecord, error: recordError } = await supabase
    .from('clinical_records')
    .select(
      'id, appointment_id, pet_id, veterinarian_id, subjective, objective, assessment, plan, vitals, status, finalized_at, created_at, updated_at',
    )
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  if (recordError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar o prontuário.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    clinicalRecord,
    canEdit:
      appointment.veterinarian_id === authData.user.id &&
      (appointment.status === 'completed' ||
        (appointment.status === 'confirmed' &&
          new Date(appointment.starts_at).getTime() <= Date.now())),
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
  const parsed = saveClinicalRecordSchema.safeParse(body);
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

  const { data, error } = await supabase.rpc('save_clinical_record', {
    target_appointment: parsed.data.appointment_id,
    target_subjective: parsed.data.subjective,
    target_objective: parsed.data.objective,
    target_assessment: parsed.data.assessment,
    target_plan: parsed.data.plan,
    target_vitals: parsed.data.vitals,
    target_status: parsed.data.status,
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
            ? 'Este prontuário já foi finalizado e não pode ser alterado.'
            : error.code === '22023'
              ? 'Revise os campos SOAP obrigatórios e os valores dos sinais vitais.'
              : 'Não foi possível salvar o prontuário.',
      },
      { status },
    );
  }

  return NextResponse.json({ clinicalRecord: data });
}
