import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  canManagePartnerOrganization,
  normalizeUserRole,
} from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/logging/audit';
import { persistServerAuditLog } from '@/lib/notifications/outbox';
import {
  matchesTextQuery,
  paginateItems,
  parseListFilterParams,
} from '@/lib/pagination';
import {
  applyRateLimitHeadersToResponse,
  requireProtectedApiContext,
} from '@/lib/security/api-guard';
import { supabaseErrorResponse } from '@/lib/supabase/api-error';
import {
  createAdCampaignSchema,
  createPartnerListingSchema,
  recordPartnerAttributionSchema,
  updateAdCampaignStatusSchema,
} from '@/lib/validations';
import type { OrganizationRole } from '@/types/database';

const createPartnerOrCampaignBodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_partner'),
      payload: createPartnerListingSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('create_campaign'),
      payload: createAdCampaignSchema,
    })
    .strict(),
]);

async function resolveActorRoleAndOrgMembership(
  supabase: Extract<
    Awaited<ReturnType<typeof requireProtectedApiContext>>,
    { ok: true }
  >['supabase'],
  userId: string,
  organizationId: string,
): Promise<{
  userRole: ReturnType<typeof normalizeUserRole>;
  orgRole: OrganizationRole | null;
}> {
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  return {
    userRole: normalizeUserRole(profileRes.data?.role),
    orgRole: membershipRes.data?.role ?? null,
  };
}

export async function GET(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:partners:get',
    limit: 60,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, rateLimit } = ctx;

  const filters = parseListFilterParams(request.nextUrl.searchParams, {
    limit: 12,
    maxLimit: 50,
  });
  const kindFilter = request.nextUrl.searchParams.get('kind')?.trim() ?? '';

  const [partnersRes, campaignsRes] = await Promise.all([
    supabase
      .from('partner_listings')
      .select(
        'id, organization_id, kind, trade_name, city, state, coupon_code, discount_percent, active',
      )
      .eq('active', true)
      .order('trade_name'),
    supabase
      .from('ad_campaigns')
      .select(
        'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
      )
      .order('created_at', { ascending: false }),
  ]);

  if (partnersRes.error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        partnersRes.error,
        'Não foi possível carregar os parceiros credenciados.',
        500,
      ),
      rateLimit,
    );
  }

  if (campaignsRes.error) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        campaignsRes.error,
        'Não foi possível carregar as campanhas do DrVet Ads.',
        500,
      ),
      rateLimit,
    );
  }

  const filteredPartners = (partnersRes.data ?? []).filter((partner) => {
    if (
      (kindFilter === 'pharmacy' || kindFilter === 'pet_shop') &&
      partner.kind !== kindFilter
    ) {
      return false;
    }
    return matchesTextQuery(
      [partner.trade_name, partner.city, partner.state, partner.coupon_code],
      filters.q,
    );
  });

  const filteredCampaigns = (campaignsRes.data ?? []).filter((campaign) =>
    matchesTextQuery([campaign.title, campaign.placement, campaign.status], filters.q),
  );

  const pagedPartners = paginateItems(filteredPartners, {
    page: filters.page,
    limit: filters.limit,
  });
  const pagedCampaigns = paginateItems(filteredCampaigns, {
    page: filters.page,
    limit: filters.limit,
  });

  return applyRateLimitHeadersToResponse(
    NextResponse.json({
      partners: pagedPartners.items,
      campaigns: pagedCampaigns.items,
      pagination: {
        partners: pagedPartners.pagination,
        campaigns: pagedCampaigns.pagination,
      },
    }),
    rateLimit,
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:partners:write',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createPartnerOrCampaignBodySchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const targetOrgId = parsed.data.payload.organization_id;
  const { userRole, orgRole } = await resolveActorRoleAndOrgMembership(
    supabase,
    authUser.id,
    targetOrgId,
  );

  if (!canManagePartnerOrganization(userRole, orgRole)) {
    const deniedAudit = {
      event: 'partners.mutation_denied',
      resource: parsed.data.action === 'create_partner' ? 'partner_listings' : 'ad_campaigns',
      action: 'create',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: { organizationId: targetOrgId, userRole, orgRole },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            'Acesso restrito a parceiros B2B ou administradores proprietários da organização.',
        },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  if (parsed.data.action === 'create_partner') {
    const input = parsed.data.payload;
    const { data, error } = await supabase
      .from('partner_listings')
      .insert({
        organization_id: input.organization_id,
        kind: input.kind,
        trade_name: input.trade_name,
        city: input.city,
        state: input.state,
        coupon_code: input.coupon_code,
        discount_percent: input.discount_percent,
        active: true,
      })
      .select(
        'id, organization_id, kind, trade_name, city, state, coupon_code, discount_percent, active',
      )
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return applyRateLimitHeadersToResponse(
        supabaseErrorResponse(
          error,
          'Não foi possível credenciar o estabelecimento parceiro.',
          status,
        ),
        rateLimit,
      );
    }

    const audit = {
      event: 'partners.listing_created',
      resource: 'partner_listings',
      action: 'create',
      outcome: 'allowed' as const,
      actorId: authUser.id,
      statusCode: 201,
      requestId,
      metadata: {
        partnerId: data.id,
        organizationId: data.organization_id,
        kind: data.kind,
        state: data.state,
      },
    };
    logAuditEvent(audit);
    await persistServerAuditLog(audit);

    return applyRateLimitHeadersToResponse(
      NextResponse.json({ partner: data }, { status: 201 }),
      rateLimit,
    );
  }

  const campaignInput = parsed.data.payload;
  const { data: campaign, error } = await supabase
    .from('ad_campaigns')
    .insert({
      organization_id: campaignInput.organization_id,
      title: campaignInput.title,
      placement: campaignInput.placement,
      budget_cents: campaignInput.budget_cents,
      status: 'active',
      starts_on: campaignInput.starts_on,
    })
    .select(
      'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
    )
    .single();

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível ativar a campanha.',
        status,
      ),
      rateLimit,
    );
  }

  const campaignAudit = {
    event: 'partners.ad_campaign_created',
    resource: 'ad_campaigns',
    action: 'create',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 201,
    requestId,
    metadata: {
      campaignId: campaign.id,
      organizationId: campaign.organization_id,
      placement: campaign.placement,
      budgetCents: campaign.budget_cents,
    },
  };
  logAuditEvent(campaignAudit);
  await persistServerAuditLog(campaignAudit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ campaign }, { status: 201 }),
    rateLimit,
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:partners:patch',
    limit: 30,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateAdCampaignStatusSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.flatten() },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from('ad_campaigns')
    .select('id, organization_id')
    .eq('id', parsed.data.campaignId)
    .maybeSingle();

  if (fetchError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        fetchError,
        'Não foi possível consultar a campanha.',
        500,
      ),
      rateLimit,
    );
  }

  if (!existing) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Campanha não encontrada ou sem acesso.' },
        { status: 404 },
      ),
      rateLimit,
    );
  }

  const { userRole, orgRole } = await resolveActorRoleAndOrgMembership(
    supabase,
    authUser.id,
    existing.organization_id,
  );

  if (!canManagePartnerOrganization(userRole, orgRole)) {
    const deniedAudit = {
      event: 'partners.ad_campaign_status_denied',
      resource: 'ad_campaigns',
      action: 'update',
      outcome: 'denied' as const,
      actorId: authUser.id,
      statusCode: 403,
      requestId,
      metadata: {
        campaignId: existing.id,
        organizationId: existing.organization_id,
      },
    };
    logAuditEvent(deniedAudit);
    await persistServerAuditLog(deniedAudit);
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        { error: 'Sem permissão para alterar campanhas desta organização.' },
        { status: 403 },
      ),
      rateLimit,
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('ad_campaigns')
    .update({ status: parsed.data.status })
    .eq('id', existing.id)
    .select(
      'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
    )
    .single();

  if (updateError) {
    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        updateError,
        'Não foi possível alterar o status da campanha.',
        updateError.code === '42501' ? 403 : 400,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: 'partners.ad_campaign_status_updated',
    resource: 'ad_campaigns',
    action: 'update',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      campaignId: updated.id,
      organizationId: updated.organization_id,
      status: updated.status,
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ campaign: updated }),
    rateLimit,
  );
}

