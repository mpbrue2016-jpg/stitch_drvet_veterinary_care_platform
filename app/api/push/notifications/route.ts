import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const markReadSchema = z
  .object({
    id: z.string().uuid().optional(),
    markAll: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.id || data.markAll), {
    message: 'Informe id ou markAll.',
  });

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

  const syncReminders = request.nextUrl.searchParams.get('sync') !== '0';

  if (syncReminders) {
    const { data: reminderRows } = await supabase.rpc('enqueue_appointment_reminders');
    const createdReminders = reminderRows ?? [];
    for (const item of createdReminders) {
      await dispatchWebPushForUser(
        supabase,
        authData.user.id,
        {
          title: item.title,
          body: item.body,
          url: item.action_url,
          tag: `reminder-${item.id}`,
        },
        'appointments',
      );
      await supabase
        .from('notifications')
        .update({ pushed_at: new Date().toISOString() })
        .eq('id', item.id);
    }
  }

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select(
      'id, recipient_id, appointment_id, kind, title, body, action_url, read_at, pushed_at, created_at',
    )
    .eq('recipient_id', authData.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return supabaseErrorResponse(
      error,
      'Não foi possível carregar as notificações.',
      500,
    );
  }

  const list = notifications ?? [];
  const unpushed = list.filter(
    (item) =>
      !item.pushed_at &&
      (item.kind === 'vet_queue_new' ||
        item.kind === 'appointment_confirmed' ||
        item.kind === 'appointment_cancelled'),
  );

  if (syncReminders && unpushed.length > 0) {
    for (const item of unpushed.slice(0, 3)) {
      const filterType = item.kind === 'vet_queue_new' ? 'queue' : 'appointments';
      const result = await dispatchWebPushForUser(
        supabase,
        authData.user.id,
        {
          title: item.title,
          body: item.body,
          url: item.action_url,
          tag: `notif-${item.id}`,
        },
        filterType,
      );
      if (result.delivered > 0) {
        await supabase
          .from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', item.id);
      }
    }
  }

  return NextResponse.json({
    notifications: list,
    unreadCount: list.filter((item) => !item.read_at).length,
  });
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = markReadSchema.safeParse(body);
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

  if (parsed.data.markAll) {
    const { data, error } = await supabase.rpc('mark_all_notifications_read');
    if (error) {
      return supabaseErrorResponse(
        error,
        'Não foi possível marcar todas as notificações como lidas.',
        500,
      );
    }
    return NextResponse.json({ updatedCount: data ?? 0 });
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.id!)
    .eq('recipient_id', authData.user.id);

  if (error) {
    return supabaseErrorResponse(
      error,
      'Não foi possível marcar a notificação como lida.',
      500,
    );
  }

  return NextResponse.json({ updatedCount: 1 });
}
