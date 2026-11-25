import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordRoleApplicationSubmittedOutbox,
} from '@/lib/notifications/outbox';
import { maskPixKeyForDisplay } from '@/lib/payments/pix-mask';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { strictRoleApplicationSchema } from '@/lib/validations';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:role-applications:create',
    limit: 10,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = strictRoleApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error: 'Dados de credenciamento inválidos.',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const input = parsed.data;
  const { data: application, error } = await supabase.rpc('submit_role_application', {
    target_requested_role: input.requested_role,
    target_organization_name: input.organization_name,
    target_document_id: input.document_id,
    target_registration_region: input.registration_region || null,
    target_specialty: input.specialty?.trim() || null,
    target_city: input.city?.trim() || null,
    target_state: input.state || null,
    target_avatar_path: input.avatar_path || null,
  });

  if (error || !application) {
    const status =
      error?.code === '23505' ? 409 : error?.code === '42501' ? 403 : 400;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error ?? new Error('Falha ao registrar credenciamento.'),
        'Não foi possível enviar sua solicitação de credenciamento.',
        status,
      ),
      rateLimit,
    );
  }

  await recordRoleApplicationSubmittedOutbox({
    recipientUserId: authUser.id,
  });

  const audit = {
    event: 'operations.role_application_submitted',
    resource: 'role_applications',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      applicationId: application.id,
      requestedRole: application.requested_role,
      documentMasked: maskPixKeyForDisplay(input.document_id),
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ application }, { status: 201 }),
    rateLimit,
  );
}
