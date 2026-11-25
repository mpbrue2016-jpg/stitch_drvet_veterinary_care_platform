import { NextResponse, type NextRequest } from 'next/server';
import {
  computeTemplateSha256Hex,
  FACIAL_DESCRIPTOR_DIMENSION,
  FACIAL_MIN_LIVENESS_SCORE,
} from '@/lib/biometrics/facial';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { enrollFacialBiometricsSchema } from '@/lib/validations';
import { isSchemaMissingError } from '@/services/errors';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:biometrics:enroll',
    limit: 12,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = enrollFacialBiometricsSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Dados biométricos inválidos para cadastro.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { descriptor_vector, liveness_score, device_label } = parsed.data;
  if (
    descriptor_vector.length !== FACIAL_DESCRIPTOR_DIMENSION ||
    liveness_score < FACIAL_MIN_LIVENESS_SCORE
  ) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'Captura facial com resolução ou prova de vida insuficiente. Tente novamente em local iluminado.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const canonicalHash = await computeTemplateSha256Hex(descriptor_vector);

  const { data: saved, error } = await supabase.rpc('enroll_facial_biometrics', {
    target_template_hash: canonicalHash,
    target_descriptor_vector: descriptor_vector,
    target_liveness_score: liveness_score,
    target_device_label: device_label?.trim() || null,
  });

  if (error || !saved) {
    const schemaMissing = isSchemaMissingError(error);
    const failedAudit = {
      event: 'biometrics.enroll_failed',
      resource: 'facial_biometrics',
      action: 'enroll',
      outcome: 'error' as const,
      actorId: authUser.id,
      statusCode: schemaMissing ? 503 : 400,
      requestId,
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error ?? new Error('Falha ao salvar biometria facial.'),
        schemaMissing
          ? 'A tabela de biometria facial (migration #16) ainda não foi aplicada no banco de dados.'
          : 'Não foi possível registrar sua biometria facial.',
        schemaMissing ? 503 : 400,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: 'biometrics.enrolled',
    resource: 'facial_biometrics',
    action: 'enroll',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      biometricId: saved.id,
      algorithm: saved.algorithm,
      livenessScore: saved.liveness_score,
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json(
      {
        biometric: {
          id: saved.id,
          user_id: saved.user_id,
          status: saved.status,
          algorithm: saved.algorithm,
          template_hash: saved.template_hash,
          liveness_score: saved.liveness_score,
          device_label: saved.device_label,
          enrolled_at: saved.enrolled_at,
          last_verified_at: saved.last_verified_at,
          updated_at: saved.updated_at,
        },
      },
      { status: 201 },
    ),
    rateLimit,
  );
}
