import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { isEmailProviderConfigured } from '@/lib/notifications/email-dispatcher';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import { runVet30MinRemindersForVeterinarian } from '@/lib/notifications/vet-reminder-runner';
import {
  isVetAutoReminderEnabled,
  normalizeVetReminderChannel,
  normalizeWhatsappPhoneToE164,
  VET_REMINDER_LEAD_MINUTES,
} from '@/lib/notifications/vet-reminders';
import { isWhatsappProviderConfigured } from '@/lib/notifications/whatsapp-dispatcher';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { vetReminderSettingsSchema } from '@/lib/validations';
import { isSchemaMissingError } from '@/services/errors';

async function verifyVeterinarianAccess(
  supabase: Extract<
    Awaited<ReturnType<typeof requireProtectedApiContext>>,
    { ok: true }
  >['supabase'],
  userId: string,
) {
  const [profileRes, vetProfilesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, email, phone, role')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('veterinarian_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .limit(1),
  ]);

  if (profileRes.error && isSchemaMissingError(profileRes.error)) {
    return { schemaMissing: true as const, isVeterinarian: false, profile: null };
  }
  if (vetProfilesRes.error && isSchemaMissingError(vetProfilesRes.error)) {
    return { schemaMissing: true as const, isVeterinarian: false, profile: null };
  }

  const profile = profileRes.data;
  const isVeterinarian =
    (vetProfilesRes.data?.length ?? 0) > 0 || profile?.role === 'veterinarian';

  return {
    schemaMissing: false as const,
    isVeterinarian,
    profile,
  };
}

function resolveVetWhatsappPhone(
  meta: Record<string, unknown>,
  profilePhone: string | null | undefined,
): string | null {
  if (typeof meta.vet_whatsapp_phone === 'string') {
    const trimmed = meta.vet_whatsapp_phone.trim();
    if (trimmed) return normalizeWhatsappPhoneToE164(trimmed) ?? trimmed;
  }
  if (typeof profilePhone === 'string' && profilePhone.trim()) {
    return normalizeWhatsappPhoneToE164(profilePhone) ?? profilePhone.trim();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:vet-reminders:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const access = await verifyVeterinarianAccess(supabase, authUser.id);
  if (access.schemaMissing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error: 'Estrutura de notificações ainda não inicializada no Supabase.',
          code: 'SCHEMA_MISSING',
          schemaMissing: true,
        },
        { status: 503 },
      ),
      rateLimit,
    );
  }

  if (!access.isVeterinarian) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Apenas veterinários possuem lembretes individuais de consulta.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const channel = normalizeVetReminderChannel(meta.vet_reminder_channel, 'both');
  const enabled = isVetAutoReminderEnabled(meta.vet_auto_reminder_enabled);
  const recipientEmail = authUser.email ?? access.profile?.email ?? null;
  const recipientPhone = resolveVetWhatsappPhone(meta, access.profile?.phone);
  const veterinarianName =
    access.profile?.display_name ??
    (typeof meta.display_name === 'string' ? meta.display_name : null);

  const shouldSync = request.nextUrl.searchParams.get('sync') !== '0';
  const runSummary = shouldSync
    ? await runVet30MinRemindersForVeterinarian({
        supabase,
        veterinarianId: authUser.id,
        recipientEmail,
        recipientPhone,
        veterinarianName,
        channel,
        enabled,
      })
    : {
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
      };

  const recentRes = await supabase
    .from('notifications')
    .select(
      'id, recipient_id, appointment_id, kind, title, body, action_url, read_at, pushed_at, created_at',
    )
    .eq('recipient_id', authUser.id)
    .eq('kind', 'vet_agenda_reminder')
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentRes.error && isSchemaMissingError(recentRes.error)) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error: 'Tabela notifications ainda não inicializada no Supabase.',
          code: 'SCHEMA_MISSING',
          schemaMissing: true,
        },
        { status: 503 },
      ),
      rateLimit,
    );
  }

  if (recentRes.error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        recentRes.error,
        'Não foi possível carregar os lembretes automáticos do veterinário.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      schemaMissing: runSummary.schemaMissing,
      leadMinutes: VET_REMINDER_LEAD_MINUTES,
      enabled,
      channel,
      recipientEmail,
      recipientPhone,
      emailProviderConfigured: isEmailProviderConfigured(),
      whatsappProviderConfigured: isWhatsappProviderConfigured(),
      summary: {
        dueAppointmentsCount: runSummary.dueAppointmentsCount,
        triggeredCount: runSummary.triggeredCount,
        pushAttempted: runSummary.pushAttempted,
        pushDelivered: runSummary.pushDelivered,
        emailSent: runSummary.emailSent,
        emailQueued: runSummary.emailQueued,
        emailFailed: runSummary.emailFailed,
        whatsappAttempted: runSummary.whatsappAttempted,
        whatsappSent: runSummary.whatsappSent,
        whatsappQueued: runSummary.whatsappQueued,
        whatsappFailed: runSummary.whatsappFailed,
      },
      recentReminders: recentRes.data ?? [],
    }),
    rateLimit,
  );
}

