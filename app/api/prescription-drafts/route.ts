import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const itemSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    presentation: z.string().trim().max(120),
    dose: z.string().trim().max(250),
    route: z.string().trim().max(100),
    frequency: z.string().trim().max(160),
    duration: z.string().trim().max(160),
    quantity: z.string().trim().max(120),
    instructions: z.string().trim().max(1000),
  })
  .strict();

const saveDraftSchema = z
  .object({
    appointment_id: z.string().uuid(),
    items: z.array(itemSchema).min(1).max(30),
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
    .from('prescription_drafts')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, items, updated_by, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(100);
  if (appointmentId) query = query.eq('appointment_id', appointmentId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: 'Não foi possível carregar os rascunhos de receita.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ prescriptionDrafts: data });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = saveDraftSchema.safeParse(body);
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

  const { data, error } = await supabase.rpc('save_prescription_draft', {
    target_appointment: parsed.data.appointment_id,
    target_items: parsed.data.items,
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
            ? 'Revise os itens e os limites de texto do rascunho.'
            : 'Não foi possível salvar o rascunho de receita.',
      },
      { status },
    );
  }

  return NextResponse.json({ prescriptionDraft: data });
}
