import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const registerVeterinarianSchema = z
  .object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
    registration_number: z.string().trim().min(1).max(32),
    registration_region: z.string().regex(/^[A-Z]{2}$/),
    specialty: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

const approveVeterinarianSchema = z
  .object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = registerVeterinarianSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Informe organização, usuário e registro profissional válidos.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { error } = await supabase.rpc('add_veterinarian', {
    target_organization: parsed.data.organization_id,
    target_user: parsed.data.user_id,
    target_registration_number: parsed.data.registration_number,
    target_registration_region: parsed.data.registration_region,
    target_specialty: parsed.data.specialty || null,
  });

  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400;
    return NextResponse.json(
      { error: 'Não foi possível cadastrar. Confirme a conta e as permissões.' },
      { status },
    );
  }

  return NextResponse.json({ status: 'pending_approval' }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = approveVeterinarianSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Informe organização e profissional válidos.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { error } = await supabase.rpc('approve_veterinarian', {
    target_organization: parsed.data.organization_id,
    target_user: parsed.data.user_id,
  });
  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    return NextResponse.json(
      { error: 'Não foi possível aprovar este profissional.' },
      { status },
    );
  }

  return NextResponse.json({ status: 'approved' });
}
