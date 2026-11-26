import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import { runAllVets30MinReminderSweep } from '@/lib/notifications/vet-reminder-runner';
import { verifyCronSecretToken } from '@/lib/notifications/cron-auth';
import {
  applyRateLimitHeadersToResponse,
  checkRequestRateLimit,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';

function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return request.headers.get('x-cron-secret')?.trim() || null;
}

async function handleCronSweep(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const expectedSecret = process.env.REMINDER_CRON_SECRET?.trim();
  const providedSecret = extractBearerToken(request);

  const authorizedViaSecret =
    Boolean(expectedSecret) &&
    verifyCronSecretToken(providedSecret, expectedSecret);

  let actorId: string | null = null;
  let rateLimit = null;

  if (!authorizedViaSecret) {
    const ctx = await requireProtectedApiContext(request, {
      routeKey: 'api:cron:vet-reminders',
      limit: 15,
      windowMs: 60_000,
    });
    if (!ctx.ok) return ctx.response;

    rateLimit = ctx.rateLimit;
    actorId = ctx.user.id;

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('role')
      .eq('id', ctx.user.id)
      .maybeSingle();

    const isAdmin =
      profile?.role === 'admin' || ctx.user.app_metadata?.role === 'admin';
    if (!isAdmin) {
      logAuditEvent({
        event: 'cron.vet_reminders_denied',
        resource: 'notifications',
        action: 'cron_sweep',
        outcome: 'denied',
        actorId,
        statusCode: 403,
        requestId,
      });
      return applyRateLimitHeadersToResponse(
        NextResponse.json(
          { error: 'Apenas administradores ou agendador autorizado podem executar esta rotina.' },
          { status: 403 },
        ),
        rateLimit,
      );
    }
  } else {
    const limitCheck = checkRequestRateLimit(request, {
      routeKey: 'api:cron:vet-reminders:secret',
      limit: 30,
      windowMs: 60_000,
    });
    if (!limitCheck.allowed) return limitCheck.response;
    rateLimit = limitCheck.rateLimit;
  }

  const result = await runAllVets30MinReminderSweep();

  const auditPayload = {
    event: 'cron.vet_reminders_swept',
    resource: 'notifications',
    action: 'cron_sweep',
    outcome: 'allowed' as const,
    actorId,
    statusCode: 200,
    requestId,
    metadata: {
      authorizedViaSecret,
      serviceRoleConfigured: result.serviceRoleConfigured,
      dueAppointmentsCount: result.dueAppointmentsCount,
      triggeredCount: result.triggeredCount,
      veterinariansNotified: result.veterinariansNotified,
      pushDelivered: result.pushDelivered,
      emailSent: result.emailSent,
      emailQueued: result.emailQueued,
      whatsappSent: result.whatsappSent,
      whatsappQueued: result.whatsappQueued,
      whatsappFailed: result.whatsappFailed,
    },
  };
  logAuditEvent(auditPayload);
  await persistServerAuditLog(auditPayload);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      ok: true,
      serviceRoleConfigured: result.serviceRoleConfigured,
      emailProviderConfigured: result.emailProviderConfigured,
      whatsappProviderConfigured: result.whatsappProviderConfigured,
      schemaMissing: result.schemaMissing,
      dueAppointmentsCount: result.dueAppointmentsCount,
      triggeredCount: result.triggeredCount,
      veterinariansNotified: result.veterinariansNotified,
      pushAttempted: result.pushAttempted,
      pushDelivered: result.pushDelivered,
      emailSent: result.emailSent,
      emailQueued: result.emailQueued,
      emailFailed: result.emailFailed,
      whatsappAttempted: result.whatsappAttempted,
      whatsappSent: result.whatsappSent,
      whatsappQueued: result.whatsappQueued,
      whatsappFailed: result.whatsappFailed,
    }),
    rateLimit,
  );
}

export async function GET(request: NextRequest) {
  return handleCronSweep(request);
}

export async function POST(request: NextRequest) {
  return handleCronSweep(request);
}
