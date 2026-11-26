import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dispatchWebPushForUser } from '@/lib/push/server-dispatch';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { isSchemaMissingError } from '@/services/errors';
import type { Database } from '@/types/database';
import type { Appointment, PushNotificationItem } from '@/types/entities';
import { isEmailProviderConfigured, sendTransactionalEmail } from './email-dispatcher';
import { recordVet30MinReminderOutbox } from './outbox';
import {
  buildAppointmentWhatsappReminderText,
  buildVet30MinReminderContent,
  escapeHtml,
  filterAppointmentsDueForVet30MinReminder,
  getVet30MinReminderDedupeKey,
  isVetAutoReminderEnabled,
  normalizeVetReminderChannel,
  shouldSendEmailForChannel,
  shouldSendPushForChannel,
  shouldSendWhatsappForChannel,
  VET_REMINDER_WINDOW_FUTURE_MS,
  VET_REMINDER_WINDOW_PAST_BUFFER_MS,
  type VetReminderChannel,
} from './vet-reminders';
import {
  isWhatsappProviderConfigured,
  sendWhatsappReminder,
} from './whatsapp-dispatcher';

function getServiceRoleClient(): SupabaseClient<Database> | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const { url } = getSupabasePublicConfig();
  if (!serviceKey || !url) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface VetReminderRunSummary {
  schemaMissing: boolean;
  emailProviderConfigured: boolean;
  whatsappProviderConfigured: boolean;
  dueAppointmentsCount: number;
  triggeredCount: number;
  pushAttempted: number;
  pushDelivered: number;
  emailSent: number;
  emailQueued: number;
  emailFailed: number;
  whatsappAttempted: number;
  whatsappSent: number;
  whatsappQueued: number;
  whatsappFailed: number;
  createdNotifications: PushNotificationItem[];
}

export interface ExternalVetReminderDispatchStats {
  emailSent: number;
  emailQueued: number;
  emailFailed: number;
  whatsappAttempted: number;
  whatsappSent: number;
  whatsappQueued: number;
  whatsappFailed: number;
}

