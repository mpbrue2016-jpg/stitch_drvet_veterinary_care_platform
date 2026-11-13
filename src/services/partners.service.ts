import { getSupabaseClient } from '@/lib/supabase';
import type {
  AdCampaign,
  AdCampaignStatus,
  AdPlacement,
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('partner_listings')
      .insert({
        organization_id: input.organization_id,
        kind: input.kind,
        trade_name: input.trade_name.trim(),
        city: input.city.trim(),
        state: input.state.trim().toUpperCase(),
        coupon_code: input.coupon_code.trim().toUpperCase(),
        discount_percent: input.discount_percent,
        active: true,
      })
      .select(
        'id, organization_id, kind, trade_name, city, state, coupon_code, discount_percent, active',
      )
      .single();

    if (error) throw error;
    return { partner: data };
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ad_campaigns')
      .insert({
        organization_id: input.organization_id,
        title: input.title.trim(),
        placement: input.placement,
        budget_cents: input.budget_cents,
        status: 'active',
        starts_on: input.starts_on,
      })
      .select(
        'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
      )
      .single();

    if (error) throw error;
    return { campaign: data };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível ativar a campanha.');
  }
}

export async function atualizarStatusCampanhaAds(input: {
  campaignId: string;
  status: AdCampaignStatus;
}): Promise<{ campaign: AdCampaign }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ad_campaigns')
      .update({ status: input.status })
      .eq('id', input.campaignId)
      .select(
        'id, organization_id, title, placement, budget_cents, status, starts_on, ends_on, clicks_count',
      )
      .single();

    if (error) throw error;
    return { campaign: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível alterar o status da campanha.',
    );
  }
}
