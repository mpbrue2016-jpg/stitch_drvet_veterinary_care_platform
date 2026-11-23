'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, FileText, Printer, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DemoNotice,
  EmptyState,
  Input,
  MetricCard,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableCell,
  TableHead,
  Tabs,
  Toast,
} from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  anticipationRequestSchema,
  fiscalInvoiceSchema,
  payoutAccountSchema,
} from '@/lib/validations';
import {
  atualizarStatusNotaFiscal,
  buscarResumoFinanceiro,
  listarComissoes,
  listarNotasFiscais,
  salvarContaRepasse,
  solicitarAntecipacao,
  solicitarNotaFiscal,
} from '@/services/commissions.service';
import type {
  CommissionEntry,
  CommissionOrigin,
  CommissionStatus,
  CommissionSummary,
  FiscalInvoice,
} from '@/types/entities';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

const originLabels: Record<CommissionOrigin, string> = {
  teleconsultation: 'Teleconsulta',
  in_person: 'Presencial',
  pharmacy_split: 'Split Farmácia',
  partner_plan: 'Clube / Parceiro',
};

const statusLabels: Record<CommissionStatus, string> = {
  available: 'Disponível',
  pending: 'Pendente D+1',
  paid: 'Repassado',
};

const statusVariant: Record<CommissionStatus, 'success' | 'warning' | 'info'> = {
  available: 'success',
  pending: 'warning',
  paid: 'info',
};

const nfseStatusLabels: Record<FiscalInvoice['status'], string> = {
  requested: 'Solicitada (RPS)',
  issued: 'Emitida',
  cancelled: 'Cancelada',
};

const nfseStatusVariant: Record<FiscalInvoice['status'], 'warning' | 'success' | 'neutral'> = {
  requested: 'warning',
  issued: 'success',
  cancelled: 'neutral',
};

