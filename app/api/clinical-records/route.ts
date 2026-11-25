import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import { clinicalVitalsSchema } from '@/lib/validations';

const saveClinicalRecordSchema = z
  .object({
    appointment_id: z.string().uuid(),
    subjective: z.string().max(10000),
    objective: z.string().max(10000),
    assessment: z.string().max(10000),
    plan: z.string().max(10000),
    vitals: clinicalVitalsSchema,
    status: z.enum(['draft', 'finalized']),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:clinical-records:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit } = ctx;

  const appointmentId = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get('appointmentId'));
  if (!appointmentId.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um agendamento válido.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, status, veterinarian_id, starts_at')
    .eq('id', appointmentId.data)
    .maybeSingle();

  if (appointmentError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        appointmentError,
        'Não foi possível carregar o agendamento.',
        500,
      ),
      rateLimit,
    );
  }
  if (!appointment) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 }),
      rateLimit,
    );
  }

  const { data: clinicalRecord, error: recordError } = await supabase
    .from('clinical_records')
    .select(
      'id, appointment_id, pet_id, veterinarian_id, subjective, objective, assessment, plan, vitals, status, finalized_at, created_at, updated_at',
    )
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  if (recordError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        recordError,
        'Não foi possível carregar o prontuário.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      clinicalRecord,
      canEdit:
        appointment.veterinarian_id === authUser.id &&
        (appointment.status === 'completed' ||
          (appointment.status === 'confirmed' &&
            new Date(appointment.starts_at).getTime() <= Date.now())),
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:clinical-records:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = saveClinicalRecordSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('save_clinical_record', {
    target_appointment: parsed.data.appointment_id,
    target_subjective: parsed.data.subjective,
    target_objective: parsed.data.objective,
    target_assessment: parsed.data.assessment,
    target_plan: parsed.data.plan,
    target_vitals: parsed.data.vitals,
    target_status: parsed.data.status,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : error.code === '55000'
              ? 409
              : 500;
    const failedAudit = {
      event: 'clinical_records.save_failed',
      resource: 'clinical_records',
      action: parsed.data.status,
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { appointmentId: parsed.data.appointment_id },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        error.code === '55000'
          ? 'Este prontuário já foi finalizado e não pode ser alterado.'
          : error.code === '22023'
            ? 'Revise os campos SOAP obrigatórios e os valores dos sinais vitais.'
            : 'Não foi possível salvar o prontuário.',
        status,
      ),
      rateLimit,
    );
  }

  const savedAudit = {
    event: 'clinical_records.saved',
    resource: 'clinical_records',
    action: parsed.data.status,
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: { appointmentId: parsed.data.appointment_id, status: parsed.data.status },
  };
  logAuditEvent(savedAudit);
  await persistServerAuditLog(savedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ clinicalRecord: data }),
    rateLimit,
  );
}
