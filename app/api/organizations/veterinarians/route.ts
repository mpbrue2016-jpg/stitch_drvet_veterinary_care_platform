import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { avatarPathSchema, vetProfileSettingsSchema } from '@/lib/validations';

const registerVeterinarianSchema = z
  .object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
    registration_number: z.string().trim().min(1).max(32),
    registration_region: z.string().regex(/^[A-Z]{2}$/),
    specialty: z.string().trim().max(120).nullable().optional(),
    avatar_path: avatarPathSchema.nullable().optional(),
  })
  .strict();

const approveVeterinarianSchema = z
  .object({
    organization_id: z.string().uuid(),
    user_id: z.string().uuid(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:organizations:vets',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = registerVeterinarianSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe organização, usuário e registro profissional válidos.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { error } = await supabase.rpc('add_veterinarian', {
    target_organization: parsed.data.organization_id,
    target_user: parsed.data.user_id,
    target_registration_number: parsed.data.registration_number,
    target_registration_region: parsed.data.registration_region,
    target_specialty: parsed.data.specialty || null,
    target_avatar_path: parsed.data.avatar_path || null,
  });

  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400;
    const failedAudit = {
      event: 'veterinarians.register_failed',
      resource: 'veterinarian_profiles',
      action: 'create',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { organizationId: parsed.data.organization_id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível cadastrar. Confirme a conta e as permissões.',
        status,
      ),
      rateLimit,
    );
  }

  const { data: professional } = await supabase
    .from('veterinarian_profiles')
    .select(
      'organization_id, user_id, registration_number, registration_region, specialty, status, avatar_path, created_at',
    )
    .eq('organization_id', parsed.data.organization_id)
    .eq('user_id', parsed.data.user_id)
    .maybeSingle();

  const createdAudit = {
    event: 'veterinarians.registered',
    resource: 'veterinarian_profiles',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      organizationId: parsed.data.organization_id,
      targetUserId: parsed.data.user_id,
      hasAvatar: Boolean(parsed.data.avatar_path),
    },
  };
  logAuditEvent(createdAudit);
  await persistServerAuditLog(createdAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      {
        status: 'pending_approval',
        professional: professional ?? {
          organization_id: parsed.data.organization_id,
          user_id: parsed.data.user_id,
          registration_number: parsed.data.registration_number,
          registration_region: parsed.data.registration_region,
          specialty: parsed.data.specialty ?? null,
          avatar_path: parsed.data.avatar_path ?? null,
          status: 'pending_approval',
          created_at: new Date().toISOString(),
        },
      },
      { status: 201 },
    ),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:organizations:vets',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = approveVeterinarianSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe organização e profissional válidos.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { error } = await supabase.rpc('approve_veterinarian', {
    target_organization: parsed.data.organization_id,
    target_user: parsed.data.user_id,
  });
  if (error) {
    const status =
      error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    const failedAudit = {
      event: 'veterinarians.approve_failed',
      resource: 'veterinarian_profiles',
      action: 'approve',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: {
        organizationId: parsed.data.organization_id,
        targetUserId: parsed.data.user_id,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível aprovar este profissional.',
        status,
      ),
      rateLimit,
    );
  }

  const approvedAudit = {
    event: 'veterinarians.approved',
    resource: 'veterinarian_profiles',
    action: 'approve',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      organizationId: parsed.data.organization_id,
      targetUserId: parsed.data.user_id,
    },
  };
  logAuditEvent(approvedAudit);
  await persistServerAuditLog(approvedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ status: 'approved' }),
    rateLimit,
  );
}

export async function PUT(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:organizations:vet-self',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = vetProfileSettingsSchema.strict().safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados do perfil profissional inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: professional, error } = await supabase.rpc('update_my_vet_profile', {
    target_consultation_fee_cents: parsed.data.consultation_fee_cents,
    target_bio: parsed.data.bio?.trim() || null,
    target_is_online_now:
      typeof parsed.data.is_online_now === 'boolean'
        ? parsed.data.is_online_now
        : null,
    target_avatar_path: parsed.data.avatar_path?.trim() || null,
  });

  if (error || !professional) {
    const status =
      error?.code === 'P0002' ? 404 : error?.code === '42501' ? 403 : 400;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error ?? new Error('Perfil veterinário aprovado não encontrado.'),
        'Não foi possível atualizar seu perfil profissional.',
        status,
      ),
      rateLimit,
    );
  }

  const updatedAudit = {
    event: 'veterinarians.profile_updated',
    resource: 'veterinarian_profiles',
    action: 'update',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      consultationFeeCents: professional.consultation_fee_cents,
      isOnlineNow: professional.is_online_now,
    },
  };
  logAuditEvent(updatedAudit);
  await persistServerAuditLog(updatedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ professional }),
    rateLimit,
  );
}
