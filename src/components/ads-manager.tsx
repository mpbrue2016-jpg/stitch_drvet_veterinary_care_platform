'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
  Toast,
} from '@/components/ui';
import { listarOrganizacoesEVeterinarios } from '@/services/organizations.service';
import {
  atualizarStatusCampanhaAds,
  criarCampanhaAds,
  listarCampanhasAds,
} from '@/services/partners.service';
import type {
  AdCampaign,
  AdCampaignStatus,
  AdPlacement,
  Organization,
} from '@/types/entities';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const placementLabels: Record<AdPlacement, string> = {
  home_banner: 'Banner na Home',
  booking_sidebar: 'Lateral do Agendamento',
  partner_coupon: 'Destaque de Cupom Parceiro',
};

const statusMap: Record<
  AdCampaignStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  active: { label: 'Ativa', variant: 'success' },
  paused: { label: 'Pausada', variant: 'warning' },
  draft: { label: 'Rascunho', variant: 'neutral' },
  ended: { label: 'Encerrada', variant: 'neutral' },
};

export function AdsManager() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    organization_id: '',
    title: '',
    placement: 'home_banner' as AdPlacement,
    budget_reais: '350',
    starts_on: new Date().toISOString().slice(0, 10),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [campaignsRes, orgsRes] = await Promise.all([
        listarCampanhasAds(),
        listarOrganizacoesEVeterinarios().catch(() => ({
          organizations: [] as Organization[],
        })),
      ]);
      setCampaigns(campaignsRes.campaigns);
      setOrganizations(orgsRes.organizations);

      const firstManageable =
        orgsRes.organizations.find(
          (org) => org.role === 'owner' || org.role === 'admin',
        )?.id ?? '';
      setForm((prev) => ({
        ...prev,
        organization_id: prev.organization_id || firstManageable,
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as campanhas do DrVet Ads.',
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

  async function handleCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');

    if (!form.organization_id) {
      setErrorMessage(
        'É necessário administrar uma organização/parceiro para ativar campanhas.',
      );
      return;
    }

    const budgetReais = Number(form.budget_reais.replace(',', '.'));
    if (!Number.isFinite(budgetReais) || budgetReais < 50) {
      setErrorMessage('Defina um orçamento mínimo de R$ 50,00.');
      return;
    }

    setSaving(true);
    try {
      const { campaign } = await criarCampanhaAds({
        organization_id: form.organization_id,
        title: form.title,
        placement: form.placement,
        budget_cents: Math.round(budgetReais * 100),
        starts_on: form.starts_on,
      });
      setNotice(`Campanha "${campaign.title}" ativada com sucesso no DrVet Ads.`);
      setForm((prev) => ({ ...prev, title: '' }));
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao criar campanha.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    campaignId: string,
    nextStatus: AdCampaignStatus,
  ) {
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await atualizarStatusCampanhaAds({ campaignId, status: nextStatus });
      setNotice('Status da campanha atualizado.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao atualizar o status da campanha.',
      );
    } finally {
      setSaving(false);
    }
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const totalBudgetCents = activeCampaigns.reduce(
    (sum, c) => sum + c.budget_cents,
    0,
  );
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks_count, 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        action={
          <Link href="/parceiros">
            <Button variant="outline">Portal de Parceiros B2B</Button>
          </Link>
        }
        description="Configure banners patrocinados, posicionamentos e orçamento das campanhas B2B no ecossistema DrVet."
        title="DrVet Ads — Gestão de Campanhas"
      />

      {errorMessage && (
        <Toast
          message={errorMessage}
          onDismiss={() => setErrorMessage('')}
          variant="danger"
        />
      )}
      {notice && (
        <Toast
          message={notice}
          onDismiss={() => setNotice('')}
          variant="success"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          detail="Em veiculação no momento"
          icon="★"
          label="Campanhas ativas"
          value={loading ? '...' : String(activeCampaigns.length)}
        />
        <MetricCard
          detail="Soma das campanhas ativas"
          icon="R$"
          label="Orçamento ativo"
          value={loading ? '...' : brl.format(totalBudgetCents / 100)}
        />
        <MetricCard
          detail="Interações contabilizadas"
          icon="↗"
          label="Cliques acumulados"
          value={loading ? '...' : String(totalClicks)}
        />
      </div>

      {manageableOrgs.length > 0 && (
        <Card
          description="Defina título, posicionamento de destaque e orçamento para lançar um novo anúncio."
          title="Nova campanha patrocinada"
        >
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={handleCreateCampaign}
          >
            <Select
              label="Organização"
              name="organization_id"
              onChange={(e) =>
                setForm((s) => ({ ...s, organization_id: e.target.value }))
              }
              value={form.organization_id}
            >
              {manageableOrgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
            <Input
              label="Título da campanha *"
              maxLength={120}
              name="title"
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              placeholder="Ex.: 15% OFF Dermato + Kit Banho"
              required
              value={form.title}
            />
            <Select
              label="Posicionamento"
              name="placement"
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  placement: e.target.value as AdPlacement,
                }))
              }
              value={form.placement}
            >
              <option value="home_banner">Banner na Home</option>
              <option value="booking_sidebar">Lateral do Agendamento</option>
              <option value="partner_coupon">Destaque de Cupom</option>
            </Select>
            <Input
              label="Orçamento (R$)"
              min="50"
              name="budget_reais"
              onChange={(e) =>
                setForm((s) => ({ ...s, budget_reais: e.target.value }))
              }
              required
              step="10"
              type="number"
              value={form.budget_reais}
            />
            <Input
              label="Início da veiculação"
              name="starts_on"
              onChange={(e) =>
                setForm((s) => ({ ...s, starts_on: e.target.value }))
              }
              required
              type="date"
              value={form.starts_on}
            />
            <div className="flex justify-end sm:col-span-2 lg:col-span-5">
              <Button disabled={saving} type="submit" variant="secondary">
                {saving ? 'Ativando campanha...' : 'Ativar campanha DrVet Ads'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        description="Campanhas visíveis na plataforma e controles de ativação para anunciantes credenciados."
        title="Campanhas registradas"
      >
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            description="Nenhuma campanha patrocinada foi cadastrada até o momento."
            title="Sem campanhas no DrVet Ads"
          />
        ) : (
          <div className="grid gap-3">
            {campaigns.map((campaign) => {
              const badge = statusMap[campaign.status];
              const canManage = manageableOrgs.some(
                (org) => org.id === campaign.organization_id,
              );

              return (
                <article
                  className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
                  key={campaign.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-[#153b50]">
                        {campaign.title}
                      </h3>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {placementLabels[campaign.placement]} · Orçamento:{' '}
                      <strong>{brl.format(campaign.budget_cents / 100)}</strong> ·
                      Cliques: <strong>{campaign.clicks_count}</strong> · Início:{' '}
                      {new Intl.DateTimeFormat('pt-BR').format(
                        new Date(`${campaign.starts_on}T12:00:00`),
                      )}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {campaign.status !== 'active' && (
                        <Button
                          disabled={saving}
                          onClick={() =>
                            void handleStatusChange(campaign.id, 'active')
                          }
                          type="button"
                          variant="secondary"
                        >
                          Ativar
                        </Button>
                      )}
                      {campaign.status === 'active' && (
                        <Button
                          disabled={saving}
                          onClick={() =>
                            void handleStatusChange(campaign.id, 'paused')
                          }
                          type="button"
                          variant="outline"
                        >
                          Pausar
                        </Button>
                      )}
                      {campaign.status !== 'ended' && (
                        <Button
                          disabled={saving}
                          onClick={() =>
                            void handleStatusChange(campaign.id, 'ended')
                          }
                          type="button"
                          variant="ghost"
                        >
                          Encerrar
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