export function CommissionsView() {
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [invoices, setInvoices] = useState<FiscalInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<CommissionOrigin | ''>('');
  const [status, setStatus] = useState<CommissionStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [nfseModalOpen, setNfseModalOpen] = useState(false);

  const [anticipationValue, setAnticipationValue] = useState('1000,00');
  const [anticipationNotes, setAnticipationNotes] = useState('');

  const [payoutProvider, setPayoutProvider] = useState<'asaas' | 'mercadopago'>('asaas');
  const [payoutLabel, setPayoutLabel] = useState('');
  const [payoutPixKey, setPayoutPixKey] = useState('');

  const [nfsePeriod, setNfsePeriod] = useState('');
  const [nfseAmount, setNfseAmount] = useState('');
  const [nfseTaxId, setNfseTaxId] = useState('');
  const [nfseProvider, setNfseProvider] = useState<'drvet_fiscal' | 'bling' | 'omie'>('drvet_fiscal');
  const [nfseNotes, setNfseNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [summaryData, entriesData, invoicesData] = await Promise.all([
        buscarResumoFinanceiro(),
        listarComissoes({ search, origin, status }),
        listarNotasFiscais().catch(() => ({ invoices: [] as FiscalInvoice[] })),
      ]);
      setSummary(summaryData);
      setEntries(entriesData.entries);
      setInvoices(invoicesData.invoices);
      setPayoutLabel((curr) =>
        curr ||
        (summaryData.payout_account_label !== 'Conta de repasse não configurada'
          ? summaryData.payout_account_label
          : ''),
      );
      setNfsePeriod((curr) => curr || summaryData.period_label);
      setNfseAmount((curr) =>
        curr ||
        (summaryData.period_total_cents > 0
          ? (summaryData.period_total_cents / 100).toFixed(2).replace('.', ',')
          : '180,00'),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar o extrato financeiro.',
      );
    } finally {
      setLoading(false);
    }
  }, [origin, search, status]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  async function handleRequestAnticipation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const normalized = Number(
      anticipationValue.replace(/\./g, '').replace(',', '.'),
    );
    const amountCents = Number.isFinite(normalized)
      ? Math.round(normalized * 100)
      : 0;

    const parsed = anticipationRequestSchema.safeParse({
      amount_cents: amountCents,
      notes: anticipationNotes,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Valor inválido para antecipação.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await solicitarAntecipacao(parsed.data);
      setModalOpen(false);
      setAnticipationNotes('');
      setToastMessage(
        `Solicitação registrada (${result.protocol}) para ${formatCurrency(result.requested_cents)}.`,
      );
      await loadFinance();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a solicitação.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePayoutAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const parsed = payoutAccountSchema.safeParse({
      provider: payoutProvider,
      payout_account_label: payoutLabel,
      pix_key: payoutPixKey,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Verifique os dados bancários e PIX.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await salvarContaRepasse({
        provider: payoutProvider,
        payout_account_label: parsed.data.payout_account_label,
        pix_key: parsed.data.pix_key,
      });
      setPayoutModalOpen(false);
      setPayoutPixKey('');
      setToastMessage('Conta de repasse e chave PIX atualizadas com sucesso.');
      await loadFinance();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a conta de repasse.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestNfse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const normalized = Number(nfseAmount.replace(/\./g, '').replace(',', '.'));
    const totalCents = Number.isFinite(normalized) ? Math.round(normalized * 100) : 0;

    const parsed = fiscalInvoiceSchema.safeParse({
      period_label: nfsePeriod,
      total_cents: totalCents,
      tax_id: nfseTaxId,
      provider: nfseProvider,
      notes: nfseNotes || null,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Verifique os dados fiscais informados.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const { invoice } = await solicitarNotaFiscal({
        period_label: parsed.data.period_label,
        total_cents: parsed.data.total_cents,
        tax_id: parsed.data.tax_id,
        provider: parsed.data.provider,
        notes: parsed.data.notes ?? undefined,
      });
      setNfseModalOpen(false);
      setNfseNotes('');
      setToastMessage(
        `NFSe ${invoice.invoice_number} registrada (${formatCurrency(invoice.total_cents)}).`,
      );
      await loadFinance();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao solicitar nota fiscal.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkNfseIssued(invoiceId: string) {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const { invoice } = await atualizarStatusNotaFiscal({
        invoiceId,
        status: 'issued',
      });
      setToastMessage(`Nota fiscal ${invoice.invoice_number} marcada como emitida.`);
      await loadFinance();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao atualizar nota fiscal.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleExportCsv() {
    if (entries.length === 0) {
      setToastMessage('Não há lançamentos carregados para exportar.');
      return;
    }
    const headers = ['Referência', 'Tutor', 'Pet', 'Origem', 'Valor Líquido (BRL)', 'Status', 'Data'];
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = entries.map((entry) =>
      [
        entry.reference,
        entry.tutor_name,
        entry.pet_name,
        originLabels[entry.origin],
        (entry.net_amount_cents / 100).toFixed(2).replace('.', ','),
        statusLabels[entry.status],
        new Date(entry.occurred_at).toLocaleDateString('pt-BR'),
      ]
        .map(escapeCell)
        .join(';'),
    );
    const csv = `\uFEFF${[headers.map(escapeCell).join(';'), ...rows].join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drvet-comissoes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setToastMessage(`Extrato CSV exportado (${entries.length} registros).`);
  }

  const configured = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Extrato financeiro e repasses"
        description="Acompanhe lançamentos, comissões, conta PIX de repasse, solicitações de antecipação e notas fiscais (NFSe)."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              onClick={() => setPayoutModalOpen(true)}
              type="button"
              variant="outline"
            >
              <Wallet className="mr-1.5 h-4 w-4" />
              Configurar PIX
            </Button>
            <Button
              className="rounded-full"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              + Solicitar antecipação
            </Button>
          </div>
        }
      />

      {!configured && <DemoNotice />}

      {toastMessage && (
        <div className="mb-4">
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage('')}
            variant="success"
          />
        </div>
      )}

      {errorMessage && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadFinance()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={summary?.provider_connected ? 'success' : 'info'}>
            {summary?.provider_connected
              ? 'Conta de repasse ativa'
              : 'Configure sua conta PIX'}
          </Badge>
          <span className="text-sm text-slate-600">
            Período: {summary?.period_label ?? 'Carregando...'}
          </span>
        </div>
        <Button
          onClick={handleExportCsv}
          type="button"
          variant="outline"
        >
          Exportar CSV
        </Button>
      </div>

      <section
        aria-label="Resumo financeiro"
        className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          detail="Liberado para saque D+0"
          icon="R$"
          label="Saldo disponível"
          value={loading || !summary ? '…' : formatCurrency(summary.available_cents)}
        />
        <MetricCard
          detail="Movimentação do mês"
          icon="▤"
          label="Total do período"
          value={loading || !summary ? '…' : formatCurrency(summary.period_total_cents)}
        />
        <MetricCard
          detail="Compensação D+1"
          icon="◷"
          label="Repasses pendentes"
          value={loading || !summary ? '…' : formatCurrency(summary.pending_cents)}
        />
        <MetricCard
          detail="Histórico consolidado"
          icon="↗"
          label="Total acumulado"
          value={loading || !summary ? '…' : formatCurrency(summary.accumulated_cents)}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#153b50]">Configuração financeira</h2>
              <p className="mt-1 text-sm text-slate-600">
                Dados de repasse vinculados aos provedores Asaas / Mercado Pago na plataforma.
              </p>
            </div>
            <Badge variant={summary?.provider_connected ? 'success' : 'warning'}>
              {summary?.provider_connected ? 'Gateway ativo' : 'Aguardando ativação'}
            </Badge>
          </div>
          <div className="mt-5 grid gap-4 rounded-2xl bg-[#ebf5ff] p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Conta de repasse
              </p>
              <p className="mt-1 text-sm font-semibold text-[#153b50]">
                {summary?.payout_account_label ?? 'Carregando...'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Chave PIX cadastrada
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {summary?.pix_key_masked ?? 'Não cadastrada'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button
                onClick={() => setPayoutModalOpen(true)}
                type="button"
                variant="outline"
              >
                <Building2 className="mr-1.5 h-4 w-4" />
                {summary?.provider_connected ? 'Alterar conta e PIX' : 'Cadastrar conta e chave PIX'}
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-[#d9f9f0] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-emerald-950">Antecipação de recebíveis</h3>
                <p className="mt-1 text-sm text-emerald-950/75">
                  Solicite o adiantamento do saldo disponível para sua conta de repasse cadastrada.
                </p>
              </div>
              <Button
                onClick={() => setModalOpen(true)}
                type="button"
                variant="secondary"
              >
                Solicitar antecipação →
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Documentos e conciliação"
          description="Conciliação CSV e emissão de NFSe do período."
        >
          <Tabs
            label="Documentos financeiros"
            tabs={[
              {
                id: 'notas',
                label: `Notas fiscais (${invoices.length})`,
                content: (
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-600">
                        Solicite sua NFSe por competência com protocolo e código fiscal.
                      </p>
                      <Button
                        className="min-h-9 px-3 text-xs"
                        onClick={() => setNfseModalOpen(true)}
                        type="button"
                        variant="secondary"
                      >
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        + Solicitar NFSe
                      </Button>
                    </div>
                    {invoices.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                        Nenhuma solicitação fiscal registrada até o momento.
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {invoices.map((inv) => (
                          <li
                            className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                            key={inv.id}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-[#153b50]">
                                  {inv.invoice_number} · {inv.period_label}
                                </p>
                                <p className="text-slate-600">
                                  {formatCurrency(inv.total_cents)} · Doc: {inv.tax_id} · Cód: {inv.verification_code}
                                </p>
                              </div>
                              <Badge variant={nfseStatusVariant[inv.status]}>
                                {nfseStatusLabels[inv.status]}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                              {inv.status === 'requested' && (
                                <Button
                                  className="min-h-8 px-2.5 text-xs"
                                  disabled={submitting}
                                  onClick={() => void handleMarkNfseIssued(inv.id)}
                                  type="button"
                                  variant="outline"
                                >
                                  Confirmar emissão
                                </Button>
                              )}
                              <Button
                                className="min-h-8 px-2.5 text-xs"
                                onClick={() => window.print()}
                                type="button"
                                variant="ghost"
                              >
                                <Printer className="mr-1 h-3 w-3" />
                                Imprimir protocolo
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ),
              },
              {
                id: 'conciliacao',
                label: 'Conciliação',
                content: (
                  <p className="text-sm text-slate-600">
                    Utilize o botão Exportar CSV acima para baixar os lançamentos filtrados ou integre o webhook do provedor em Admin &amp; Integrações.
                  </p>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="font-bold text-[#153b50]">Lançamentos de comissões</h2>
            <p className="mt-1 text-xs text-slate-500">
              Filtre por referência, origem ou status dos repasses registrados.
            </p>
          </div>
          <Badge variant="info">{entries.length} registros</Badge>
        </div>
        <div className="grid gap-3 border-b border-slate-100 bg-[#f7fbff] p-4 md:grid-cols-[minmax(180px,1.5fr)_repeat(2,minmax(140px,1fr))]">
          <Input
            aria-label="Buscar lançamentos"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por tutor, pet ou referência"
            value={search}
          />
          <Select
            aria-label="Filtrar por origem"
            onChange={(event) => setOrigin(event.target.value as CommissionOrigin | '')}
            value={origin}
          >
            <option value="">Todas as origens</option>
            <option value="teleconsultation">Teleconsulta</option>
            <option value="in_person">Presencial</option>
            <option value="pharmacy_split">Split Farmácia</option>
            <option value="partner_plan">Clube / Parceiro</option>
          </Select>
          <Select
            aria-label="Filtrar por status"
            onChange={(event) => setStatus(event.target.value as CommissionStatus | '')}
            value={status}
          >
            <option value="">Todos os status</option>
            <option value="available">Disponível</option>
            <option value="pending">Pendente D+1</option>
            <option value="paid">Repassado</option>
          </Select>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="Nenhum lançamento encontrado"
              description="Ajuste os filtros ou limpe a busca para visualizar os registros."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Referência</TableHead>
                  <TableHead>Tutor / Pet</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Valor líquido</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <TableCell className="font-semibold">{entry.reference}</TableCell>
                    <TableCell>
                      {entry.tutor_name} · {entry.pet_name}
                    </TableCell>
                    <TableCell>{originLabels[entry.origin]}</TableCell>
                    <TableCell className="font-bold text-[#153b50]">
                      {formatCurrency(entry.net_amount_cents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[entry.status]}>
                        {statusLabels[entry.status]}
                      </Badge>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Modal
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="Solicitar antecipação de recebíveis"
      >
        <form className="grid gap-4" onSubmit={(event) => void handleRequestAnticipation(event)}>
          <Input
            label="Valor desejado (R$)"
            name="anticipationValue"
            onChange={(event) => setAnticipationValue(event.target.value)}
            required
            value={anticipationValue}
          />
          <Input
            label="Observação (opcional)"
            name="anticipationNotes"
            onChange={(event) => setAnticipationNotes(event.target.value)}
            placeholder="Ex.: Repasse mensal da clínica"
            value={anticipationNotes}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setModalOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={submitting} type="submit" variant="secondary">
              {submitting ? 'Registrando...' : 'Confirmar solicitação'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        onClose={() => setPayoutModalOpen(false)}
        open={payoutModalOpen}
        title="Configurar conta e chave PIX de repasse"
      >
        <form className="grid gap-4" onSubmit={(event) => void handleSavePayoutAccount(event)}>
          <Select
            label="Provedor de split"
            onChange={(event) =>
              setPayoutProvider(event.target.value as 'asaas' | 'mercadopago')
            }
            value={payoutProvider}
          >
            <option value="asaas">Asaas</option>
            <option value="mercadopago">Mercado Pago</option>
          </Select>
          <Input
            label="Identificação da conta / Banco e titular"
            name="payoutLabel"
            onChange={(event) => setPayoutLabel(event.target.value)}
            placeholder="Ex.: Banco Inter · Dra. Camila Mendes"
            required
            value={payoutLabel}
          />
          <Input
            label="Chave PIX (será mascarada ao salvar)"
            name="payoutPixKey"
            onChange={(event) => setPayoutPixKey(event.target.value)}
            placeholder="CPF, CNPJ, e-mail ou chave aleatória"
            required
            value={payoutPixKey}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setPayoutModalOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={submitting} type="submit" variant="secondary">
              {submitting ? 'Salvando...' : 'Salvar conta'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        onClose={() => setNfseModalOpen(false)}
        open={nfseModalOpen}
        title="Solicitar Nota Fiscal de Serviço (NFSe)"
      >
        <form className="grid gap-4" onSubmit={(event) => void handleRequestNfse(event)}>
          <Input
            label="Competência / Período"
            name="nfsePeriod"
            onChange={(event) => setNfsePeriod(event.target.value)}
            required
            value={nfsePeriod}
          />
          <Input
            label="Valor total da nota (R$)"
            name="nfseAmount"
            onChange={(event) => setNfseAmount(event.target.value)}
            required
            value={nfseAmount}
          />
          <Input
            label="CPF ou CNPJ do prestador/tomador"
            name="nfseTaxId"
            onChange={(event) => setNfseTaxId(event.target.value)}
            placeholder="Somente números ou formatado"
            required
            value={nfseTaxId}
          />
          <Select
            label="Emissor fiscal"
            onChange={(event) =>
              setNfseProvider(event.target.value as 'drvet_fiscal' | 'bling' | 'omie')
            }
            value={nfseProvider}
          >
            <option value="drvet_fiscal">DrVet Fiscal (RPS)</option>
            <option value="bling">Bling ERP</option>
            <option value="omie">Omie ERP</option>
          </Select>
          <Input
            label="Observações fiscais (opcional)"
            name="nfseNotes"
            onChange={(event) => setNfseNotes(event.target.value)}
            placeholder="Serviços médico-veterinários"
            value={nfseNotes}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setNfseModalOpen(false)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={submitting} type="submit" variant="secondary">
              {submitting ? 'Solicitando...' : 'Gerar RPS / Solicitar NFSe'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
