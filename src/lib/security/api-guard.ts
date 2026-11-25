import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isEmailConfirmedUser } from '../auth/guards';
import { logAuditEvent } from '../logging/audit';
import {
  buildRateLimitHeaders,
  extractClientIp,
  globalApiRateLimiter,
  type RateLimitResult,
} from './rate-limit';
import { isSupabaseConfigured } from '../supabase/config';
import { createSupabaseServerClient } from '../supabase/server';

export interface ApiRateLimitOptions {
  routeKey: string;
  limit?: number;
  windowMs?: number;
}

export function applyRateLimitHeadersToResponse(
  response: NextResponse,
  rateLimit: RateLimitResult | null,
): NextResponse {
  if (!rateLimit) return response;
  const headers = buildRateLimitHeaders(rateLimit);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function checkRequestRateLimit(
  request: NextRequest,
  options: ApiRateLimitOptions & { userId?: string | null },
): { allowed: true; rateLimit: RateLimitResult } | { allowed: false; response: NextResponse } {
  const clientIp = extractClientIp(request.headers);
  const actorKey = options.userId ? `user:${options.userId}` : `ip:${clientIp}`;
  const key = `${options.routeKey}:${actorKey}`;
  const rateLimit = globalApiRateLimiter.check(key, {
    limit: options.limit ?? 60,
    windowMs: options.windowMs ?? 60_000,
  });

  if (!rateLimit.allowed) {
    const requestId = crypto.randomUUID();
    logAuditEvent({
      event: 'api.rate_limited',
      resource: options.routeKey,
      action: request.method,
      outcome: 'rate_limited',
      actorId: options.userId ?? null,
      statusCode: 429,
      requestId,
      metadata: {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    const response = NextResponse.json(
      {
        error: 'Muitas requisições em sequência. Aguarde alguns segundos e tente novamente.',
        code: 'RATE_LIMITED',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 },
    );
    return {
      allowed: false,
      response: applyRateLimitHeadersToResponse(response, rateLimit),
    };
  }

  return { allowed: true, rateLimit };
}

export type ProtectedApiContextResult =
  | {
      ok: true;
      supabase: ReturnType<typeof createSupabaseServerClient>;
      user: User;
      rateLimit: RateLimitResult;
      requestId: string;
    }
  | { ok: false; response: NextResponse };

export async function requireProtectedApiContext(
  request: NextRequest,
  options: ApiRateLimitOptions,
): Promise<ProtectedApiContextResult> {
  const requestId = crypto.randomUUID();

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Supabase não configurado.' },
        { status: 503 },
      ),
    };
  }

  // First enforce IP-based pre-auth rate limit to prevent brute force.
  const preAuthLimit = checkRequestRateLimit(request, {
    routeKey: `${options.routeKey}:pre`,
    limit: Math.max(options.limit ?? 60, 90),
    windowMs: options.windowMs ?? 60_000,
  });
  if (!preAuthLimit.allowed) {
    return { ok: false, response: preAuthLimit.response };
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    logAuditEvent({
      event: 'auth.unauthorized_api_access',
      resource: options.routeKey,
      action: request.method,
      outcome: 'denied',
      statusCode: 401,
      requestId,
    });
    return {
      ok: false,
      response: applyRateLimitHeadersToResponse(
        NextResponse.json(
          { error: 'Autenticação necessária.' },
          { status: 401 },
        ),
        preAuthLimit.rateLimit,
      ),
    };
  }

  if (!isEmailConfirmedUser(authData.user)) {
    logAuditEvent({
      event: 'auth.unconfirmed_email_blocked',
      resource: options.routeKey,
      action: request.method,
      outcome: 'denied',
      actorId: authData.user.id,
      statusCode: 403,
      requestId,
    });
    return {
      ok: false,
      response: applyRateLimitHeadersToResponse(
        NextResponse.json(
          {
            error:
              'Confirme seu e-mail pelo link enviado antes de acessar esta funcionalidade.',
            code: 'EMAIL_NOT_CONFIRMED',
          },
          { status: 403 },
        ),
        preAuthLimit.rateLimit,
      ),
    };
  }

  const userLimit = checkRequestRateLimit(request, {
    ...options,
    userId: authData.user.id,
  });
  if (!userLimit.allowed) {
    return { ok: false, response: userLimit.response };
  }

  return {
    ok: true,
    supabase,
    user: authData.user,
    rateLimit: userLimit.rateLimit,
    requestId,
  };
}
