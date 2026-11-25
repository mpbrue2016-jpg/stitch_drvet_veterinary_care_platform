import { NextResponse, type NextRequest } from 'next/server';
import {
  computePrescriptionDigestHex,
  evaluateDigitalSignatureReadiness,
} from '@/lib/clinical/prescription-digest';
import { logAuditEvent } from '@/lib/logging/audit';
import {
  persistServerAuditLog,
  recordPrescriptionNotificationOutbox,
} from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { issuePrescriptionSchema } from '@/lib/validations';
import type { Json } from '@/types/database';
import type { PrescriptionItem } from '@/types/entities';

function parsePrescriptionItems(raw: Json): PrescriptionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { [key: string]: Json | undefined } =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      presentation:
        typeof item.presentation === 'string' ? item.presentation : '',
      dose: typeof item.dose === 'string' ? item.dose : '',
      route: typeof item.route === 'string' ? item.route : '',
      frequency: typeof item.frequency === 'string' ? item.frequency : '',
      duration: typeof item.duration === 'string' ? item.duration : '',
      quantity: typeof item.quantity === 'string' ? item.quantity : '',
      instructions:
        typeof item.instructions === 'string' ? item.instructions : '',
    }));
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:prescription-drafts:issue',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = issuePrescriptionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Atendimento inválido para emissão.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('issue_prescription', {
    target_appointment: parsed.data.appointment_id,
  });

  if (error || !data) {
    const status =
      error?.code === 'P0002'
        ? 404
        : error?.code === '42501'
          ? 403
          : error?.code === '22023'
            ? 400
            : 500;
    const failedAudit = {
      event: 'prescription_drafts.issue_failed',
      resource: 'prescription_drafts',
      action: 'issue',
      outcome: status === 403 ? ('denied' as const) : ('error' as const),
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { appointmentId: parsed.data.appointment_id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error ?? new Error('Receita não encontrada.'),
        'Não foi possível emitir a receita oficial.',
        status,
      ),
      rateLimit,
    );
  }

  const items = parsePrescriptionItems(data.items);
  const issuedAt = data.issued_at ?? data.updated_at;
  const verificationCode = data.verification_code ?? '';

  let documentDigestSha256: string | null = null;
  if (verificationCode && issuedAt) {
    documentDigestSha256 = await computePrescriptionDigestHex({
      prescriptionId: data.id,
      appointmentId: data.appointment_id,
      organizationId: data.organization_id,
      petId: data.pet_id,
      veterinarianId: data.veterinarian_id,
      verificationCode,
      issuedAt,
      items,
    }).catch(() => null);
  }

  const { data: appointmentRow } = await supabase
    .from('appointments')
    .select('tutor_id')
    .eq('id', data.appointment_id)
    .maybeSingle();

  if (appointmentRow?.tutor_id) {
    await recordPrescriptionNotificationOutbox({
      recipientUserId: appointmentRow.tutor_id,
    });
  }

  const issuedAudit = {
    event: 'prescription_drafts.issued',
    resource: 'prescription_drafts',
    action: 'issue',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      prescriptionId: data.id,
      appointmentId: data.appointment_id,
      verificationCode,
      itemsCount: items.length,
      digestPrefix: documentDigestSha256 ? documentDigestSha256.slice(0, 16) : null,
    },
  };
  logAuditEvent(issuedAudit);
  await persistServerAuditLog(issuedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      prescriptionDraft: {
        ...data,
        items,
      },
      documentDigestSha256,
      digitalSignatureReadiness: evaluateDigitalSignatureReadiness(),
    }),
    rateLimit,
  );
}
