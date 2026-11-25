import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const createOrganizationSchema = z
  .object({ name: z.string().trim().min(2).max(120) })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:organizations:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', authUser.id);

  if (membershipError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        membershipError,
        'Não foi possível carregar as organizações.',
        500,
      ),
      rateLimit,
    );
  }

  const organizationIds = memberships.map((membership) => membership.organization_id);
  if (organizationIds.length === 0) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        organizations: [],
        professionals: [],
        currentUserId: authUser.id,
      }),
      rateLimit,
    );
  }

  const [{ data: organizations, error: organizationError }, { data: professionals, error: professionalError }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('id, name')
        .in('id', organizationIds),
      supabase
        .from('veterinarian_profiles')
        .select(
          'organization_id, user_id, registration_number, registration_region, specialty, status',
        )
        .in('organization_id', organizationIds),
    ]);

  if (organizationError || professionalError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        organizationError ?? professionalError,
        'Não foi possível carregar os dados profissionais.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      organizations: organizations.map((organization) => ({
        ...organization,
        role:
          memberships.find(
            (membership) => membership.organization_id === organization.id,
          )?.role ?? 'staff',
      })),
      professionals,
      currentUserId: authUser.id,
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:organizations:write',
    limit: 15,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um nome válido para a organização.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('create_organization', {
    organization_name: parsed.data.name,
  });
  if (error || !data) {
    const failedAudit = {
      event: 'organizations.create_failed',
      resource: 'organizations',
      action: 'create',
      outcome: (error?.code === '42501' ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível criar a organização.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const { data: organizationRow } = await supabase
    .from('organizations')
    .select('id, name, created_at')
    .eq('id', data)
    .maybeSingle();

  const createdAudit = {
    event: 'organizations.created',
    resource: 'organizations',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: { organizationId: data },
  };
  logAuditEvent(createdAudit);
  await persistServerAuditLog(createdAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      {
        organization_id: data,
        organization: organizationRow
          ? {
              id: organizationRow.id,
              name: organizationRow.name,
              role: 'owner' as const,
              created_at: organizationRow.created_at,
            }
          : {
              id: data,
              name: parsed.data.name,
              role: 'owner' as const,
              created_at: new Date().toISOString(),
            },
      },
      { status: 201 },
    ),
    rateLimit,
  );
}
