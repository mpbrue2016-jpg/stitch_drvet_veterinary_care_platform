import { Button, Card, DemoNotice, Input, PageHeader, Select } from '@/components/ui';

export default function AgendamentoEdit() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Agendamento de teleconsulta"
        description="Os campos serão conectados à agenda quando a integração estiver configurada."
      />
      <DemoNotice />
      <Card>
        <form className="grid gap-5">
          <Input label="Pet" name="pet" placeholder="Nome ou identificador do pet" />
          <Input label="Veterinário" name="veterinario" placeholder="Nome do veterinário" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="Data" name="data" type="date" />
            <Input label="Horário" name="horario" type="time" />
          </div>
          <Select label="Tipo de consulta" name="tipo" defaultValue="teleconsulta">
            <option value="teleconsulta">Teleconsulta</option>
            <option value="presencial">Consulta presencial</option>
          </Select>
          <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row">
            <Button disabled title="Disponível após a integração com a agenda" type="button" variant="outline">
              Salvar rascunho
            </Button>
            <Button disabled title="Disponível após a integração com a agenda" type="button">
              Confirmar agendamento
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
