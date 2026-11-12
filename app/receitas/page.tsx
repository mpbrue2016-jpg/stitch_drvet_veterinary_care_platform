import { Badge, Button, Card, DemoNotice, EmptyState, Input, PageHeader, Select } from '@/components/ui';

export default function Receitas() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Receitas digitais"
        description="Área de prescrição veterinária. Conteúdo clínico só será exibido após integração autorizada."
        action={
          <Button disabled title="Disponível após a integração com receitas digitais" type="button" className="rounded-full" variant="secondary">
            + Nova receita
          </Button>
        }
      />
      <DemoNotice />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.8fr)]">
        <div className="grid gap-5">
          <Card className="p-0 sm:p-0">
            <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
              <Button disabled type="button" variant="secondary">Prescrição veterinária</Button>
              <Button disabled type="button" variant="outline">Controle especial</Button>
              <Badge className="ml-auto self-center" variant="info">Padrão clínico não configurado</Badge>
            </div>
            <div className="grid gap-5 p-4 sm:p-6">
              <div>
                <h2 className="text-lg font-bold text-[#153b50]">Nova prescrição</h2>
                <p className="mt-1 text-sm text-slate-600">Selecione o paciente e preencha as informações clínicas com base na avaliação profissional.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input disabled label="Paciente" placeholder="Selecione um paciente" />
                <Input disabled label="Responsável" placeholder="Disponível após integração" />
                <Input disabled label="Peso aferido" placeholder="Informe após avaliação" />
                <Input disabled label="Profissional responsável" placeholder="Disponível após integração" />
              </div>
              <div className="rounded-2xl bg-[#ebf5ff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-[#153b50]">Medicamento ou princípio ativo</h3>
                  <Badge variant="neutral">Catálogo não conectado</Badge>
                </div>
                <Input className="mt-3" disabled aria-label="Buscar medicamento" placeholder="A busca ficará disponível após configuração do catálogo clínico" />
                <p className="mt-3 text-xs leading-5 text-slate-600">Nenhuma sugestão de medicamento ou dose é exibida neste ambiente.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select disabled label="Via de administração" defaultValue=""><option value="">Não configurada</option></Select>
                <Input disabled label="Frequência e período" placeholder="Preenchimento clínico" />
              </div>
              <Input disabled label="Orientações ao responsável" placeholder="Disponível quando a prescrição estiver conectada" />
              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
                <Button disabled title="Disponível após a integração clínica" type="button" variant="outline">Salvar rascunho</Button>
                <Button disabled title="Assinatura digital não configurada" type="button" variant="secondary">Assinar e emitir</Button>
              </div>
            </div>
          </Card>

          <Card title="Itens da prescrição" description="Os itens prescritos aparecerão aqui após a integração clínica.">
            <EmptyState title="Nenhum item adicionado" description="O catálogo de medicamentos não está conectado." />
          </Card>
        </div>

        <aside className="grid gap-5">
          <Card className="border-[#d4ebff] bg-[#f7fbff]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#153b50]">Prévia do documento</h2>
                <p className="mt-1 text-xs text-slate-600">A prévia só aparece para uma prescrição real.</p>
              </div>
              <Badge variant="info">Prévia indisponível</Badge>
            </div>
            <div className="mt-5 grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <EmptyState title="Documento não gerado" description="Não há conteúdo clínico para pré-visualizar." />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button disabled title="Documento não gerado" type="button" variant="outline">Baixar PDF</Button>
              <Button disabled title="Documento não gerado" type="button" variant="outline">Imprimir</Button>
            </div>
          </Card>
          <Card className="border-emerald-100 bg-emerald-50/60">
            <h2 className="font-bold text-emerald-900">Assinatura digital</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80">Nenhum certificado está conectado. A emissão de receitas permanece desativada neste ambiente.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
