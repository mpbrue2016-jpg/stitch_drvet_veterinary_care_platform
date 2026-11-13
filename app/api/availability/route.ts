import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const createAvailabilitySchema = z
  .object({
    organization_id: z.string().uuid(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (value) => new Date(value.ends_at) > new Date(value.starts_at),
    'O fim do horário deve ser posterior ao início.',
  )
  .refine(
    (value) => new Date(value.starts_at) > new Date(),
    'Não é possível abrir horários no passado.',
  );

const updateAvailabilitySchema = z
  .object({
    id: z.string().uuid(),
    is_blocked: z.boolean(),
    block_reason: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

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

  const mine = request.nextUrl.searchParams.get('mine') === 'true';
  const organizationId = request.nextUrl.searchParams.get('organization_id');
  if (
    organizationId &&
    !z.string().uuid().safeParse(organizationId).success
  ) {
    return NextResponse.json(
      { error: 'Informe uma organização válida.' },
      { status: 400 },
    );
  }

  let availabilityQuery = supabase
    .from('professional_availability')
    .select(
      'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason',
    )
    .order('starts_at')
    .limit(100);
  if (mine) {
    availabilityQuery = availabilityQuery
      .eq('veterinarian_id', authData.user.id)
      .gte('starts_at', new Date().toISOString());
    if (organizationId) {
      availabilityQuery = availabilityQuery.eq('organization_id', organizationId);
    }
  } else {
    availabilityQuery = availabilityQuery
      .eq('is_available', true)
      .gt('starts_at', new Date().toISOString());
  }

  const { data, error } = await availabilityQuery;

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os horários.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ availability: data });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createAvailabilitySchema.safeParse(body);
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

  const { data: professional, error: professionalError } = await supabase
    .from('veterinarian_profiles')
    .select('organization_id, user_id')
    .eq('organization_id', parsed.data.organization_id)
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (professionalError) {
    return NextResponse.json(
      { error: 'Não foi possível verificar o cadastro profissional.' },
      { status: 500 },
    );
  }
  if (!professional) {
    return NextResponse.json(
      { error: 'Profissional não encontrado nesta organização.' },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from('professional_availability')
    .insert({
      organization_id: professional.organization_id,
      veterinarian_id: professional.user_id,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
    })
    .select(
      'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason',
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === '23P01'
            ? 'Este horário se sobrepõe a outro horário disponível.'
            : 'Não foi possível criar o horário. Verifique aprovação e permissões.',
      },
      {
        status:
          error.code === '23P01' ? 409 : error.code === '42501' ? 403 : 500,
      },
    );
  }

  return NextResponse.json({ availability: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateAvailabilitySchema.safeParse(body);
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

  const { data, error } = await supabase.rpc('set_availability_block', {
    target_availability: parsed.data.id,
    should_block: parsed.data.is_blocked,
    target_reason: parsed.data.is_blocked
      ? parsed.data.block_reason ?? null
      : null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : error.code === '23P01'
              ? 409
              : 500;
    return NextResponse.json(
      {
        error:
          error.code === '23P01'
            ? 'Este horário possui um agendamento ativo e não pode ser bloqueado.'
            : error.code === '22023'
              ? 'O horário já começou ou o motivo do bloqueio é inválido.'
              : 'Não foi possível atualizar a disponibilidade.',
      },
      { status },
    );
  }

  return NextResponse.json({ availability: data });
}