export async function dispatchVetExternalRemindersForCreatedNotifications(params: {
  reminders: PushNotificationItem[];
  recipientUserId: string;
  recipientEmail: string | null | undefined;
  recipientPhone?: string | null | undefined;
  veterinarianName: string | null | undefined;
  channel: VetReminderChannel;
  supabase: SupabaseClient<Database>;
}): Promise<ExternalVetReminderDispatchStats> {
  const sendEmail = shouldSendEmailForChannel(params.channel);
  const sendWhatsapp = shouldSendWhatsappForChannel(params.channel);

  if ((!sendEmail && !sendWhatsapp) || params.reminders.length === 0) {
    return {
      emailSent: 0,
      emailQueued: 0,
      emailFailed: 0,
      whatsappAttempted: 0,
      whatsappSent: 0,
      whatsappQueued: 0,
      whatsappFailed: 0,
    };
  }

  const appointmentIds = Array.from(
    new Set(
      params.reminders
        .map((item) => item.appointment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const appointmentsRes =
    appointmentIds.length > 0
      ? await params.supabase
          .from('appointments')
          .select(
            'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
          )
          .in('id', appointmentIds)
      : { data: [], error: null };

  const aptRows = appointmentsRes.data ?? [];
  const petIds = Array.from(new Set(aptRows.map((apt) => apt.pet_id)));
  const petsRes =
    petIds.length > 0
      ? await params.supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };
  const petById = new Map((petsRes.data ?? []).map((pet) => [pet.id, pet]));
  const aptById = new Map(aptRows.map((apt) => [apt.id, apt]));

  let emailSent = 0;
  let emailQueued = 0;
  let emailFailed = 0;
  let whatsappAttempted = 0;
  let whatsappSent = 0;
  let whatsappQueued = 0;
  let whatsappFailed = 0;

  for (const reminder of params.reminders) {
    const apt = reminder.appointment_id ? aptById.get(reminder.appointment_id) : undefined;
    const pet = apt ? petById.get(apt.pet_id) : undefined;
    const content = apt
      ? buildVet30MinReminderContent({
          appointment: apt,
          petName: pet?.name ?? null,
          veterinarianName: params.veterinarianName,
        })
      : {
          dedupeKey: getVet30MinReminderDedupeKey(reminder.appointment_id ?? reminder.id),
          title: reminder.title,
          body: reminder.body,
          actionUrl: reminder.action_url,
          emailSubject: `[DrVet] ${reminder.title}`,
          emailText: `${reminder.title}\n\n${reminder.body}\n\nAcesse: ${reminder.action_url}`,
          emailHtml: `<p><strong>${escapeHtml(reminder.title)}</strong></p><p>${escapeHtml(reminder.body)}</p>`,
          whatsappText: buildAppointmentWhatsappReminderText({
            title: reminder.title,
            body: reminder.body,
            actionUrl: reminder.action_url,
            recipientName: params.veterinarianName,
          }),
        };

    let emailResult: Awaited<ReturnType<typeof sendTransactionalEmail>> | null = null;
    if (sendEmail) {
      emailResult = await sendTransactionalEmail({
        to: params.recipientEmail,
        subject: content.emailSubject,
        text: content.emailText,
        html: content.emailHtml,
      });

      if (emailResult.sent) emailSent += 1;
      else if (emailResult.queued) emailQueued += 1;
      else emailFailed += 1;
    }

    let whatsappResult: Awaited<ReturnType<typeof sendWhatsappReminder>> | null = null;
    if (sendWhatsapp) {
      whatsappAttempted += 1;
      whatsappResult = await sendWhatsappReminder({
        to: params.recipientPhone,
        body: content.whatsappText,
      });

      if (whatsappResult.sent) whatsappSent += 1;
      else if (whatsappResult.queued) whatsappQueued += 1;
      else whatsappFailed += 1;
    }

    await recordVet30MinReminderOutbox({
      recipientUserId: params.recipientUserId,
      includeEmail: sendEmail,
      emailSent: emailResult?.sent ?? false,
      emailProviderMessageId: emailResult?.providerMessageId ?? null,
      emailError: emailResult?.error ?? null,
      includeWhatsapp: sendWhatsapp,
      whatsappSent: whatsappResult?.sent ?? false,
      whatsappProviderMessageId: whatsappResult?.providerMessageSid ?? null,
      whatsappError: whatsappResult?.error ?? null,
      pushAttempted: 0,
      pushDelivered: 0,
    });
  }

  return {
    emailSent,
    emailQueued,
    emailFailed,
    whatsappAttempted,
    whatsappSent,
    whatsappQueued,
    whatsappFailed,
  };
}

export async function dispatchEmailForCreatedVetReminders(params: {
  reminders: PushNotificationItem[];
  recipientUserId: string;
  recipientEmail: string | null | undefined;
  recipientPhone?: string | null | undefined;
  veterinarianName: string | null | undefined;
  channel: VetReminderChannel;
  supabase: SupabaseClient<Database>;
}): Promise<ExternalVetReminderDispatchStats> {
  return dispatchVetExternalRemindersForCreatedNotifications(params);
}

function emptyRunSummary(overrides?: Partial<VetReminderRunSummary>): VetReminderRunSummary {
  return {
    schemaMissing: false,
    emailProviderConfigured: isEmailProviderConfigured(),
    whatsappProviderConfigured: isWhatsappProviderConfigured(),
    dueAppointmentsCount: 0,
    triggeredCount: 0,
    pushAttempted: 0,
    pushDelivered: 0,
    emailSent: 0,
    emailQueued: 0,
    emailFailed: 0,
    whatsappAttempted: 0,
    whatsappSent: 0,
    whatsappQueued: 0,
    whatsappFailed: 0,
    createdNotifications: [],
    ...overrides,
  };
}

export async function runVet30MinRemindersForVeterinarian(params: {
  supabase: SupabaseClient<Database>;
  veterinarianId: string;
  recipientEmail: string | null | undefined;
  recipientPhone?: string | null | undefined;
  veterinarianName: string | null | undefined;
  channel: VetReminderChannel;
  enabled: boolean;
  now?: Date;
}): Promise<VetReminderRunSummary> {
  const now = params.now ?? new Date();
  const minIso = new Date(now.getTime() - VET_REMINDER_WINDOW_PAST_BUFFER_MS).toISOString();
  const maxIso = new Date(now.getTime() + VET_REMINDER_WINDOW_FUTURE_MS).toISOString();

  const dueAppointmentsRes = await params.supabase
    .from('appointments')
    .select(
      'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
    )
    .eq('veterinarian_id', params.veterinarianId)
    .in('status', ['confirmed', 'pending'])
    .gt('starts_at', minIso)
    .lte('starts_at', maxIso)
    .order('starts_at', { ascending: true });

  if (dueAppointmentsRes.error) {
    return emptyRunSummary({
      schemaMissing: isSchemaMissingError(dueAppointmentsRes.error),
    });
  }

  const dueAppointments = filterAppointmentsDueForVet30MinReminder(
    (dueAppointmentsRes.data ?? []).map((row) => ({ ...row, pet: null })) as Appointment[],
    now,
  );

  if (!params.enabled || dueAppointments.length === 0) {
    return emptyRunSummary({
      dueAppointmentsCount: dueAppointments.length,
    });
  }

  const adminClient = getServiceRoleClient();
  let newlyCreatedReminders: PushNotificationItem[] = [];

  if (adminClient) {
    const dedupeKeys = dueAppointments.map((apt) => getVet30MinReminderDedupeKey(apt.id));
    const existingRes = await adminClient
      .from('notifications')
      .select('dedupe_key')
      .eq('recipient_id', params.veterinarianId)
      .in('dedupe_key', dedupeKeys);

    if (existingRes.error && isSchemaMissingError(existingRes.error)) {
      return emptyRunSummary({
        schemaMissing: true,
        dueAppointmentsCount: dueAppointments.length,
      });
    }

    const existingDedupeKeys = new Set(
      (existingRes.data ?? [])
        .map((row) => row.dedupe_key)
        .filter((key): key is string => Boolean(key)),
    );

    const pendingToCreate = dueAppointments.filter(
      (apt) => !existingDedupeKeys.has(getVet30MinReminderDedupeKey(apt.id)),
    );

    if (pendingToCreate.length > 0) {
      const petIds = Array.from(new Set(pendingToCreate.map((apt) => apt.pet_id)));
      const petsRes =
        petIds.length > 0
          ? await adminClient.from('pets').select('id, name').in('id', petIds)
          : { data: [] };
      const petNameById = new Map((petsRes.data ?? []).map((p) => [p.id, p.name]));

      const insertRows: Database['public']['Tables']['notifications']['Insert'][] =
        pendingToCreate.map((apt) => {
          const content = buildVet30MinReminderContent({
            appointment: apt,
            petName: petNameById.get(apt.pet_id) ?? null,
            veterinarianName: params.veterinarianName,
          });
          return {
            recipient_id: params.veterinarianId,
            appointment_id: apt.id,
            kind: 'vet_agenda_reminder',
            title: content.title,
            body: content.body,
            action_url: content.actionUrl,
            dedupe_key: content.dedupeKey,
          };
        });

      const insertedRes = await adminClient
        .from('notifications')
        .upsert(insertRows, {
          onConflict: 'recipient_id,dedupe_key',
          ignoreDuplicates: true,
        })
        .select(
          'id, recipient_id, appointment_id, kind, title, body, action_url, read_at, pushed_at, created_at',
        );

      newlyCreatedReminders = (insertedRes.data ?? []) as PushNotificationItem[];
    }
  } else {
    const rpcRes = await params.supabase.rpc('enqueue_appointment_reminders');
    if (rpcRes.error && isSchemaMissingError(rpcRes.error)) {
      return emptyRunSummary({
        schemaMissing: true,
        dueAppointmentsCount: dueAppointments.length,
      });
    }

    newlyCreatedReminders = ((rpcRes.data ?? []) as PushNotificationItem[]).filter(
      (item) => item.kind === 'vet_agenda_reminder',
    );
  }

  let pushAttempted = 0;
  let pushDelivered = 0;

  if (shouldSendPushForChannel(params.channel)) {
    const pushClient = adminClient ?? params.supabase;
    for (const item of newlyCreatedReminders) {
      const dispatch = await dispatchWebPushForUser(
        pushClient,
        params.veterinarianId,
        {
          title: item.title,
          body: item.body,
          url: item.action_url,
          tag: `reminder-${item.id}`,
        },
        'queue',
      ).catch(() => ({ attempted: 0, delivered: 0, deactivated: 0 }));

      pushAttempted += dispatch.attempted;
      pushDelivered += dispatch.delivered;

      if (dispatch.delivered > 0) {
        await pushClient
          .from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', item.id);
      }
    }

    if (pushAttempted > 0) {
      await recordVet30MinReminderOutbox({
        recipientUserId: params.veterinarianId,
        includeEmail: false,
        emailSent: false,
        pushAttempted,
        pushDelivered,
      });
    }
  }

  const externalStats = await dispatchVetExternalRemindersForCreatedNotifications({
    reminders: newlyCreatedReminders,
    recipientUserId: params.veterinarianId,
    recipientEmail: params.recipientEmail,
    recipientPhone: params.recipientPhone,
    veterinarianName: params.veterinarianName,
    channel: params.channel,
    supabase: adminClient ?? params.supabase,
  });

  return emptyRunSummary({
    dueAppointmentsCount: dueAppointments.length,
    triggeredCount: newlyCreatedReminders.length,
    pushAttempted,
    pushDelivered,
    emailSent: externalStats.emailSent,
    emailQueued: externalStats.emailQueued,
    emailFailed: externalStats.emailFailed,
    whatsappAttempted: externalStats.whatsappAttempted,
    whatsappSent: externalStats.whatsappSent,
    whatsappQueued: externalStats.whatsappQueued,
    whatsappFailed: externalStats.whatsappFailed,
    createdNotifications: newlyCreatedReminders,
  });
}

export async function runAllVets30MinReminderSweep(
  now: Date = new Date(),
): Promise<VetReminderRunSummary & { serviceRoleConfigured: boolean; veterinariansNotified: number }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return {
      ...emptyRunSummary(),
      serviceRoleConfigured: false,
      veterinariansNotified: 0,
    };
  }

  const minIso = new Date(now.getTime() - VET_REMINDER_WINDOW_PAST_BUFFER_MS).toISOString();
  const maxIso = new Date(now.getTime() + VET_REMINDER_WINDOW_FUTURE_MS).toISOString();

  const dueAppointmentsRes = await adminClient
    .from('appointments')
    .select(
      'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
    )
    .in('status', ['confirmed', 'pending'])
    .gt('starts_at', minIso)
    .lte('starts_at', maxIso)
    .order('starts_at', { ascending: true })
    .limit(500);

  if (dueAppointmentsRes.error) {
    return {
      ...emptyRunSummary({
        schemaMissing: isSchemaMissingError(dueAppointmentsRes.error),
      }),
      serviceRoleConfigured: true,
      veterinariansNotified: 0,
    };
  }

  const allDueAppointments = filterAppointmentsDueForVet30MinReminder(
    (dueAppointmentsRes.data ?? []).map((row) => ({ ...row, pet: null })) as Appointment[],
    now,
  );

  if (allDueAppointments.length === 0) {
    return {
      ...emptyRunSummary(),
      serviceRoleConfigured: true,
      veterinariansNotified: 0,
    };
  }

  const vetIds = Array.from(
    new Set(allDueAppointments.map((apt) => apt.veterinarian_id)),
  );
  const { data: vetProfiles } = await adminClient
    .from('profiles')
    .select('id, display_name, email, phone')
    .in('id', vetIds);
  const vetProfileById = new Map((vetProfiles ?? []).map((p) => [p.id, p]));

  let triggeredCount = 0;
  let pushAttempted = 0;
  let pushDelivered = 0;
  let emailSent = 0;
  let emailQueued = 0;
  let emailFailed = 0;
  let whatsappAttempted = 0;
  let whatsappSent = 0;
  let whatsappQueued = 0;
  let whatsappFailed = 0;
  const createdNotifications: PushNotificationItem[] = [];
  const notifiedVets = new Set<string>();

  for (const vetId of vetIds) {
    const profile = vetProfileById.get(vetId);
    const authUserRes = await adminClient.auth.admin
      .getUserById(vetId)
      .catch(() => ({ data: { user: null } }));
    const meta = authUserRes.data?.user?.user_metadata as
      | Record<string, unknown>
      | undefined;

    const enabled = isVetAutoReminderEnabled(meta?.vet_auto_reminder_enabled);
    const channel = normalizeVetReminderChannel(meta?.vet_reminder_channel, 'both');
    const recipientEmail = authUserRes.data?.user?.email ?? profile?.email ?? null;
    const recipientPhone =
      (typeof meta?.vet_whatsapp_phone === 'string' && meta.vet_whatsapp_phone.trim())
        ? meta.vet_whatsapp_phone
        : profile?.phone ?? null;
    const veterinarianName =
      profile?.display_name ??
      (typeof meta?.display_name === 'string' ? meta.display_name : null);

    const vetRun = await runVet30MinRemindersForVeterinarian({
      supabase: adminClient,
      veterinarianId: vetId,
      recipientEmail,
      recipientPhone,
      veterinarianName,
      channel,
      enabled,
      now,
    });

    if (vetRun.triggeredCount > 0) {
      notifiedVets.add(vetId);
    }
    triggeredCount += vetRun.triggeredCount;
    pushAttempted += vetRun.pushAttempted;
    pushDelivered += vetRun.pushDelivered;
    emailSent += vetRun.emailSent;
    emailQueued += vetRun.emailQueued;
    emailFailed += vetRun.emailFailed;
    whatsappAttempted += vetRun.whatsappAttempted;
    whatsappSent += vetRun.whatsappSent;
    whatsappQueued += vetRun.whatsappQueued;
    whatsappFailed += vetRun.whatsappFailed;
    createdNotifications.push(...vetRun.createdNotifications);
  }

  return {
    ...emptyRunSummary({
      dueAppointmentsCount: allDueAppointments.length,
      triggeredCount,
      pushAttempted,
      pushDelivered,
      emailSent,
      emailQueued,
      emailFailed,
      whatsappAttempted,
      whatsappSent,
      whatsappQueued,
      whatsappFailed,
      createdNotifications,
    }),
    serviceRoleConfigured: true,
    veterinariansNotified: notifiedVets.size,
  };
}
