import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsedDate = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsedDate.valueOf()) &&
      parsedDate.toISOString().slice(0, 10) === value
    );
  });

const vaccinationSchema = z
  .object({
    appointment_id: z.string().uuid(),
    vaccine_name: z.string().trim().min(1).max(160),
    administered_on: dateSchema,
    batch_number: z.string().trim().max(80).nullable().optional(),
    manufacturer: z.string().trim().max(120).nullable().optional(),
    next_due_on: dateSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.next_due_on == null ||
      value.next_due_on >= value.administered_on,
    {
      message: 'A próxima dose não pode ser anterior à data de aplicação.',
      path: ['next_due_on'],
    },
  );

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
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

  const { data: records, error } = await supabase
    .from('vaccination_records')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, vaccine_name, administered_on, batch_number, manufacturer, next_due_on, notes, created_at',
    )
    .order('administered_on', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar a carteira de vacinação.' },
      { status: 500 },
    );
  }

  const petIds = Array.from(new Set(records.map((record) => record.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };

  if (petsError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os pacientes das vacinas.' },
      { status: 500 },
    );
  }

  const petsById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  return NextResponse.json({
    vaccinations: records.map((record) => ({
      ...record,
      pet: petsById.get(record.pet_id) ?? null,
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
  const parsed = vaccinationSchema.safeParse(body);
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

  const { data, error } = await supabase.rpc('create_vaccination_record', {
    target_appointment: parsed.data.appointment_id,
    target_vaccine_name: parsed.data.vaccine_name,
    target_administered_on: parsed.data.administered_on,
    target_batch_number: parsed.data.batch_number ?? null,
    target_manufacturer: parsed.data.manufacturer ?? null,
    target_next_due_on: parsed.data.next_due_on ?? null,
    target_notes: parsed.data.notes ?? null,
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
            ? 'Confira o nome da vacina e as datas informadas.'
            : 'Não foi possível registrar a vacinação.',
      },
      { status },
    );
  }

  return NextResponse.json({ vaccination: data }, { status: 201 });
}
