import { Badge, Button, Card, DemoNotice, EmptyState, Input, MetricCard, PageHeader, Select } from '@/components/ui';

export default function Comissoes() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Extrato financeiro e repasses"
        description="Acompanhe os lançamentos financeiros após a configuração das integrações."
        action={
          <Button disabled title="Disponível após integração financeira" type="button" className="rounded-full">
            + Nova solicitação
          </Button>
        }
      />
      <DemoNotice />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="info">Split financeiro não conectado</Badge>
          <span className="text-sm text-slate-600">Período: não definido</span>
        </div>
        <Button disabled title="Disponível após integração financeira" type="button" variant="outline">Exportar relatório</Button>
      </div>

      <section aria-label="Resumo financeiro" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Saldo disponível" icon="R$" />
        <MetricCard label="Total do período" icon="▤" />
        <MetricCard label="Repasses pendentes" icon="◷" />
        <MetricCard label="Total acumulado" icon="↗" />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#153b50]">Configuração financeira</h2>
              <p className="mt-1 text-sm text-slate-600">Saldos, chaves e antecipações só serão exibidos após conectar o provedor.</p>
            </div>
            <Badge variant="warning">Não configurado</Badge>
          </div>
          <div className="mt-5 grid gap-4 rounded-2xl bg-[#ebf5ff] p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Conta de repasse</p>
              <p className="mt-1 text-sm font-semibold text-[#153b50]">Nenhuma conta conectada</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Chave de pagamento</p>
              <p className="mt-1 text-sm text-slate-600">Não cadastrada</p>
            </div>
            <Button className="sm:col-span-2 sm:justify-self-start" disabled title="Disponível após configuração do provedor" type="button" variant="outline">Configurar integração</Button>
          </div>
          <div className="mt-4 rounded-2xl bg-[#d9f9f0] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-emerald-950">Antecipação de recebíveis</h3>
                <p className="mt-1 text-sm text-emerald-950/75">A opção fica indisponível até configurar pagamentos e repasses.</p>
              </div>
              <Button disabled title="Disponível após integração financeira" type="button" variant="secondary">Solicitar antecipação →</Button>
            </div>
          </div>
        </Card>

        <Card title="Documentos e conciliação" description="Relatórios serão disponibilizados quando a integração financeira estiver ativa.">
          <EmptyState title="Nenhum documento disponível" description="Ainda não há notas fiscais ou dados de conciliação conectados." />
          <Button className="mt-4 w-full" disabled title="Disponível após integração financeira" type="button" variant="outline">Ver documentos</Button>
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="font-bold text-[#153b50]">Lançamentos de comissões</h2>
            <p className="mt-1 text-xs text-slate-500">Nenhuma transação financeira está sendo simulada.</p>
          </div>
          <Badge variant="info">Sem conexão financeira</Badge>
        </div>
        <div className="grid gap-3 border-b border-slate-100 bg-[#f7fbff] p-4 md:grid-cols-[minmax(180px,1.5fr)_repeat(2,minmax(140px,1fr))]">
          <Input aria-label="Buscar lançamentos" disabled placeholder="Buscar por responsável ou referência" />
          <Select aria-label="Filtrar por origem" disabled defaultValue=""><option value="">Todas as origens</option></Select>
          <Select aria-label="Filtrar por status" disabled defaultValue=""><option value="">Todos os status</option></Select>
        </div>
        <div className="p-4 sm:p-6">
          <EmptyState title="Nenhum lançamento carregado" description="Os valores só serão mostrados após configurar e conectar o serviço financeiro." />
        </div>
      </Card>
    </div>
  );
}
