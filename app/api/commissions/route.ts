import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  hasOperationalOrgRole,
  normalizeUserRole,
} from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import { maskPixKeyForDisplay } from '@/lib/payments/pix-mask';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  anticipationRequestSchema,
  fiscalInvoiceSchema,
  strictPayoutAccountSchema,
  updateFiscalInvoiceStatusSchema,
} from '@/lib/validations';
import type { OrganizationRole } from '@/types/database';

const commissionsActionBodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('upsert_payout_account'),
      payload: strictPayoutAccountSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('request_anticipation'),
      payload: anticipationRequestSchema.strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('request_fiscal_invoice'),
      payload: fiscalInvoiceSchema.strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('update_fiscal_invoice_status'),
      payload: updateFiscalInvoiceStatusSchema,
    })
    .strict(),
]);

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:commissions:write',
    limit: 15,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = commissionsActionBodySchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados financeiros inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle(),
    supabase
      .from('organization_memberships')
      .select('role')
      .eq('user_id', authUser.id),
  ]);

  if (profileRes.error || membershipsRes.error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        profileRes.error ?? membershipsRes.error,
        'Não foi possível validar o perfil financeiro.',
        500,
      ),
      rateLimit,
    );
  }

  const role = normalizeUserRole(profileRes.data?.role);
  const orgRoles = (membershipsRes.data ?? []).map(
    (item) => item.role as OrganizationRole,
  );
  const allowed =
    role === 'admin' ||
    role === 'veterinarian' ||
    role === 'partner' ||
    hasOperationalOrgRole(orgRoles);

  if (!allowed) {
    const deniedAudit = {
      event: 'commissions.action_denied',
      resource: 'commission_ledger',
      action: parsed.data.action,
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: { role },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'Operação financeira restrita a veterinários, parceiros e equipe autorizada.',
        },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  if (parsed.data.action === 'upsert_payout_account') {
    const { provider, payout_account_label, pix_key } = parsed.data.payload;
    const maskedPixKey = maskPixKeyForDisplay(pix_key);

    const { error } = await supabase.rpc('upsert_my_payout_account', {
      target_provider: provider,
      target_label: payout_account_label,
      target_pix_key: maskedPixKey,
    });

    if (error) {
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          error,
          'Não foi possível salvar os dados bancários e chave PIX de repasse.',
          error.code === '42501' ? 403 : 400,
        ),
        rateLimit,
      );
    }

    const audit = {
      event: 'commissions.payout_account_updated',
      resource: 'payout_accounts',
      action: 'upsert',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 200,
      requestId,
      metadata: {
        provider,
        pixKeyMasked: maskedPixKey,
      },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({
        updated: true,
        provider,
        pixKeyMasked: maskedPixKey,
      }),
      rateLimit,
    );
  }

  if (parsed.data.action === 'request_anticipation') {
    const { amount_cents, notes } = parsed.data.payload;
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'request_commission_anticipation',
      {
        target_amount_cents: amount_cents,
        target_notes: notes?.trim() || null,
      },
    );

    if (rpcError || !rpcData) {
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          rpcError ?? new Error('Falha na antecipação.'),
          'Não foi possível registrar a solicitação de antecipação.',
          rpcError?.code === '42501' ? 403 : 400,
        ),
        rateLimit,
      );
    }

    const audit = {
      event: 'commissions.anticipation_requested',
      resource: 'anticipation_requests',
      action: 'create',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 201,
      requestId,
      metadata: {
        protocol: rpcData.protocol,
        requestedCents: rpcData.requested_cents,
      },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          protocol: rpcData.protocol,
          requested_cents: rpcData.requested_cents,
        },
        { status: 201 },
      ),
      rateLimit,
    );
  }

  if (parsed.data.action === 'request_fiscal_invoice') {
    const { period_label, total_cents, tax_id, provider, notes } =
      parsed.data.payload;
    const { data: invoice, error: invoiceError } = await supabase.rpc(
      'request_fiscal_invoice',
      {
        target_period_label: period_label,
        target_total_cents: total_cents,
        target_tax_id: tax_id,
        target_provider: provider,
        target_notes: notes?.trim() || null,
      },
    );

    if (invoiceError || !invoice) {
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          invoiceError ?? new Error('Falha ao solicitar NFSe.'),
          'Não foi possível solicitar a nota fiscal.',
          invoiceError?.code === '42501' ? 403 : 400,
        ),
        rateLimit,
      );
    }

    const audit = {
      event: 'commissions.fiscal_invoice_requested',
      resource: 'fiscal_invoices',
      action: 'create',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 201,
      requestId,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        provider: invoice.provider,
        totalCents: invoice.total_cents,
        taxIdMasked: maskPixKeyForDisplay(tax_id),
      },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ invoice }, { status: 201 }),
      rateLimit,
    );
  }

  const { invoiceId, status } = parsed.data.payload;
  const { data: updatedInvoice, error: updateError } = await supabase.rpc(
    'update_fiscal_invoice_status',
    {
      target_invoice: invoiceId,
      next_status: status,
    },
  );

  if (updateError || !updatedInvoice) {
    const httpStatus =
      updateError?.code === 'P0002'
        ? 404
        : updateError?.code === '42501'
          ? 403
          : 400;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        updateError ?? new Error('Nota fiscal não encontrada.'),
        'Não foi possível atualizar a nota fiscal.',
        httpStatus,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: 'commissions.fiscal_invoice_status_updated',
    resource: 'fiscal_invoices',
    action: 'update',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      invoiceId: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoice_number,
      nextStatus: updatedInvoice.status,
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ invoice: updatedInvoice }),
    rateLimit,
  );
}
