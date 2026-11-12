import { Badge, Button, Card, DemoNotice, PageHeader, Table, TableCell, TableHead } from '@/components/ui';

const prescriptions = [
  { pet: 'Pipoca', tutor: 'Ana Costa', veterinarian: 'Dra. Camila', consultation: 'Teleconsulta #145', status: 'Assinada', date: '11/11/2026' },
  { pet: 'Max', tutor: 'João Silva', veterinarian: 'Dra. Ana Paula', consultation: 'Teleconsulta #142', status: 'Rascunho', date: '10/11/2026' },
];

export default function Receitas() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Receitas digitais"
        description="Consulte receitas veterinárias vinculadas aos atendimentos."
        action={
          <Button disabled title="Disponível após a integração com receitas digitais" type="button" variant="secondary">
            Nova receita
          </Button>
        }
      />
      <DemoNotice />
      <Card className="p-0 sm:p-0">
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <TableHead>Paciente</TableHead>
              <TableHead>Tutor</TableHead>
              <TableHead>Veterinário</TableHead>
              <TableHead>Consulta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </tr>
          </thead>
          <tbody>
            {prescriptions.map((prescription) => (
              <tr className="transition-colors hover:bg-brand-floor" key={prescription.consultation}>
                <TableCell className="font-medium">{prescription.pet}</TableCell>
                <TableCell>{prescription.tutor}</TableCell>
                <TableCell>{prescription.veterinarian}</TableCell>
                <TableCell>{prescription.consultation}</TableCell>
                <TableCell>
                  <Badge variant={prescription.status === 'Assinada' ? 'success' : 'warning'}>
                    {prescription.status}
                  </Badge>
                </TableCell>
                <TableCell>{prescription.date}</TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
