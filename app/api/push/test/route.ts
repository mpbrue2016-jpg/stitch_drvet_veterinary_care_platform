import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const testPushSchema = z
  .object({
    audience: z.enum(['tutor', 'veterinarian']).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = testPushSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos.' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const audience = parsed.data.audience ?? 'tutor';
  const title =
    audience === 'veterinarian'
      ? 'DrVet Fila: Nova solicitação de atendimento'
      : 'DrVet Lembrete: Consulta marcada em breve';
  const bodyText =
    audience === 'veterinarian'
      ? 'Um tutor solicitou teleconsulta na sua fila clínica. Confira em Painel Veterinário.'
      : 'Sua consulta veterinária está se aproximando. Prepare seu pet para a sala de vídeo.';
  const actionUrl =
    audience === 'veterinarian' ? '/painel/veterinario' : '/agendamento';

  const { data: inserted, error: insertError } = await supabase
    .from('notifications')
    .insert({
      recipient_id: authData.user.id,
      kind: 'system_test',
      title,
      body: bodyText,
      action_url: actionUrl,
    })
    .select(
      'id, recipient_id, appointment_id, kind, title, body, action_url, read_at, pushed_at, created_at',
    )
    .single();

  if (insertError) {
    return supabaseErrorResponse(
      insertError,
      'Não foi possível registrar a notificação de teste.',
      500,
    );
  }

  const dispatch = await dispatchWebPushForUser(supabase, authData.user.id, {
    title,
    body: bodyText,
    url: actionUrl,
    tag: `test-${inserted.id}`,
  });

  if (dispatch.delivered > 0) {
    await supabase
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', inserted.id);
  }

  return NextResponse.json({
    notification: inserted,
    dispatch,
  });
}
