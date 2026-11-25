import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';

const itemSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    presentation: z.string().trim().max(120),
    dose: z.string().trim().max(250),
    route: z.string().trim().max(100),
    frequency: z.string().trim().max(160),
    duration: z.string().trim().max(160),
    quantity: z.string().trim().max(120),
    instructions: z.string().trim().max(1000),
  })
  .strict();

const saveDraftSchema = z
  .object({
    appointment_id: z.string().uuid(),
    items: z.array(itemSchema).min(1).max(30),
  })
  .strict();

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:prescription-drafts:get',
    limit: 90,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, rateLimit } = ctx;

  const appointmentId = request.nextUrl.searchParams.get('appointmentId');
  if (
    appointmentId &&
    !z.string().uuid().safeParse(appointmentId).success
  ) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Informe um agendamento válido.' },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  let query = supabase
    .from('prescription_drafts')
    .select(
      'id, appointment_id, organization_id, pet_id, veterinarian_id, items, updated_by, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(100);
  if (appointmentId) query = query.eq('appointment_id', appointmentId);

  const { data, error } = await query;
  if (error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível carregar os rascunhos de receita.',
        500,
      ),
      rateLimit,
    );
  }

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ prescriptionDrafts: data }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:prescription-drafts:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('save_prescription_draft', {
    target_appointment: parsed.data.appointment_id,
    target_items: parsed.data.items,
  });

  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '42501'
          ? 403
          : error.code === '22023'
            ? 400
            : 500;
    const failedAudit = {
      event: 'prescription_drafts.save_failed',
      resource: 'prescription_drafts',
      action: 'save',
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
        error.code === '22023'
          ? 'Revise os itens e os limites de texto do rascunho.'
          : 'Não foi possível salvar o rascunho de receita.',
        status,
      ),
      rateLimit,
    );
  }

  const savedAudit = {
    event: 'prescription_drafts.saved',
    resource: 'prescription_drafts',
    action: 'save',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      appointmentId: parsed.data.appointment_id,
      itemsCount: parsed.data.items.length,
    },
  };
  logAuditEvent(savedAudit);
  await persistServerAuditLog(savedAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ prescriptionDraft: data }),
    rateLimit,
  );
}
