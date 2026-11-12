import { Badge, Button, Card, DemoNotice, EmptyState, MetricCard, PageHeader } from '@/components/ui';

const weekDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const timeSlots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

export default function Agenda() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Agenda de consultas"
        description="Acompanhe consultas, retornos e procedimentos em um só lugar."
        action={
          <Button disabled title="Disponível após a integração com agenda e consultas" type="button" className="rounded-full">
            + Novo agendamento
          </Button>
        }
      />
      <DemoNotice />

      <section aria-label="Indicadores da agenda" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Consultas na semana" icon="▦" />
        <MetricCard label="Teleconsultas" icon="◉" />
        <MetricCard label="Receita estimada" icon="R$" />
        <MetricCard label="Duração padrão" value="— min" detail="Configuração não definida" icon="◷" />
      </section>

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button aria-label="Semana anterior" disabled type="button" variant="outline">‹</Button>
                <Button disabled type="button" variant="outline">Hoje</Button>
                <Button aria-label="Próxima semana" disabled type="button" variant="outline">›</Button>
                <h2 className="ml-1 font-bold text-[#153b50] sm:ml-3">Visão semanal</h2>
              </div>
              <Badge variant="info">Fuso horário não configurado</Badge>
            </div>
            <div aria-label="Modos de visualização" className="flex flex-wrap gap-2">
              <Button disabled className="rounded-full" type="button" variant="secondary">Semanal</Button>
              <Button disabled className="rounded-full" type="button" variant="outline">Mensal</Button>
              <Button disabled className="rounded-full" type="button" variant="outline">Diária</Button>
              <Button disabled className="rounded-full" type="button" variant="outline">Lista</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wide text-slate-500">Filtrar:</span>
              <Badge variant="neutral">Todas</Badge>
              <Badge variant="info">Teleconsulta</Badge>
              <Badge variant="success">Retorno</Badge>
              <Badge variant="warning">Plantão</Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[76px_repeat(5,minmax(120px,1fr))] border-b border-slate-100 bg-[#ebf5ff]">
                <div className="p-3 text-[10px] font-bold uppercase text-slate-600">Horário</div>
                {weekDays.map((day) => (
                  <div className="border-l border-slate-100 p-3 text-center" key={day}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{day}</p>
                    <p className="mt-1 text-sm font-bold text-[#153b50]">—</p>
                  </div>
                ))}
              </div>
              {timeSlots.map((time) => (
                <div className="grid min-h-20 grid-cols-[76px_repeat(5,minmax(120px,1fr))] border-b border-slate-100 last:border-b-0" key={time}>
                  <div className="bg-[#f6faff] px-3 py-4 text-xs font-semibold text-slate-600">{time}</div>
                  {weekDays.map((day) => (
                    <div className="border-l border-slate-100 p-2" key={`${day}-${time}`}>
                      <div className="grid h-full min-h-14 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
                        <span className="text-[11px] text-slate-400">Sem dados</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-[#f6faff] px-4 py-3 text-[11px] text-slate-600 sm:px-5">
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#13a88a]" />Consulta confirmada</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#406279]" />Teleconsulta</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#c0e4ff]" />Bloqueio</span>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card title="Próximo atendimento" description="Os atendimentos aparecerão quando a agenda estiver conectada.">
            <EmptyState title="Nenhuma consulta carregada" description="Conecte a agenda para consultar os próximos atendimentos." />
            <Button className="mt-4 w-full rounded-full" disabled title="Disponível após integração" type="button" variant="secondary">Acessar sala de espera</Button>
          </Card>
          <Card title="Disponibilidade" description="Os horários e intervalos serão exibidos após a configuração da agenda.">
            <div className="rounded-xl bg-[#ebf5ff] p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span>Duração da consulta</span><strong>—</strong></div>
              <div className="mt-3 flex items-center justify-between"><span>Horário de atendimento</span><strong>—</strong></div>
              <Button className="mt-4 w-full rounded-full" disabled title="Disponível após integração" type="button" variant="outline">Bloquear período</Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
