import { getSupabaseClient } from '@/lib/supabase';
import type {
  AdCampaign,
  AdCampaignStatus,
  AdPlacement,
  PartnerAttribution,
  PartnerKind,
  PartnerListing,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export async function listarParceirosAtivos(): Promise<{
  partners: PartnerListing[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('partner_listings')
      .select(
        'id, organization_id, kind, trade_name, city, state, coupon_code, discount_percent, active',
      )
      .eq('active', true)
      .order('trade_name');

    if (error) throw error;
    return { partners: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar os parceiros credenciados.',
    );
  }
}

export interface PartnersPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export async function buscarPortalParceirosPaginado(params?: {
  q?: string;
  kind?: PartnerKind | '';
  page?: number;
  limit?: number;
}): Promise<{
  partners: PartnerListing[];
  campaigns: AdCampaign[];
  pagination: {
    partners: PartnersPaginationMeta;
    campaigns: PartnersPaginationMeta;
  };
}> {
  try {
    const search = new URLSearchParams();
    if (params?.q?.trim()) search.set('q', params.q.trim());
    if (params?.kind) search.set('kind', params.kind);
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));

    const queryString = search.toString();
    const response = await fetch(
      `/api/partners${queryString ? `?${queryString}` : ''}`,
      { cache: 'no-store' },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      partners?: PartnerListing[];
      campaigns?: AdCampaign[];
      pagination?: {
        partners: PartnersPaginationMeta;
        campaigns: PartnersPaginationMeta;
      };
    };

    if (!response.ok || !payload.pagination) {
      throw new Error(
        payload.error || 'Não foi possível carregar o portal de parceiros.',
      );
    }

    return {
      partners: payload.partners ?? [],
      campaigns: payload.campaigns ?? [],
      pagination: payload.pagination,
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar o portal de parceiros.',
    );
  }
}

export async function cadastrarParceiroB2B(input: {
  organization_id: string;
  kind: PartnerKind;
  trade_name: string;
  city: string;
  state: string;
  coupon_code: string;
  discount_percent: number;
}): Promise<{ partner: PartnerListing }> {
  try {
    const response = await fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_partner',
        payload: {
          organization_id: input.organization_id,
          kind: input.kind,
          trade_name: input.trade_name.trim(),
          city: input.city.trim(),
          state: input.state.trim().toUpperCase(),
          coupon_code: input.coupon_code.trim().toUpperCase(),
          discount_percent: input.discount_percent,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      partner?: PartnerListing;
    };
    if (!response.ok || !payload.partner) {
      throw new Error(
        payload.error || 'Não foi possível credenciar o estabelecimento parceiro.',
      );
    }
    return { partner: payload.partner };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível credenciar o estabelecimento parceiro.',
    );
  }
}

export async function listarCampanhasAds(): Promise<{
  campaigns: AdCampaign[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select(
        'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
      )
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { campaigns: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar as campanhas do DrVet Ads.',
    );
  }
}

export async function criarCampanhaAds(input: {
  organization_id: string;
  title: string;
  placement: AdPlacement;
  budget_cents: number;
  starts_on: string;
}): Promise<{ campaign: AdCampaign }> {
  try {
    const response = await fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_campaign',
        payload: {
          organization_id: input.organization_id,
          title: input.title.trim(),
          placement: input.placement,
          budget_cents: input.budget_cents,
          starts_on: input.starts_on,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      campaign?: AdCampaign;
    };
    if (!response.ok || !payload.campaign) {
      throw new Error(payload.error || 'Não foi possível ativar a campanha.');
    }
    return { campaign: payload.campaign };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível ativar a campanha.');
  }
}

export async function atualizarStatusCampanhaAds(input: {
  campaignId: string;
  status: AdCampaignStatus;
}): Promise<{ campaign: AdCampaign }> {
  try {
    const response = await fetch('/api/partners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: input.campaignId,
        status: input.status,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      campaign?: AdCampaign;
    };
    if (!response.ok || !payload.campaign) {
      throw new Error(
        payload.error || 'Não foi possível alterar o status da campanha.',
      );
    }
    return { campaign: payload.campaign };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível alterar o status da campanha.',
    );
  }
}

export async function registrarAtribuicaoParceiro(
  couponCode: string,
): Promise<{ attribution: PartnerAttribution }> {
  try {
    const response = await fetch('/api/partners', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        couponCode: couponCode.trim().toUpperCase(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      attribution?: PartnerAttribution;
      error?: string;
    } | null;

    if (!response.ok || !payload?.attribution) {
      throw new Error(
        payload?.error ||
          'Não foi possível vincular o cupom do parceiro à sua conta.',
      );
    }

    return { attribution: payload.attribution };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível vincular o cupom do parceiro à sua conta.',
    );
  }
}

export async function buscarAtribuicaoAtiva(): Promise<{
  attribution: PartnerAttribution | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return { attribution: null };

    const { data, error } = await supabase
      .from('partner_attributions')
      .select(
        'id, tutor_id, partner_listing_id, organization_id, coupon_code, discount_percent, source, active, updated_at',
      )
      .eq('tutor_id', authData.user.id)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { attribution: data ?? null };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível consultar o cupom vinculado.',
    );
  }
}
