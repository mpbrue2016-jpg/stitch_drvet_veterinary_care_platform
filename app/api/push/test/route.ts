import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const testPushSchema = z
  .object({
    audience: z.enum(['tutor', 'veterinarian']).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:test',
    limit: 10,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = testPushSchema.safeParse(rawBody);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Parâmetros inválidos.' },
        { status: 400 },
      ),
      rateLimit,
    );
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
      recipient_id: authUser.id,
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
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        insertError,
        'Não foi possível registrar a notificação de teste.',
        500,
      ),
      rateLimit,
    );
  }

  const dispatch = await dispatchWebPushForUser(supabase, authUser.id, {
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

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      notification: inserted,
      dispatch,
    }),
    rateLimit,
  );
}
