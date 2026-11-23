'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { listarOrganizacoesEVeterinarios } from '@/services/organizations.service';
import {
  atualizarStatusCampanhaAds,
  cadastrarParceiroB2B,
  criarCampanhaAds,
  listarCampanhasAds,
  listarParceirosAtivos,
} from '@/services/partners.service';
import type {
  AdCampaign,
  AdCampaignStatus,
  AdPlacement,
  Organization,
  PartnerKind,
  PartnerListing,
} from '@/types/entities';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const placementLabel: Record<AdPlacement, string> = {
  home_banner: 'Banner na Home',
  booking_sidebar: 'Lateral do Agendamento',
  partner_coupon: 'Destaque de Cupom',
};

const campaignStatusVariant: Record<
  AdCampaignStatus,
  'success' | 'warning' | 'neutral'
> = {
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
  ended: 'neutral',
};

export function PartnersPortal() {
  const [partners, setPartners] = useState<PartnerListing[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const [partnerForm, setPartnerForm] = useState({
    organization_id: '',
    kind: 'pharmacy' as PartnerKind,
    trade_name: '',
    city: '',
    state: 'SP',
    coupon_code: '',
    discount_percent: '15',
  });

  const [campaignForm, setCampaignForm] = useState({
    organization_id: '',
    title: '',
    placement: 'booking_sidebar' as AdPlacement,
    budget_reais: '500',
    starts_on: new Date().toISOString().slice(0, 10),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [partnersRes, campaignsRes, orgsRes] = await Promise.all([
        listarParceirosAtivos(),
        listarCampanhasAds(),
        listarOrganizacoesEVeterinarios().catch(() => ({
          organizations: [] as Organization[],
        })),
      ]);
      setPartners(partnersRes.partners);
      setCampaigns(campaignsRes.campaigns);
      setOrganizations(orgsRes.organizations);

      const firstOrgId = orgsRes.organizations[0]?.id ?? '';
      setPartnerForm((curr) => ({
        ...curr,
        organization_id: curr.organization_id || firstOrgId,
      }));
      setCampaignForm((curr) => ({
        ...curr,
        organization_id: curr.organization_id || firstOrgId,
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o portal de parceiros.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const manageableOrgs = organizations.filter(
    (org) => org.role === 'owner' || org.role === 'admin',
  );

  async function handleCreatePartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partnerForm.organization_id) return;
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await cadastrarParceiroB2B({
        organization_id: partnerForm.organization_id,
        kind: partnerForm.kind,
        trade_name: partnerForm.trade_name,
        city: partnerForm.city,
        state: partnerForm.state,
        coupon_code: partnerForm.coupon_code,
        discount_percent: Number(partnerForm.discount_percent) || 15,
      });
      setPartnerForm((curr) => ({
        ...curr,
        trade_name: '',
        city: '',
        coupon_code: '',
      }));
      setNotice('Estabelecimento parceiro credenciado com sucesso.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao credenciar parceiro.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaignForm.organization_id) return;
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const budgetCents = Math.max(
        100,
        Math.round(Number(campaignForm.budget_reais) * 100),
      );
      await criarCampanhaAds({
        organization_id: campaignForm.organization_id,
        title: campaignForm.title,
        placement: campaignForm.placement,
        budget_cents: budgetCents,
        starts_on: campaignForm.starts_on,
      });
      setCampaignForm((curr) => ({ ...curr, title: '' }));
      setNotice('Campanha DrVet Ads ativada com sucesso.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao criar campanha.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCampaign(campaign: AdCampaign) {
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await atualizarStatusCampanhaAds({
        campaignId: campaign.id,
        status: campaign.status === 'active' ? 'paused' : 'active',
      });
      setNotice('Status da campanha atualizado.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao alterar campanha.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Parceiros B2B & DrVet Ads"
        description="Farmácias e pet shops credenciados com cupons ativos e gestão de campanhas patrocinadas."
      />

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button onClick={() => void loadData()} type="button" variant="outline">
            Tentar novamente
          </Button>
        </div>
      )}
      {notice && (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <Tabs
          label="Seções do portal de parceiros e anúncios"
          tabs={[
            {
              id: 'rede',
              label: `Rede credenciada (${partners.length})`,
              content: (
                <div className="grid gap-5">
                  {partners.length === 0 ? (
                    <Card>
                      <EmptyState
                        title="Nenhum parceiro credenciado"
                        description="Farmácias e pet shops parceiros aparecerão aqui com seus cupons."
                      />
                    </Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {partners.map((partner) => (
                        <Card
                          description={`${partner.city} · ${partner.state}`}
                          key={partner.id}
                          title={partner.trade_name}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <Badge variant="info">
                              {partner.kind === 'pharmacy'
                                ? 'Farmácia parceira'
                                : 'Pet Shop'}
                            </Badge>
                            <span className="rounded-lg bg-[#ebf5ff] px-3 py-1.5 font-mono text-sm font-bold text-[#006b57]">
                              {partner.coupon_code} · {partner.discount_percent}% OFF
                            </span>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  {manageableOrgs.length > 0 && (
                    <Card
                      title="Credenciar unidade parceira"
                      description="Disponível para proprietários ou administradores da organização."
                    >
                      <form
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={(event) => void handleCreatePartner(event)}
                      >
                        <Select
                          id="partner-org"
                          label="Organização"
                          onChange={(event) =>
                            setPartnerForm((curr) => ({
                              ...curr,
                              organization_id: event.target.value,
                            }))
                          }
                          value={partnerForm.organization_id}
                        >
                          {manageableOrgs.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          id="partner-kind"
                          label="Categoria"
                          onChange={(event) =>
                            setPartnerForm((curr) => ({
                              ...curr,
                              kind: event.target.value as PartnerKind,
                            }))
                          }
                          value={partnerForm.kind}
                        >
                          <option value="pharmacy">Farmácia Veterinária</option>
                          <option value="pet_shop">Pet Shop / Pro Shop</option>
                        </Select>
                        <Input
                          id="partner-name"
                          label="Nome fantasia"
                          maxLength={120}
                          onChange={(event) =>
                            setPartnerForm((curr) => ({
                              ...curr,
                              trade_name: event.target.value,
                            }))
                          }
                          required
                          value={partnerForm.trade_name}
                        />
                        <div className="grid grid-cols-[1fr_90px] gap-3">
                          <Input
                            id="partner-city"
                            label="Cidade"
                            maxLength={80}
                            onChange={(event) =>
                              setPartnerForm((curr) => ({
                                ...curr,
                                city: event.target.value,
                              }))
                            }
                            required
                            value={partnerForm.city}
                          />
                          <Input
                            id="partner-uf"
                            label="UF"
                            maxLength={2}
                            onChange={(event) =>
                              setPartnerForm((curr) => ({
                                ...curr,
                                state: event.target.value.toUpperCase(),
                              }))
                            }
                            required
                            value={partnerForm.state}
                          />
                        </div>
                        <Input
                          id="partner-coupon"
                          label="Código do cupom"
                          maxLength={24}
                          onChange={(event) =>
                            setPartnerForm((curr) => ({
                              ...curr,
                              coupon_code: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="Ex.: DRVET15"
                          required
                          value={partnerForm.coupon_code}
                        />
                        <Input
                          id="partner-discount"
                          label="Desconto (%)"
                          max={80}
                          min={0}
                          onChange={(event) =>
                            setPartnerForm((curr) => ({
                              ...curr,
                              discount_percent: event.target.value,
                            }))
                          }
                          required
                          type="number"
                          value={partnerForm.discount_percent}
                        />
                        <div className="flex justify-end sm:col-span-2">
                          <Button
                            disabled={saving}
                            type="submit"
                            variant="secondary"
                          >
                            {saving ? 'Salvando...' : 'Credenciar parceiro'}
                          </Button>
                        </div>
                      </form>
                    </Card>
                  )}
                </div>
              ),
            },
            {
              id: 'ads',
              label: `DrVet Ads (${campaigns.length})`,
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Campanhas patrocinadas"
                    description="Acompanhe posicionamentos e cliques da sua organização."
                  >
                    {campaigns.length === 0 ? (
                      <EmptyState
                        title="Nenhuma campanha ativa"
                        description="Organizações credenciadas podem criar campanhas sazonais abaixo."
                      />
                    ) : (
                      <ul className="grid gap-3">
                        {campaigns.map((camp) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                            key={camp.id}
                          >
                            <div>
                              <p className="font-bold text-[#153b50]">
                                {camp.title}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {placementLabel[camp.placement]} · Orçamento:{' '}
                                {brl.format(camp.budget_cents / 100)} ·{' '}
                                {camp.clicks_count} cliques
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={campaignStatusVariant[camp.status]}>
                                {camp.status === 'active'
                                  ? 'Ativa'
                                  : camp.status === 'paused'
                                    ? 'Pausada'
                                    : camp.status}
                              </Badge>
                              {manageableOrgs.some(
                                (o) => o.id === camp.organization_id,
                              ) && (
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={saving}
                                  onClick={() => void handleToggleCampaign(camp)}
                                  type="button"
                                  variant="outline"
                                >
                                  {camp.status === 'active'
                                    ? 'Pausar'
                                    : 'Reativar'}
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  {manageableOrgs.length > 0 && (
                    <Card
                      title="Nova campanha DrVet Ads"
                      description="Publique uma campanha sazonal vinculada à sua clínica ou parceiro."
                    >
                      <form
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={(event) => void handleCreateCampaign(event)}
                      >
                        <Select
                          id="ad-org"
                          label="Organização"
                          onChange={(event) =>
                            setCampaignForm((curr) => ({
                              ...curr,
                              organization_id: event.target.value,
                            }))
                          }
                          value={campaignForm.organization_id}
                        >
                          {manageableOrgs.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          id="ad-placement"
                          label="Posicionamento"
                          onChange={(event) =>
                            setCampaignForm((curr) => ({
                              ...curr,
                              placement: event.target.value as AdPlacement,
                            }))
                          }
                          value={campaignForm.placement}
                        >
                          <option value="booking_sidebar">
                            Lateral do Agendamento
                          </option>
                          <option value="home_banner">Banner na Home</option>
                          <option value="partner_coupon">
                            Destaque de Cupom
                          </option>
                        </Select>
                        <Input
                          id="ad-title"
                          label="Título da campanha"
                          maxLength={140}
                          onChange={(event) =>
                            setCampaignForm((curr) => ({
                              ...curr,
                              title: event.target.value,
                            }))
                          }
                          placeholder="Ex.: Campanha Sazonal de Vacinação"
                          required
                          value={campaignForm.title}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            id="ad-budget"
                            label="Orçamento (R$)"
                            min={10}
                            onChange={(event) =>
                              setCampaignForm((curr) => ({
                                ...curr,
                                budget_reais: event.target.value,
                              }))
                            }
                            required
                            type="number"
                            value={campaignForm.budget_reais}
                          />
                          <Input
                            id="ad-start"
                            label="Início"
                            onChange={(event) =>
                              setCampaignForm((curr) => ({
                                ...curr,
                                starts_on: event.target.value,
                              }))
                            }
                            required
                            type="date"
                            value={campaignForm.starts_on}
                          />
                        </div>
                        <div className="flex justify-end sm:col-span-2">
                          <Button
                            disabled={saving}
                            type="submit"
                            variant="secondary"
                          >
                            {saving ? 'Ativando...' : 'Ativar campanha'}
                          </Button>
                        </div>
                      </form>
                    </Card>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
