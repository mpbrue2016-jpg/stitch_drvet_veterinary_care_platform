import { NextResponse, type NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { legalAcknowledgementSchema } from '@/lib/validations';

const ACKNOWLEDGEMENT_COLUMNS =
  'id, user_id, document_key, document_version, acknowledged_at';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:legal-acknowledgements:write',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = legalAcknowledgementSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Dados de aceite legal inválidos.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: existing, error: lookupError } = await supabase
    .from('legal_acknowledgements')
    .select(ACKNOWLEDGEMENT_COLUMNS)
    .eq('user_id', authUser.id)
    .eq('document_key', parsed.data.documentKey)
    .eq('document_version', parsed.data.documentVersion)
    .maybeSingle();

  if (lookupError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        lookupError,
        'Não foi possível consultar a ciência do documento.',
        500,
      ),
      rateLimit,
    );
  }

  if (existing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ acknowledgement: existing }),
      rateLimit,
    );
  }

  const { data, error } = await supabase
    .from('legal_acknowledgements')
    .insert({
      user_id: authUser.id,
      document_key: parsed.data.documentKey,
      document_version: parsed.data.documentVersion,
    })
    .select(ACKNOWLEDGEMENT_COLUMNS)
    .single();

  if (error || !data) {
    const failedAudit = {
      event: 'legal.acknowledgement_failed',
      resource: 'legal_acknowledgements',
      action: 'acknowledge',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: error?.code === '42501' ? 403 : 500,
      requestId,
      metadata: {
        documentKey: parsed.data.documentKey,
        documentVersion: parsed.data.documentVersion,
      },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível registrar sua ciência do documento.',
        error?.code === '42501' ? 403 : 500,
      ),
      rateLimit,
    );
  }

  const ackAudit = {
    event: 'legal.acknowledged',
    resource: 'legal_acknowledgements',
    action: 'acknowledge',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      acknowledgementId: data.id,
      documentKey: data.document_key,
      documentVersion: data.document_version,
    },
  };
  logAuditEvent(ackAudit);
  await persistServerAuditLog(ackAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ acknowledgement: data }, { status: 201 }),
    rateLimit,
  );
}
