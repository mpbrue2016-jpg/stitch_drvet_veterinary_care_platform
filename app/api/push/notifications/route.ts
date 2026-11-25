import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

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
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:notifications:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const syncReminders = request.nextUrl.searchParams.get('sync') !== '0';

  if (syncReminders) {
    const { data: reminderRows } = await supabase.rpc('enqueue_appointment_reminders');
    const createdReminders = reminderRows ?? [];
    for (const item of createdReminders) {
      await dispatchWebPushForUser(
        supabase,
        authUser.id,
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
    .eq('recipient_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar as notificações.',
        500,
      ),
      rateLimit,
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
        authUser.id,
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

  const outboxRes = await supabase
    .from('notification_outbox')
    .select('status')
    .eq('recipient_user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const outboxRows = outboxRes.error ? [] : (outboxRes.data ?? []);
  const outboxSummary = {
    schemaReady: !outboxRes.error,
    queued: outboxRows.filter((row) => row.status === 'queued').length,
    sent: outboxRows.filter((row) => row.status === 'sent').length,
    failed: outboxRows.filter((row) => row.status === 'failed').length,
  };

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      notifications: list,
      unreadCount: list.filter((item) => !item.read_at).length,
      outboxSummary,
    }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:notifications:write',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = markReadSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Parâmetros inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  if (parsed.data.markAll) {
    const { data, error } = await supabase.rpc('mark_all_notifications_read');
    if (error) {
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          error,
          'Não foi possível marcar todas as notificações como lidas.',
          500,
        ),
        rateLimit,
      );
    }
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ updatedCount: data ?? 0 }),
      rateLimit,
    );
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.id!)
    .eq('recipient_id', authUser.id);

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível marcar a notificação como lida.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ updatedCount: 1 }),
    rateLimit,
  );
}
