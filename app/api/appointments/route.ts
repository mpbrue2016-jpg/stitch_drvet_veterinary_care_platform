import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const createAppointmentSchema = z
  .object({
    availability_id: z.string().uuid(),
    pet_id: z.string().uuid(),
    kind: z.enum(['teleconsultation', 'in_person']),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const transitionAppointmentSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['confirmed', 'cancelled', 'completed']),
  })
  .strict();

const appointmentRangeSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (range) => new Date(range.to).getTime() > new Date(range.from).getTime(),
    'O fim do período deve ser posterior ao início.',
  );

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (Boolean(from) !== Boolean(to)) {
    return NextResponse.json(
      { error: 'Informe o início e o fim do período.' },
      { status: 400 },
    );
  }

  const range = from && to
    ? appointmentRangeSchema.safeParse({ from, to })
    : null;
  if (range && !range.success) {
    return NextResponse.json(
      { error: 'Informe um período válido.', details: range.error.flatten() },
      { status: 400 },
    );
  }

  let appointmentsQuery = supabase
    .from('appointments')
    .select(
      'id, kind, status, reason, starts_at, ends_at, pet_id, veterinarian_id, organization_id',
    )
    .order('starts_at', { ascending: range !== null })
    .limit(range ? 500 : 100);
  if (range?.success) {
    appointmentsQuery = appointmentsQuery
      .gte('starts_at', range.data.from)
      .lt('starts_at', range.data.to);
  }

  const { data, error } = await appointmentsQuery;

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os agendamentos.' },
      { status: 500 },
    );
  }

  const petIds = Array.from(new Set(data.map((appointment) => appointment.pet_id)));
  const { data: pets, error: petsError } =
    petIds.length > 0
      ? await supabase
          .from('pets')
          .select('id, name, species')
          .in('id', petIds)
      : { data: [], error: null };

  if (petsError) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os pacientes dos agendamentos.' },
      { status: 500 },
    );
  }

  const petById = new Map((pets ?? []).map((pet) => [pet.id, pet]));
  return NextResponse.json({
    appointments: data.map((appointment) => ({
      ...appointment,
      pet: petById.get(appointment.pet_id) ?? null,
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
  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data: availability, error: availabilityError } = await supabase
    .from('professional_availability')
    .select('id, organization_id, veterinarian_id, starts_at, ends_at')
    .eq('id', parsed.data.availability_id)
    .eq('is_available', true)
    .gt('starts_at', new Date().toISOString())
    .maybeSingle();

  if (availabilityError) {
    return NextResponse.json(
      { error: 'Não foi possível verificar a disponibilidade.' },
      { status: 500 },
    );
  }
  if (!availability) {
    return NextResponse.json(
      { error: 'Este horário não está mais disponível.' },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      availability_id: availability.id,
      organization_id: availability.organization_id,
      veterinarian_id: availability.veterinarian_id,
      starts_at: availability.starts_at,
      ends_at: availability.ends_at,
      tutor_id: authData.user.id,
      pet_id: parsed.data.pet_id,
      kind: parsed.data.kind,
      reason: parsed.data.reason || null,
    })
    .select('id, kind, status, starts_at, ends_at')
    .single();

  if (error) {
    const isConflict = error.code === '23P01' || error.code === '23505';
    return NextResponse.json(
      {
        error: isConflict
          ? 'Este horário acabou de ser reservado. Escolha outro horário.'
          : 'Não foi possível solicitar o agendamento. Confira o pet e tente novamente.',
      },
      { status: isConflict ? 409 : error.code === '42501' ? 403 : 500 },
    );
  }

  return NextResponse.json({ appointment: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = transitionAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('transition_appointment', {
    target_appointment: parsed.data.id,
    next_status: parsed.data.status,
  });

  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 409;
    return NextResponse.json(
      { error: 'A mudança de status não foi autorizada ou não é válida.' },
      { status },
    );
  }

  return NextResponse.json({ appointment: data });
}
