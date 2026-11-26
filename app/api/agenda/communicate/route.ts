import { NextResponse, type NextRequest } from 'next/server';
import {
  buildIndividualVetAgendaDigest,
  VET_AGENDA_NOTIFICATION_KINDS,
} from '@/lib/agenda/individual-digest';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordVetAgendaNotificationOutbox,
} from '@/lib/notifications/outbox';
import {
  dispatchBackgroundPushWithServiceRole,
  dispatchWebPushForUser,
} from '@/lib/push/server-dispatch';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { dispatchVetAgendaCommunicadoSchema } from '@/lib/validations';
import { isSchemaMissingError } from '@/services/errors';
import type {
  Appointment,
  AvailabilitySlot,
  PushNotificationItem,
} from '@/types/entities';

async function loadIndividualVetAgendaContext(
  supabase: Extract<
    Awaited<ReturnType<typeof requireProtectedApiContext>>,
    { ok: true }
  >['supabase'],
  userId: string,
  userMetadataName?: unknown,
) {
  const now = new Date();
  const horizonIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profileRes,
    vetProfilesRes,
    appointmentsRes,
    slotsRes,
    notificationsRes,
    outboxRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('veterinarian_profiles')
      .select(
        'organization_id, user_id, registration_number, registration_region, specialty, status',
      )
      .eq('user_id', userId),
    supabase
      .from('appointments')
      .select(
        'id, availability_id, organization_id, pet_id, tutor_id, veterinarian_id, kind, status, reason, starts_at, ends_at',
      )
      .eq('veterinarian_id', userId)
      .gte('ends_at', now.toISOString())
      .lte('starts_at', horizonIso)
      .order('starts_at', { ascending: true })
      .limit(100),
    supabase
      .from('professional_availability')
      .select(
        'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason',
      )
      .eq('veterinarian_id', userId)
      .gt('starts_at', now.toISOString())
      .lte('starts_at', horizonIso)
      .order('starts_at', { ascending: true })
      .limit(100),
    supabase
      .from('notifications')
      .select(
        'id, recipient_id, appointment_id, kind, title, body, action_url, read_at, pushed_at, created_at',
      )
      .eq('recipient_id', userId)
      .in('kind', VET_AGENDA_NOTIFICATION_KINDS)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('notification_outbox')
      .select('channel, status')
      .eq('recipient_user_id', userId)
      .in('template_key', [
        'vet_agenda_summary',
        'vet_agenda_reminder',
        'appointment_created',
        'appointment_cancelled',
      ])
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const errorsToCheck = [
    profileRes.error,
    vetProfilesRes.error,
    appointmentsRes.error,
    slotsRes.error,
    notificationsRes.error,
  ].filter(Boolean);

  const schemaMissingError = errorsToCheck.find((err) => isSchemaMissingError(err));
  if (schemaMissingError) {
    return {
      schemaMissing: true as const,
      isVeterinarian: false,
      firstError: null,
    };
  }

  const firstFatalError = errorsToCheck[0] ?? null;
  if (firstFatalError) {
    return {
      schemaMissing: false as const,
      isVeterinarian: false,
      firstError: firstFatalError,
    };
  }

  const vetProfiles = vetProfilesRes.data ?? [];
  const profile = profileRes.data;
  const isVeterinarian =
    vetProfiles.length > 0 || profile?.role === 'veterinarian';

  const rawAppointments = appointmentsRes.data ?? [];
  const petIds = Array.from(new Set(rawAppointments.map((item) => item.pet_id)));
  const petsRes =
    petIds.length > 0
      ? await supabase.from('pets').select('id, name, species').in('id', petIds)
      : { data: [], error: null };
  const petById = new Map((petsRes.data ?? []).map((pet) => [pet.id, pet]));

  const appointments: Appointment[] = rawAppointments.map((row) => ({
    ...row,
    pet: petById.get(row.pet_id) ?? null,
  }));

  const slots: AvailabilitySlot[] = slotsRes.data ?? [];
  const approvedVet =
    vetProfiles.find((vp) => vp.status === 'approved') ?? vetProfiles[0] ?? null;
  const crmvLabel = approvedVet
    ? `CRMV-${approvedVet.registration_region} ${approvedVet.registration_number}`
    : null;
  const veterinarianName =
    profile?.display_name?.trim() ||
    (typeof userMetadataName === 'string' && userMetadataName.trim()) ||
    'Médico-Veterinário(a)';

  const digest = buildIndividualVetAgendaDigest({
    veterinarianId: userId,
    veterinarianName,
    crmvLabel,
    appointments,
    slots,
    now,
  });

  const notifications = (notificationsRes.data ?? []) as PushNotificationItem[];
  const outboxRows = outboxRes.error ? [] : (outboxRes.data ?? []);
  const outboxStats = {
    schemaReady: !outboxRes.error,
    emailQueued: outboxRows.filter(
      (row) => row.channel === 'email' && row.status === 'queued',
    ).length,
    pushSent: outboxRows.filter(
      (row) => row.channel === 'push' && row.status === 'sent',
    ).length,
  };

  return {
    schemaMissing: false as const,
    firstError: null,
    isVeterinarian,
    digest,
    notifications,
    outboxStats,
  };
}

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:agenda:communicate:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const context = await loadIndividualVetAgendaContext(
    supabase,
    authUser.id,
    authUser.user_metadata?.display_name,
  );

  if (context.schemaMissing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'As tabelas de agenda e comunicados individuais ainda não foram criadas no Supabase.',
          code: 'SCHEMA_MISSING',
          schemaMissing: true,
          isVeterinarian: false,
          notifications: [],
        },
        { status: 503 },
      ),
      rateLimit,
    );
  }

  if (context.firstError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        context.firstError,
        'Não foi possível carregar os comunicados da sua agenda individual.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      schemaMissing: false,
      isVeterinarian: context.isVeterinarian,
      digest: context.digest,
      notifications: context.notifications,
      unreadCount: context.notifications.filter((item) => !item.read_at).length,
      outboxStats: context.outboxStats,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:agenda:communicate:post',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => ({}));
  const parsed = dispatchVetAgendaCommunicadoSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Parâmetros inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const context = await loadIndividualVetAgendaContext(
    supabase,
    authUser.id,
    authUser.user_metadata?.display_name,
  );

  if (context.schemaMissing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'A estrutura de comunicados individuais ainda não foi aplicada no Supabase.',
          code: 'SCHEMA_MISSING',
          schemaMissing: true,
        },
        { status: 503 },
      ),
      rateLimit,
    );
  }

  if (context.firstError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        context.firstError,
        'Não foi possível gerar o comunicado da sua agenda.',
        500,
      ),
      rateLimit,
    );
  }

  if (!context.isVeterinarian || !context.digest) {
    const deniedAudit = {
      event: 'agenda.communicado_denied',
      resource: 'notifications',
      action: 'communicate',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'Apenas médicos-veterinários cadastrados possuem agenda individual para receber comunicados.',
        },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const forceNew = parsed.data.force ?? true;
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'enqueue_vet_agenda_summary',
    { force_new: forceNew },
  );

  if (rpcError) {
    if (isSchemaMissingError(rpcError)) {
      return applyRateLimitHeadersToResponse(
        NextResponse.json(
          {
            error:
              'Execute a migration #17 no Supabase para habilitar os comunicados automáticos da agenda individual.',
            code: 'SCHEMA_MISSING',
            schemaMissing: true,
          },
          { status: 503 },
        ),
        rateLimit,
      );
    }

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        rpcError,
        'Não foi possível registrar o comunicado da agenda individual.',
        rpcError.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const notification = (rpcRows?.[0] ?? null) as PushNotificationItem | null;
  const pushPayload = {
    title: notification?.title ?? context.digest.title,
    body: notification?.body ?? context.digest.body,
    url: notification?.action_url ?? '/agenda',
    tag: notification
      ? `vet-agenda-summary-${notification.id}`
      : `vet-agenda-summary-${authUser.id}`,
  };

  let dispatch = await dispatchBackgroundPushWithServiceRole(
    authUser.id,
    pushPayload,
    'queue',
  ).catch(() => ({ attempted: 0, delivered: 0, deactivated: 0 }));

  if (dispatch.attempted === 0) {
    dispatch = await dispatchWebPushForUser(
      supabase,
      authUser.id,
      pushPayload,
      'queue',
    ).catch(() => ({ attempted: 0, delivered: 0, deactivated: 0 }));
  }

  if (notification && dispatch.delivered > 0) {
    await supabase
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', notification.id)
      .eq('recipient_id', authUser.id);
  }

  const outboxResult = await recordVetAgendaNotificationOutbox({
    recipientUserId: authUser.id,
    templateKey: 'vet_agenda_summary',
    pushAttempted: dispatch.attempted,
    pushDelivered: dispatch.delivered,
  });

  const auditPayload = {
    event: 'agenda.communicado_dispatched',
    resource: 'notifications',
    action: 'communicate',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      confirmedNext7Days: context.digest.confirmedNext7Days,
      pendingNext7Days: context.digest.pendingNext7Days,
      openFutureSlots: context.digest.openFutureSlots,
      pushDelivered: dispatch.delivered,
    },
  };
  logAuditEvent(auditPayload);
  await persistServerAuditLog(auditPayload);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      {
        notification,
        digest: context.digest,
        dispatch,
        outboxRecorded: outboxResult.recordedCount,
      },
      { status: 201 },
    ),
    rateLimit,
  );
}
