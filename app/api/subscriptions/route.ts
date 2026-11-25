import { NextResponse, type NextRequest } from 'next/server';
import { normalizeUserRole } from '@/lib/auth/guards';
import { canManageSubscriptionStatus } from '@/lib/clinical/server-flows';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordSubscriptionNotificationOutbox,
} from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  subscribePetPlanSchema,
  updateSubscriptionStatusSchema,
} from '@/lib/validations';

const SUBSCRIPTION_COLUMNS =
  'id, plan_id, pet_id, owner_id, status, discount_percent, started_at, next_billing_at, cancelled_at';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:subscriptions:write',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = subscribePetPlanSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('subscribe_pet_to_plan', {
    target_plan: parsed.data.planId,
    target_pet: parsed.data.petId,
    target_method: parsed.data.method,
  });

  if (error || !data) {
    const status =
      error?.code === '42501'
        ? 403
        : error?.code === 'P0002'
          ? 404
          : error?.code === '23505'
            ? 409
            : 400;
    const failedAudit = {
      event: 'subscriptions.create_failed',
      resource: 'pet_subscriptions',
      action: 'subscribe',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: {
        planId: parsed.data.planId,
        petId: parsed.data.petId,
        method: parsed.data.method,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível concluir a assinatura do Clube DrVet.',
        status,
      ),
      rateLimit,
    );
  }

  const createdAudit = {
    event: 'subscriptions.created',
    resource: 'pet_subscriptions',
    action: 'subscribe',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      subscriptionId: data.id,
      planId: parsed.data.planId,
      petId: parsed.data.petId,
      method: parsed.data.method,
    },
  };
  logAuditEvent(createdAudit);
  await Promise.all([
    persistServerAuditLog(createdAudit),
    recordSubscriptionNotificationOutbox({
      recipientUserId: authUser.id,
      event: 'created',
    }),
  ]);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ subscription: data }, { status: 201 }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:subscriptions:write',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateSubscriptionStatusSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [{ data: profile }, { data: existingSub, error: lookupError }] =
    await Promise.all([
      supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle(),
      supabase
        .from('pet_subscriptions')
        .select('id, owner_id, status')
        .eq('id', parsed.data.subscriptionId)
        .maybeSingle(),
    ]);

  if (lookupError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        lookupError,
        'Não foi possível localizar a assinatura solicitada.',
        500,
      ),
      rateLimit,
    );
  }

  if (!existingSub) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Assinatura não encontrada.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const actorRole = normalizeUserRole(
    profile?.role ?? authUser.user_metadata?.role,
  );
  if (
    !canManageSubscriptionStatus({
      actorId: authUser.id,
      actorRole,
      subscriptionOwnerId: existingSub.owner_id,
    })
  ) {
    const deniedAudit = {
      event: 'subscriptions.status_update_denied',
      resource: 'pet_subscriptions',
      action: 'update_status',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: {
        subscriptionId: parsed.data.subscriptionId,
      },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Você não tem permissão para alterar esta assinatura.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase
    .from('pet_subscriptions')
    .update({
      status: parsed.data.status,
      cancelled_at:
        parsed.data.status === 'cancelled' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.subscriptionId)
    .select(SUBSCRIPTION_COLUMNS)
    .single();

  if (error || !data) {
    const failedAudit = {
      event: 'subscriptions.status_update_failed',
      resource: 'pet_subscriptions',
      action: 'update_status',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
      metadata: {
        subscriptionId: parsed.data.subscriptionId,
        targetStatus: parsed.data.status,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível atualizar o status da assinatura.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const updatedAudit = {
    event: 'subscriptions.status_updated',
    resource: 'pet_subscriptions',
    action: 'update_status',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      subscriptionId: data.id,
      previousStatus: existingSub.status,
      status: data.status,
    },
  };
  logAuditEvent(updatedAudit);
  await Promise.all([
    persistServerAuditLog(updatedAudit),
    recordSubscriptionNotificationOutbox({
      recipientUserId: existingSub.owner_id,
      event: 'status_updated',
    }),
  ]);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ subscription: data }),
    rateLimit,
  );
}
