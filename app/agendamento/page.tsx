import { Badge, Button, Card, DemoNotice, EmptyState, Input, MetricCard, PageHeader, Select } from '@/components/ui';

export default function Agendamento() {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Agendamentos"
        description="Consulte os atendimentos e acompanhe as solicitações dos pacientes."
        action={
          <Button disabled title="Disponível após a integração com agendamentos" type="button" className="rounded-full" variant="secondary">
            + Novo agendamento
          </Button>
        }
      />
      <DemoNotice />
      <section aria-label="Resumo de agendamentos" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Agendamentos" icon="▦" />
        <MetricCard label="Aguardando confirmação" icon="◷" />
        <MetricCard label="Consultas confirmadas" icon="✓" />
        <MetricCard label="Cancelamentos" icon="×" />
      </section>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(200px,1.5fr)_repeat(2,minmax(150px,1fr))_auto]">
          <Input aria-label="Buscar agendamentos" disabled placeholder="Buscar por pet, tutor ou profissional" />
          <Select aria-label="Filtrar por status" disabled defaultValue=""><option value="">Todos os status</option></Select>
          <Select aria-label="Filtrar por tipo" disabled defaultValue=""><option value="">Todos os atendimentos</option></Select>
          <Button disabled title="Disponível após integração" type="button" variant="outline">Limpar filtros</Button>
        </div>
      </Card>

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="font-bold text-[#153b50]">Lista de atendimentos</h2>
            <p className="mt-1 text-xs text-slate-500">A listagem ficará disponível após a conexão com a agenda.</p>
          </div>
          <Badge variant="info">Sincronização não configurada</Badge>
        </div>
        <div className="p-4 sm:p-6">
          <EmptyState
            title="Nenhum agendamento carregado"
            description="Não há dados de pacientes neste ambiente. Conecte a fonte de dados autorizada para consultar a agenda."
            action={<Button disabled title="Disponível após integração" type="button" variant="secondary">Criar agendamento</Button>}
          />
        </div>
      </Card>
    </div>
  );
}
