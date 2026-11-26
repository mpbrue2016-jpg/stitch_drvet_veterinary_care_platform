import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAppointmentWhatsappOutbox } from '@/lib/notifications/outbox';
import { dispatchVetExternalRemindersForCreatedNotifications } from '@/lib/notifications/vet-reminder-runner';
import {
  buildAppointmentWhatsappReminderText,
  isVetAutoReminderEnabled,
  normalizeVetReminderChannel,
  normalizeWhatsappPhoneToE164,
  shouldSendEmailForChannel,
  shouldSendPushForChannel,
  shouldSendWhatsappForChannel,
} from '@/lib/notifications/vet-reminders';
import { sendWhatsappReminder } from '@/lib/notifications/whatsapp-dispatcher';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import type { PushNotificationItem } from '@/types/entities';

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
    const createdReminders = (reminderRows ?? []) as PushNotificationItem[];
    const userMeta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const vetChannel = normalizeVetReminderChannel(
      userMeta.vet_reminder_channel,
      'both',
    );
    const vetAutoEnabled = isVetAutoReminderEnabled(
      userMeta.vet_auto_reminder_enabled,
    );

    let profilePhone: string | null = null;
    let profileDisplayName: string | null =
      typeof userMeta.display_name === 'string' ? userMeta.display_name : null;

    if (createdReminders.length > 0) {
      const profileRes = await supabase
        .from('profiles')
        .select('phone, display_name')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!profileRes.error && profileRes.data) {
        profilePhone = profileRes.data.phone ?? null;
        profileDisplayName = profileRes.data.display_name || profileDisplayName;
      }
    }

    const vetMetaPhone =
      typeof userMeta.vet_whatsapp_phone === 'string' &&
      userMeta.vet_whatsapp_phone.trim()
        ? userMeta.vet_whatsapp_phone.trim()
        : null;
    const recipientPhone = vetMetaPhone ?? profilePhone;

    const vetRemindersCreated: PushNotificationItem[] = [];
    const tutorRemindersCreated: PushNotificationItem[] = [];

    for (const item of createdReminders) {
      const isVetReminder = item.kind === 'vet_agenda_reminder';
      if (isVetReminder && !vetAutoEnabled) {
        continue;
      }
      if (isVetReminder) {
        vetRemindersCreated.push(item);
      } else if (item.kind === 'appointment_reminder') {
        tutorRemindersCreated.push(item);
      }

      const shouldSendPush = !isVetReminder || shouldSendPushForChannel(vetChannel);
      if (shouldSendPush) {
        const filterType =
          item.kind === 'vet_agenda_reminder' ||
          item.kind === 'vet_queue_new' ||
          item.kind === 'vet_agenda_summary'
            ? 'queue'
            : 'appointments';
        await dispatchWebPushForUser(
          supabase,
          authUser.id,
          {
            title: item.title,
            body: item.body,
            url: item.action_url,
            tag: `reminder-${item.id}`,
          },
          filterType,
        );
        await supabase
          .from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', item.id);
      }
    }

    if (
      vetRemindersCreated.length > 0 &&
      vetAutoEnabled &&
      (shouldSendEmailForChannel(vetChannel) || shouldSendWhatsappForChannel(vetChannel))
    ) {
      await dispatchVetExternalRemindersForCreatedNotifications({
        reminders: vetRemindersCreated,
        recipientUserId: authUser.id,
        recipientEmail: authUser.email,
        recipientPhone,
        veterinarianName: profileDisplayName,
        channel: vetChannel,
        supabase,
      }).catch(() => null);
    }

    const tutorPhoneNormalized = normalizeWhatsappPhoneToE164(profilePhone);
    if (
      tutorRemindersCreated.length > 0 &&
      tutorPhoneNormalized &&
      userMeta.appointment_whatsapp_enabled !== false
    ) {
      for (const item of tutorRemindersCreated) {
        const whatsappRes = await sendWhatsappReminder({
          to: tutorPhoneNormalized,
          body: buildAppointmentWhatsappReminderText({
            title: item.title,
            body: item.body,
            actionUrl: item.action_url,
            recipientName: profileDisplayName,
          }),
        }).catch(() => null);

        if (whatsappRes) {
          await recordAppointmentWhatsappOutbox({
            recipientUserId: authUser.id,
            templateKey: 'appointment_reminder',
            sent: whatsappRes.sent,
            providerMessageId: whatsappRes.providerMessageSid,
            error: whatsappRes.error,
          }).catch(() => null);
        }
      }
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
        item.kind === 'vet_agenda_reminder' ||
        item.kind === 'vet_agenda_summary' ||
        item.kind === 'appointment_confirmed' ||
        item.kind === 'appointment_cancelled'),
  );

  if (syncReminders && unpushed.length > 0) {
    for (const item of unpushed.slice(0, 3)) {
      const filterType =
        item.kind === 'vet_queue_new' ||
        item.kind === 'vet_agenda_reminder' ||
        item.kind === 'vet_agenda_summary'
          ? 'queue'
          : 'appointments';
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
