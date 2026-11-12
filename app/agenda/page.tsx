import { Badge, Button, Card, DemoNotice, PageHeader, Table, TableCell, TableHead } from '@/components/ui';

const appointments = [
  { veterinarian: 'Dra. Camila Silva', date: '11/11/2026', time: '14:00', type: 'Teleconsulta', status: 'Confirmado' },
  { veterinarian: 'Dra. Ana Paula', date: '11/11/2026', time: '15:30', type: 'Presencial', status: 'Em andamento' },
];

export default function Agenda() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agenda veterinária"
        description="Acompanhe os horários de consultas e teleconsultas."
        action={
          <Button disabled title="Disponível após a integração com agenda e consultas" type="button">
            Nova consulta
          </Button>
        }
      />
      <DemoNotice />
      <Card className="p-0 sm:p-0">
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <TableHead>Veterinário</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr className="transition-colors hover:bg-brand-floor" key={`${appointment.veterinarian}-${appointment.time}`}>
                <TableCell className="font-medium">{appointment.veterinarian}</TableCell>
                <TableCell>{appointment.date}</TableCell>
                <TableCell>{appointment.time}</TableCell>
                <TableCell>{appointment.type}</TableCell>
                <TableCell>
                  <Badge variant={appointment.status === 'Confirmado' ? 'success' : 'warning'}>
                    {appointment.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button disabled title="Disponível após a integração com consultas" type="button" variant="outline">
                    Ver
                  </Button>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