export async function PUT(request: NextRequest) {
  const ctx = await requireProtectedApiContext(request, {
    routeKey: 'api:partners:attribution',
    limit: 20,
    windowMs: 60_000,
  });
  if (!ctx.ok) return ctx.response;
  const { supabase, user: authUser, rateLimit, requestId } = ctx;

  const body: unknown = await request.json().catch(() => null);
  const parsed = recordPartnerAttributionSchema.safeParse(body);
  if (!parsed.success) {
    return applyRateLimitHeadersToResponse(
      NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Informe um código de cupom válido.',
        },
        { status: 400 },
      ),
      rateLimit,
    );
  }

  const { data, error } = await supabase.rpc('record_partner_attribution', {
    target_coupon: parsed.data.couponCode,
  });

  if (error || !data) {
    const status =
      error?.code === 'P0002' ? 404 : error?.code === '42501' ? 403 : 400;
    const failedAudit = {
      event: 'partners.attribution_failed',
      resource: 'partner_attributions',
      action: 'attribute_coupon',
      outcome: (status === 403 ? 'denied' : 'error') as 'denied' | 'error',
      actorId: authUser.id,
      statusCode: status,
      requestId,
      metadata: { couponCode: parsed.data.couponCode },
    };
    logAuditEvent(failedAudit);
    await persistServerAuditLog(failedAudit);

    return applyRateLimitHeadersToResponse(
      supabaseErrorResponse(
        error,
        'Não foi possível vincular o cupom do parceiro à sua conta.',
        status,
      ),
      rateLimit,
    );
  }

  const audit = {
    event: 'partners.attribution_recorded',
    resource: 'partner_attributions',
    action: 'attribute_coupon',
    outcome: 'allowed' as const,
    actorId: authUser.id,
    statusCode: 200,
    requestId,
    metadata: {
      attributionId: data.id,
      couponCode: data.coupon_code,
      organizationId: data.organization_id,
    },
  };
  logAuditEvent(audit);
  await persistServerAuditLog(audit);

  return applyRateLimitHeadersToResponse(
    NextResponse.json({ attribution: data }),
    rateLimit,
  );
}
