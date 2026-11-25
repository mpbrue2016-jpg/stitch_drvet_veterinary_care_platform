import { NextResponse, type NextRequest } from 'next/server';
import {
  computeDescriptorSimilarity,
  FACIAL_MATCH_THRESHOLD,
  FACIAL_MIN_LIVENESS_SCORE,
} from '@/lib/biometrics/facial';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { verifyFacialBiometricsSchema } from '@/lib/validations';
import { isSchemaMissingError } from '@/services/errors';

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:biometrics:verify',
    limit: 25,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = verifyFacialBiometricsSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Dados de captura biométrica inválidos.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { descriptor_vector, liveness_score, device_label } = parsed.data;

  const { data: enrolled, error: fetchError } = await supabase
    .from('facial_biometrics')
    .select('id, status, descriptor_vector')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (fetchError) {
    const schemaMissing = isSchemaMissingError(fetchError);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        fetchError,
        schemaMissing
          ? 'A tabela de biometria facial (migration #16) ainda não foi aplicada no banco de dados.'
          : 'Não foi possível consultar a biometria cadastrada.',
        schemaMissing ? 503 : 500,
      ),
      rateLimit,
    );
  }

  if (!enrolled || enrolled.status !== 'active') {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'Nenhuma biometria facial ativa encontrada. Conclua o cadastro biométrico antes de validar.',
          code: 'BIOMETRICS_NOT_ENROLLED',
        },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const storedVector = Array.isArray(enrolled.descriptor_vector)
    ? enrolled.descriptor_vector.map((item) => Number(item))
    : [];

  const similarityScore = computeDescriptorSimilarity(
    storedVector,
    descriptor_vector,
  );
  const livenessOk = liveness_score >= FACIAL_MIN_LIVENESS_SCORE;
  const matched = livenessOk && similarityScore >= FACIAL_MATCH_THRESHOLD;

  const { error: logError } = await supabase.rpc(
    'record_facial_biometric_verification',
    {
      target_matched: matched,
      target_similarity_score: similarityScore,
      target_liveness_score: liveness_score,
      target_device_label: device_label?.trim() || null,
    },
  );

  if (logError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        logError,
        'Não foi possível registrar a verificação biométrica.',
        400,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: matched ? 'biometrics.verify_success' : 'biometrics.verify_failed',
    resource: 'facial_biometrics',
    action: 'verify',
    outcome: matched ? ('allowed' as const) : ('denied' as const),
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      similarityScore,
      livenessScore: liveness_score,
      matched,
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      matched,
      similarityScore,
      livenessScore: liveness_score,
      threshold: FACIAL_MATCH_THRESHOLD,
      message: !livenessOk
        ? 'Prova de vida insuficiente. Posicione o rosto bem iluminado dentro da guia.'
        : matched
          ? 'Identidade facial confirmada com segurança.'
          : 'A captura atual não corresponde ao cadastro biométrico. Centralize o rosto e tente novamente.',
    }),
    rateLimit,
  );
}
