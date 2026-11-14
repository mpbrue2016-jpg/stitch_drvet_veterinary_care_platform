'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DemoNotice,
  EmptyState,
  MetricCard,
  PageHeader,
  Skeleton,
  Table,
  TableCell,
  TableHead,
  Toast,
} from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { buscarResumoFinanceiro, listarComissoes } from '@/services/commissions.service';
import { listarCampanhasAds, listarParceirosAtivos } from '@/services/partners.service';
import type {
  AdCampaign,
  CommissionEntry,
  CommissionSummary,
  PartnerListing,
} from '@/types/entities';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function PartnerDashboard() {
  const configured = isSupabaseConfigured();
  const [partners, setPartners] = useState<PartnerListing[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [commissions, setCommissions] = useState<CommissionEntry[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [loading, setLoading] = useState(configured);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [partnersRes, campaignsRes, commRes, sumRes] = await Promise.all([
        listarParceirosAtivos(),
        listarCampanhasAds(),
        listarComissoes({ origin: 'pharmacy_split' }).catch(() => ({ entries: [] })),
        buscarResumoFinanceiro().catch(() => null),
      ]);
      setPartners(partnersRes.partners);
      setCampaigns(campaignsRes.campaigns);
      setCommissions(commRes.entries);
      setSummary(sumRes);
      setSelectedPartnerId((current) => current || partnersRes.partners[0]?.id || '');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o painel comercial B2B.',
      );
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activePartner = partners.find((p) => p.id === selectedPartnerId) ?? partners[0];
  const qrInvitePath = activePartner
    ? `/cadastro?cupom=${encodeURIComponent(activePartner.coupon_code)}&parceiro=${encodeURIComponent(activePartner.trade_name)}`
    : '/cadastro?cupom=DRVET15';

  const totalClicks = campaigns.reduce((acc, item) => acc + item.clicks_count, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
  const pharmacySplitTotalCents = commissions.reduce(
    (acc, item) => acc + item.net_amount_cents,
    0,
  );

  async function handleCopyQrLink() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${qrInvitePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(`Link QR copiado: ${url}`);
    } catch {
      setNotice(`Compartilhe este endereço no balcão: ${url}`);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-green px-4 text-sm font-bold text-white hover:bg-[#0f8a72]"
              href="/parceiros"
            >
              Gerenciar lojas &amp; cupons
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
              href="/anuncios"
            >
              DrVet Ads
            </Link>
          </div>
        }
        description="Painel comercial B2B para Pet Shops, farmácias veterinárias e anunciantes acompanharem cupons QR, dispensação e ROI."
        title="Painel do Parceiro B2B & Farmácia"
      />

      {!configured && <DemoNotice />}
      {notice && (
        <div className="mb-4">
          <Toast message={notice} onDismiss={() => setNotice('')} variant="success" />
        </div>
      )}
      {errorMessage && (
        <div className="mb-4">
          <Toast message={errorMessage} onDismiss={() => setErrorMessage('')} variant="danger" />
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          detail="Unidades B2B ativas na rede"
          icon="🏪"
          label="Lojas & Farmácias"
          value={loading ? '…' : String(partners.length)}
        />
        <MetricCard
          detail="Split de receitas e dispensação"
          icon="💊"
          label="Repasses Farmácia"
          value={loading ? '…' : formatCurrency(pharmacySplitTotalCents)}
        />
        <MetricCard
          detail={`${activeCampaigns} campanhas ativas`}
          icon="📣"
          label="Cliques DrVet Ads"
          value={loading ? '…' : String(totalClicks)}
        />
        <MetricCard
          detail={summary ? summary.period_label : 'Sem conta configurada'}
          icon="D+1"
          label="Saldo disponível"
          value={loading ? '…' : summary ? formatCurrency(summary.available_cents) : 'R$ 0,00'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          description="Selecione o estabelecimento para gerar o link de balcão com cupom automático."
          title="Kit Balcão & QR Code Promocional"
        >
          {loading ? (
            <Skeleton className="h-44 w-full" />
          ) : partners.length === 0 ? (
            <EmptyState
              action={
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white"
                  href="/parceiros"
                >
                  Credenciar Pet Shop
                </Link>
              }
              description="Nenhum parceiro cadastrado ainda."
              title="Sem lojas credenciadas"
            />
          ) : (
            <div className="grid gap-4">
              <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-600">
                Unidade ativa
                <select
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-brand-ink"
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  value={activePartner?.id ?? ''}
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.trade_name} ({p.coupon_code})
                    </option>
                  ))}
                </select>
              </label>

              {activePartner && (
                <div className="rounded-2xl border border-emerald-200 bg-[#F0F8FB] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="success">
                      {activePartner.kind === 'pharmacy' ? 'Farmácia' : 'Pet Shop'}
                    </Badge>
                    <span className="text-xs font-extrabold text-brand-navy">
                      {activePartner.discount_percent}% OFF
                    </span>
                  </div>
                  <p className="mt-2 font-bold text-brand-navy">{activePartner.trade_name}</p>
                  <p className="text-xs text-slate-600">
                    {activePartner.city}/{activePartner.state} · Cupom{' '}
                    <strong>{activePartner.coupon_code}</strong>
                  </p>
                  <p className="mt-3 break-all rounded-lg bg-white p-2 font-mono text-[11px] text-slate-700">
                    {qrInvitePath}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => void handleCopyQrLink()} type="button" variant="secondary">
                      Copiar link QR
                    </Button>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-brand-ink hover:bg-brand-ice"
                      href={qrInvitePath}
                    >
                      Testar onboarding
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card
            description="Lançamentos recentes de dispensação e performance de anúncios B2B."
            title="Dispensação & Campanhas Ativas"
          >
            {loading ? (
              <Skeleton className="h-44 w-full" />
            ) : campaigns.length === 0 && commissions.length === 0 ? (
              <EmptyState
                action={
                  <Link
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white"
                    href="/anuncios"
                  >
                    Criar campanha no DrVet Ads
                  </Link>
                }
                description="Crie sua primeira campanha ou aguarde dispensações vinculadas ao cupom."
                title="Sem movimentações comerciais"
              />
            ) : (
              <div className="grid gap-5">
                {campaigns.length > 0 && (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Campanha Ads</TableHead>
                        <TableHead>Posição</TableHead>
                        <TableHead>Orçamento</TableHead>
                        <TableHead>Cliques</TableHead>
                        <TableHead>Status</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((camp) => (
                        <tr key={camp.id}>
                          <TableCell className="font-semibold">{camp.title}</TableCell>
                          <TableCell>{camp.placement}</TableCell>
                          <TableCell>{formatCurrency(camp.budget_cents)}</TableCell>
                          <TableCell>{camp.clicks_count}</TableCell>
                          <TableCell>
                            <Badge variant={camp.status === 'active' ? 'success' : 'neutral'}>
                              {camp.status}
                            </Badge>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}

                {commissions.length > 0 && (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Referência</TableHead>
                        <TableHead>Tutor / Pet</TableHead>
                        <TableHead>Líquido</TableHead>
                        <TableHead>Status</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.slice(0, 6).map((entry) => (
                        <tr key={entry.id}>
                          <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                          <TableCell>
                            {entry.tutor_name} · {entry.pet_name}
                          </TableCell>
                          <TableCell className="font-bold">
                            {formatCurrency(entry.net_amount_cents)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.status === 'available' ? 'success' : 'info'}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
