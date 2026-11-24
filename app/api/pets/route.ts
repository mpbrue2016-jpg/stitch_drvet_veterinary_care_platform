import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { createPetSchema } from '@/lib/validations';

const PET_COLUMNS =
  'id, owner_id, name, species, breed, birth_date, sex, notes, created_at, updated_at';

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
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('pets')
    .select(PET_COLUMNS)
    .eq('owner_id', authData.user.id)
    .order('name');

  if (error) {
    return supabaseErrorResponse(error, 'Não foi possível carregar os pets.', 500);
  }

  return NextResponse.json({ pets: data });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = createPetSchema.safeParse(body);
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

  const { data, error } = await supabase
    .from('pets')
    .insert({
      owner_id: authData.user.id,
      ...parsed.data,
      breed: parsed.data.breed || null,
      birth_date: parsed.data.birth_date || null,
      sex: parsed.data.sex ?? null,
      notes: parsed.data.notes || null,
    })
    .select(PET_COLUMNS)
    .single();

  if (error) {
    return supabaseErrorResponse(error, 'Não foi possível cadastrar o pet.', 500);
  }

  return NextResponse.json({ pet: data }, { status: 201 });
}