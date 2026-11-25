import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { normalizeUserRole } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { deleteAvailabilitySchema } from '@/lib/validations';

const createAvailabilitySchema = z
  .object({
    organization_id: z.string().uuid(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (value) => new Date(value.ends_at) > new Date(value.starts_at),
    'O fim do horário deve ser posterior ao início.',
  )
  .refine(
    (value) => new Date(value.starts_at) > new Date(),
    'Não é possível abrir horários no passado.',
  );

const updateAvailabilitySchema = z
  .object({
    id: z.string().uuid(),
    is_blocked: z.boolean(),
    block_reason: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:availability:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const mine = request.nextUrl.searchParams.get('mine') === 'true';
  const organizationId = request.nextUrl.searchParams.get('organization_id');
  if (
    organizationId &&
    !z.string().uuid().safeParse(organizationId).success
  ) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe uma organização válida.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  let availabilityQuery = supabase
    .from('professional_availability')
    .select(
      'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason',
    )
    .order('starts_at')
    .limit(100);
  if (mine) {
    availabilityQuery = availabilityQuery
      .eq('veterinarian_id', authUser.id)
      .gte('starts_at', new Date().toISOString());
    if (organizationId) {
      availabilityQuery = availabilityQuery.eq('organization_id', organizationId);
    }
  } else {
    availabilityQuery = availabilityQuery
      .eq('is_available', true)
      .gt('starts_at', new Date().toISOString());
  }

  const { data, error } = await availabilityQuery;

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar os horários.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ availability: data }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:availability:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: professional, error: professionalError } = await supabase
    .from('veterinarian_profiles')
    .select('organization_id, user_id')
    .eq('organization_id', parsed.data.organization_id)
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (professionalError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        professionalError,
        'Não foi possível verificar o cadastro profissional.',
        500,
      ),
      rateLimit,
    );
  }
  if (!professional) {
    const deniedAudit = {
      event: 'availability.create_denied',
      resource: 'professional_availability',
      action: 'create',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: { organizationId: parsed.data.organization_id },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Profissional não encontrado nesta organização.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase
    .from('professional_availability')
    .insert({
      organization_id: professional.organization_id,
      veterinarian_id: professional.user_id,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
    })
    .select(
      'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason',
    )
    .single();

  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '23P01'
          ? 'Este horário se sobrepõe a outro horário disponível.'
          : 'Não foi possível criar o horário. Verifique aprovação e permissões.',
        error.code === '23P01' ? 409 : error.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const createdAudit = {
    event: 'availability.created',
    resource: 'professional_availability',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: { availabilityId: data.id, organizationId: professional.organization_id },
  };
  logAuditEvent(createdAudit);
  await persistServerAuditLog(createdAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ availability: data }, { status: 201 }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:availability:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('set_availability_block', {
    target_availability: parsed.data.id,
    should_block: parsed.data.is_blocked,
    target_reason: parsed.data.is_blocked
      ? parsed.data.block_reason ?? null
      : null,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : error.code === '23P01'
              ? 409
              : 500;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '23P01'
          ? 'Este horário possui um agendamento ativo e não pode ser bloqueado.'
          : error.code === '22023'
            ? 'O horário já começou ou o motivo do bloqueio é inválido.'
            : 'Não foi possível atualizar a disponibilidade.',
        status,
      ),
      rateLimit,
    );
  }

  const toggledAudit = {
    event: 'availability.block_toggled',
    resource: 'professional_availability',
    action: parsed.data.is_blocked ? 'block' : 'unblock',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { availabilityId: parsed.data.id },
  };
  logAuditEvent(toggledAudit);
  await persistServerAuditLog(toggledAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ availability: data }),
    rateLimit,
  );
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:availability:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const idFromQuery = request.nextUrl.searchParams.get('id');
  const candidate =
    body && typeof body === 'object' && 'id' in body
      ? body
      : idFromQuery
        ? { id: idFromQuery }
        : null;
  const parsed = deleteAvailabilitySchema.safeParse(candidate);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um horário válido para exclusão.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [{ data: profile }, { data: slot, error: lookupError }] =
    await Promise.all([
      supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle(),
      supabase
        .from('professional_availability')
        .select('id, veterinarian_id, organization_id')
        .eq('id', parsed.data.id)
        .maybeSingle(),
    ]);

  if (lookupError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        lookupError,
        'Não foi possível verificar o horário informado.',
        500,
      ),
      rateLimit,
    );
  }

  if (!slot) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Horário não encontrado.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const actorRole = normalizeUserRole(
    profile?.role ?? authUser.user_metadata?.role,
  );
  if (actorRole !== 'admin' && slot.veterinarian_id !== authUser.id) {
    const deniedAudit = {
      event: 'availability.delete_denied',
      resource: 'professional_availability',
      action: 'delete',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: { availabilityId: parsed.data.id },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Sem permissão para excluir este horário.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const { error } = await supabase
    .from('professional_availability')
    .delete()
    .eq('id', parsed.data.id);

  if (error) {
    const status =
      error.code === '23503' ? 409 : error.code === '42501' ? 403 : 500;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '23503'
          ? 'Este horário já está vinculado a um agendamento e não pode ser excluído.'
          : 'Não foi possível excluir o horário.',
        status,
      ),
      rateLimit,
    );
  }

  const deletedAudit = {
    event: 'availability.deleted',
    resource: 'professional_availability',
    action: 'delete',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      availabilityId: parsed.data.id,
      organizationId: slot.organization_id,
    },
  };
  logAuditEvent(deletedAudit);
  await persistServerAuditLog(deletedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ deletedId: parsed.data.id }),
    rateLimit,
  );
}
