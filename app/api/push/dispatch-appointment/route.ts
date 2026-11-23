import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchBackgroundPushWithServiceRole } from '@/lib/push/server-dispatch';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const dispatchSchema = z
  .object({
    appointmentId: z.string().uuid(),
    event: z.enum(['created', 'confirmed', 'cancelled']),
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
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('id, tutor_id, veterinarian_id, kind, status, starts_at')
    .eq('id', parsed.data.appointmentId)
    .maybeSingle();

  if (error) {
    return supabaseErrorResponse(
      error,
      'Não foi possível localizar o agendamento para notificação.',
      500,
    );
  }

  if (!appointment) {
    return NextResponse.json(
      { error: 'Agendamento não encontrado ou sem permissão.' },
      { status: 404 },
    );
  }

  const whenFormatted = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(appointment.starts_at));

  if (parsed.data.event === 'created') {
    if (appointment.tutor_id !== authData.user.id) {
      return NextResponse.json({ error: 'Operação não permitida.' }, { status: 403 });
    }
    const dispatch = await dispatchBackgroundPushWithServiceRole(
      appointment.veterinarian_id,
      {
        title: 'Nova solicitação na fila DrVet',
        body: `${appointment.kind === 'teleconsultation' ? 'Teleconsulta' : 'Consulta presencial'} solicitada para ${whenFormatted}.`,
        url: '/painel/veterinario',
        tag: `queue-${appointment.id}`,
      },
      'queue',
    );
    return NextResponse.json({ dispatch });
  }

  const isParticipant =
    appointment.veterinarian_id === authData.user.id ||
    appointment.tutor_id === authData.user.id;
  if (!isParticipant) {
    return NextResponse.json({ error: 'Operação não permitida.' }, { status: 403 });
  }

  const recipientId =
    authData.user.id === appointment.veterinarian_id
      ? appointment.tutor_id
      : appointment.veterinarian_id;
  const filterType = recipientId === appointment.veterinarian_id ? 'queue' : 'appointments';

  const dispatch = await dispatchBackgroundPushWithServiceRole(
    recipientId,
    {
      title:
        parsed.data.event === 'confirmed'
          ? 'Consulta veterinária confirmada'
          : 'Consulta veterinária cancelada',
      body:
        parsed.data.event === 'confirmed'
          ? `Seu atendimento foi confirmado para ${whenFormatted}.`
          : `O atendimento de ${whenFormatted} foi cancelado.`,
      url: recipientId === appointment.veterinarian_id ? '/painel/veterinario' : '/agendamento',
      tag: `status-${appointment.id}`,
    },
    filterType,
  );

  return NextResponse.json({ dispatch });
}