async function handlePreferencesAndSync(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:vet-reminders:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const access = await verifyVeterinarianAccess(supabase, authUser.id);
  if (access.schemaMissing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error: 'Estrutura de notificações ainda não inicializada no Supabase.',
          code: 'SCHEMA_MISSING',
          schemaMissing: true,
        },
        { status: 503 },
      ),
      rateLimit,
    );
  }
  if (!access.isVeterinarian) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Apenas médicos-veterinários podem configurar estes lembretes.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = vetReminderSettingsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Preferências de lembrete inválidas.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const currentMeta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const nextChannel = normalizeVetReminderChannel(
    parsed.data.channel ?? currentMeta.vet_reminder_channel,
    'both',
  );
  const nextEnabled =
    parsed.data.enabled !== undefined
      ? parsed.data.enabled
      : isVetAutoReminderEnabled(currentMeta.vet_auto_reminder_enabled);

  let nextWhatsappPhone = resolveVetWhatsappPhone(currentMeta, access.profile?.phone);
  const hasPhoneUpdate = parsed.data.whatsappPhone !== undefined;
  if (hasPhoneUpdate) {
    nextWhatsappPhone = parsed.data.whatsappPhone
      ? normalizeWhatsappPhoneToE164(parsed.data.whatsappPhone)
      : null;
  }

  if (
    parsed.data.channel !== undefined ||
    parsed.data.enabled !== undefined ||
    hasPhoneUpdate
  ) {
    await supabase.auth.updateUser({
      data: {
        vet_reminder_channel: nextChannel,
        vet_auto_reminder_enabled: nextEnabled,
        ...(hasPhoneUpdate ? { vet_whatsapp_phone: nextWhatsappPhone } : {}),
      },
    });

    if (hasPhoneUpdate) {
      await supabase
        .from('profiles')
        .update({ phone: nextWhatsappPhone })
        .eq('id', authUser.id);
    }
  }

  const recipientEmail = authUser.email ?? access.profile?.email ?? null;
  const veterinarianName =
    access.profile?.display_name ??
    (typeof currentMeta.display_name === 'string'
      ? currentMeta.display_name
      : null);

  const shouldSyncNow = parsed.data.syncNow !== false;
  const runSummary = shouldSyncNow
    ? await runVet30MinRemindersForVeterinarian({
        supabase,
        veterinarianId: authUser.id,
        recipientEmail,
        recipientPhone: nextWhatsappPhone,
        veterinarianName,
        channel: nextChannel,
        enabled: nextEnabled,
      })
    : {
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
      };

  const auditPayload = {
    event: 'notifications.vet_30m_reminders_synced',
    resource: 'notifications',
    action: 'update',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      channel: nextChannel,
      enabled: nextEnabled,
      dueAppointmentsCount: runSummary.dueAppointmentsCount,
      triggeredCount: runSummary.triggeredCount,
      pushDelivered: runSummary.pushDelivered,
      emailSent: runSummary.emailSent,
      emailQueued: runSummary.emailQueued,
      whatsappSent: runSummary.whatsappSent,
      whatsappQueued: runSummary.whatsappQueued,
      whatsappFailed: runSummary.whatsappFailed,
    },
  };
  logAuditEvent(auditPayload);
  await persistServerAuditLog(auditPayload);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      schemaMissing: runSummary.schemaMissing,
      leadMinutes: VET_REMINDER_LEAD_MINUTES,
      enabled: nextEnabled,
      channel: nextChannel,
      recipientEmail,
      recipientPhone: nextWhatsappPhone,
      emailProviderConfigured: isEmailProviderConfigured(),
      whatsappProviderConfigured: isWhatsappProviderConfigured(),
      summary: {
        dueAppointmentsCount: runSummary.dueAppointmentsCount,
        triggeredCount: runSummary.triggeredCount,
        pushAttempted: runSummary.pushAttempted,
        pushDelivered: runSummary.pushDelivered,
        emailSent: runSummary.emailSent,
        emailQueued: runSummary.emailQueued,
        emailFailed: runSummary.emailFailed,
        whatsappAttempted: runSummary.whatsappAttempted,
        whatsappSent: runSummary.whatsappSent,
        whatsappQueued: runSummary.whatsappQueued,
        whatsappFailed: runSummary.whatsappFailed,
      },
      createdNotifications: runSummary.createdNotifications,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  return handlePreferencesAndSync(request);
}

export async function PATCH(request: NextRequest) {
  return handlePreferencesAndSync(request);
}
