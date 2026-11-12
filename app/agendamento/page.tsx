import { Badge, Button, Card, DemoNotice, PageHeader, Table, TableCell, TableHead } from '@/components/ui';

const appointments = [
  { pet: 'Pipoca', tutor: 'Ana Costa', veterinarian: 'Dra. Camila', consultation: 'Teleconsulta #145', status: 'Pago', date: '10/11/2026' },
  { pet: 'Max', tutor: 'João Silva', veterinarian: 'Dra. Ana Paula', consultation: 'Teleconsulta #142', status: 'Rascunho', date: '10/11/2026' },
];

export default function Agendamento() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agendamentos"
        description="Consulte os agendamentos de teleconsultas e atendimentos presenciais."
        action={
          <Button disabled title="Disponível após a integração com agendamentos" type="button" variant="secondary">
            Novo agendamento
          </Button>
        }
      />
      <DemoNotice />
      <Card className="p-0 sm:p-0">
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <TableHead>Pet</TableHead>
              <TableHead>Tutor</TableHead>
              <TableHead>Veterinário</TableHead>
              <TableHead>Consulta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr className="transition-colors hover:bg-brand-floor" key={appointment.consultation}>
                <TableCell className="font-medium">{appointment.pet}</TableCell>
                <TableCell>{appointment.tutor}</TableCell>
                <TableCell>{appointment.veterinarian}</TableCell>
                <TableCell>{appointment.consultation}</TableCell>
                <TableCell>
                  <Badge variant={appointment.status === 'Pago' ? 'success' : 'warning'}>
                    {appointment.status}
                  </Badge>
                </TableCell>
                <TableCell>{appointment.date}</TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
