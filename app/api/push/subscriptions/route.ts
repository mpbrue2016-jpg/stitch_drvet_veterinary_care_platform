import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const allowedLeadMinutes = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.literal(120),
  z.literal(1440),
]);

const endpointSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return !(
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host === '169.254.169.254'
      );
    } catch {
      return false;
    }
  }, 'Endpoint Push inválido ou inseguro.');

const createSubscriptionSchema = z
  .object({
    endpoint: endpointSchema,
    p256dh: z.string().trim().min(16).max(512),
    auth_secret: z.string().trim().min(8).max(256),
    reminder_lead_minutes: allowedLeadMinutes.optional(),
    notify_appointments: z.boolean().optional(),
    notify_queue: z.boolean().optional(),
  })
  .strict();

const updatePreferencesSchema = z
  .object({
    id: z.string().uuid().optional(),
    reminder_lead_minutes: allowedLeadMinutes.optional(),
    notify_appointments: z.boolean().optional(),
    notify_queue: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

const deleteSubscriptionSchema = z
  .object({
    endpoint: endpointSchema.optional(),
    id: z.string().uuid().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.endpoint || data.id), {
    message: 'Informe endpoint ou id da inscrição.',
  });

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:subscriptions:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select(
      'id, user_id, endpoint, user_agent, role_hint, reminder_lead_minutes, notify_appointments, notify_queue, is_active, last_notified_at, created_at, updated_at',
    )
    .eq('user_id', authUser.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar as inscrições Push.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ subscriptions: data ?? [] }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:subscriptions:write',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados da inscrição Push inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();

  const roleHint = profile?.role ?? 'tutor';
  const userAgent = request.headers.get('user-agent')?.slice(0, 250) ?? null;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: authUser.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth_secret: parsed.data.auth_secret,
        user_agent: userAgent,
        role_hint: roleHint,
        reminder_lead_minutes: parsed.data.reminder_lead_minutes ?? 30,
        notify_appointments: parsed.data.notify_appointments ?? true,
        notify_queue: parsed.data.notify_queue ?? true,
        is_active: true,
      },
      { onConflict: 'endpoint' },
    )
    .select(
      'id, user_id, endpoint, user_agent, role_hint, reminder_lead_minutes, notify_appointments, notify_queue, is_active, last_notified_at, created_at, updated_at',
    )
    .single();

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível ativar as notificações Push.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ subscription: data }, { status: 201 }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:subscriptions:write',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Preferências inválidas.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const patchPayload: {
    reminder_lead_minutes?: number;
    notify_appointments?: boolean;
    notify_queue?: boolean;
    is_active?: boolean;
  } = {};

  if (parsed.data.reminder_lead_minutes !== undefined) {
    patchPayload.reminder_lead_minutes = parsed.data.reminder_lead_minutes;
  }
  if (parsed.data.notify_appointments !== undefined) {
    patchPayload.notify_appointments = parsed.data.notify_appointments;
  }
  if (parsed.data.notify_queue !== undefined) {
    patchPayload.notify_queue = parsed.data.notify_queue;
  }
  if (parsed.data.is_active !== undefined) {
    patchPayload.is_active = parsed.data.is_active;
  }

  let query = supabase
    .from('push_subscriptions')
    .update(patchPayload)
    .eq('user_id', authUser.id);

  if (parsed.data.id) {
    query = query.eq('id', parsed.data.id);
  }

  const { data, error } = await query.select(
    'id, user_id, endpoint, user_agent, role_hint, reminder_lead_minutes, notify_appointments, notify_queue, is_active, last_notified_at, created_at, updated_at',
  );

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível atualizar as preferências de notificação.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ subscriptions: data ?? [] }),
    rateLimit,
  );
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:push:subscriptions:write',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = deleteSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe o endpoint ou identificador da inscrição.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  let query = supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', authUser.id);

  if (parsed.data.id) {
    query = query.eq('id', parsed.data.id);
  } else if (parsed.data.endpoint) {
    query = query.eq('endpoint', parsed.data.endpoint);
  }

  const { error } = await query;
  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível remover a inscrição Push.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ removed: true }),
    rateLimit,
  );
}
