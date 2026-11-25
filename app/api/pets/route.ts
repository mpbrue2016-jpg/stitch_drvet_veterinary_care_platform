import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { parseListFilterParams } from '@/lib/pagination';
import {
  createAuthorizedPet,
  createSupabasePetsDataClient,
  deleteAuthorizedPet,
  listAuthorizedPets,
  updateAuthorizedPet,
} from '@/lib/pets/server-pets';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import type { RateLimitResult } from '@/lib/security/rate-limit';

function toJsonResponse<T>(
  result:
    | { ok: true; status: number; data: T }
    | { ok: false; status: number; error: string; code?: string; details?: unknown },
  rateLimit: RateLimitResult | null,
) {
  const response = result.ok
    ? NextResponse.json(result.data, { status: result.status })
    : NextResponse.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
          ...(result.details ? { details: result.details } : {}),
        },
        { status: result.status },
      );

  return applyRateLimitHeadersToResponse(response, rateLimit);
}

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:pets:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;

  const scope = request.nextUrl.searchParams.get('scope');
  const petId = request.nextUrl.searchParams.get('id');
  const { page, limit, q } = parseListFilterParams(request.nextUrl.searchParams, {
    limit: 50,
    maxLimit: 100,
  });

  const result = await listAuthorizedPets(
    createSupabasePetsDataClient(ctx.supabase),
    ctx.user,
    { scope, petId, q, page, limit },
  );

  if (!result.ok && result.status === 403) {
    logAuditEvent({
      event: 'pets.list_denied',
      resource: 'pets',
      action: 'read',
      outcome: 'denied',
      actorId: ctx.user.id,
      statusCode: result.status,
      requestId: ctx.requestId,
      metadata: { scope: scope ?? 'mine' },
    });
  }

  return toJsonResponse(result, ctx.rateLimit);
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:pets:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;

  const body: unknown = await request.json().catch(() => null);
  const result = await createAuthorizedPet(
    createSupabasePetsDataClient(ctx.supabase),
    ctx.user,
    body,
  );

  logAuditEvent({
    event: result.ok ? 'pets.created' : 'pets.create_failed',
    resource: 'pets',
    action: 'create',
    outcome: result.ok ? 'allowed' : result.status === 403 ? 'denied' : 'error',
    actorId: ctx.user.id,
    statusCode: result.status,
    requestId: ctx.requestId,
    metadata: result.ok ? { petId: result.data.pet.id } : undefined,
  });

  return toJsonResponse(result, ctx.rateLimit);
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:pets:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;

  const body: unknown = await request.json().catch(() => null);
  const result = await updateAuthorizedPet(
    createSupabasePetsDataClient(ctx.supabase),
    ctx.user,
    body,
  );

  logAuditEvent({
    event: result.ok ? 'pets.updated' : 'pets.update_failed',
    resource: 'pets',
    action: 'update',
    outcome: result.ok ? 'allowed' : result.status === 403 ? 'denied' : 'error',
    actorId: ctx.user.id,
    statusCode: result.status,
    requestId: ctx.requestId,
    metadata: result.ok ? { petId: result.data.pet.id } : undefined,
  });

  return toJsonResponse(result, ctx.rateLimit);
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:pets:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;

  let petId = request.nextUrl.searchParams.get('id');
  if (!petId) {
    const body = (await request.json().catch(() => null)) as { id?: string } | null;
    petId = body?.id ?? null;
  }

  const result = await deleteAuthorizedPet(
    createSupabasePetsDataClient(ctx.supabase),
    ctx.user,
    petId,
  );

  logAuditEvent({
    event: result.ok ? 'pets.deleted' : 'pets.delete_failed',
    resource: 'pets',
    action: 'delete',
    outcome: result.ok ? 'allowed' : result.status === 403 ? 'denied' : 'error',
    actorId: ctx.user.id,
    statusCode: result.status,
    requestId: ctx.requestId,
    metadata: petId ? { petId } : undefined,
  });

  return toJsonResponse(result, ctx.rateLimit);
}
