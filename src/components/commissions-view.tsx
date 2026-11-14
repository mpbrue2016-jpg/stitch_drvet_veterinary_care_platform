'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { anticipationRequestSchema } from '@/lib/validations';
import {
  buscarResumoFinanceiro,
  listarComissoes,
  solicitarAntecipacao,
} from '@/services/commissions.service';
import type {
  CommissionEntry,
  CommissionOrigin,
  CommissionStatus,
  CommissionSummary,
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

export function CommissionsView() {
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<CommissionOrigin | ''>('');
  const [status, setStatus] = useState<CommissionStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [anticipationValue, setAnticipationValue] = useState('1000,00');
  const [anticipationNotes, setAnticipationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [summaryData, entriesData] = await Promise.all([
        buscarResumoFinanceiro(),
        listarComissoes({ search, origin, status }),
      ]);
      setSummary(summaryData);
      setEntries(entriesData.entries);
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
        description="Acompanhe lançamentos, comissões, conta de repasse e solicitações de antecipação."
        action={
          <Button
            className="rounded-full"
            onClick={() => setModalOpen(true)}
            type="button"
          >
            + Solicitar antecipação
          </Button>
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
              ? 'Gateway conectado'
              : 'Repasse via conta cadastrada'}
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
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
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Conta de repasse
              </p>
              <p className="mt-1 text-sm font-semibold text-[#153b50]">
                {summary?.payout_account_label ?? 'Carregando...'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Chave de pagamento
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {summary?.pix_key_masked ?? 'Não cadastrada'}
              </p>
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
          description="Resumo de arquivos e comprovantes disponíveis."
        >
          <Tabs
            label="Documentos financeiros"
            tabs={[
              {
                id: 'conciliacao',
                label: 'Conciliação',
                content: (
                  <p className="text-sm text-slate-600">
                    Utilize o botão Exportar CSV acima para baixar os lançamentos filtrados ou integre o webhook do provedor em Admin &amp; Integrações.
                  </p>
                ),
              },
              {
                id: 'notas',
                label: 'Notas fiscais',
                content: (
                  <p className="text-sm text-slate-600">
                    Nenhuma nota fiscal emitida para os lançamentos deste período.
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
    </div>
  );
}
