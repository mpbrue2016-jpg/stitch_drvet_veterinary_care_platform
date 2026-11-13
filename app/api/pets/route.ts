import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const createPetSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    species: z.string().trim().min(1).max(60),
    breed: z.string().trim().max(100).nullable().optional(),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const parsedDate = new Date(`${value}T00:00:00Z`);
        return (
          !Number.isNaN(parsedDate.valueOf()) &&
          parsedDate.toISOString().slice(0, 10) === value
        );
      })
      .nullable()
      .optional(),
    sex: z.enum(['female', 'male', 'unknown']).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

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
    .select('id, name, species, breed, birth_date, sex')
    .order('name');

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os pets.' },
      { status: 500 },
    );
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
    })
    .select('id, name, species, breed, birth_date, sex')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível cadastrar o pet.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ pet: data }, { status: 201 });
}
