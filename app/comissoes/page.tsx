import { Badge, Button, Card, DemoNotice, PageHeader, Table, TableCell, TableHead } from '@/components/ui';

const commissions = [
  { veterinarian: 'Dra. Camila Silva', consultations: 12, total: 'R$ 1.200,00', commission: 'R$ 240,00', status: 'Pago', date: '10/11/2026' },
  { veterinarian: 'Dra. Ana Paula', consultations: 8, total: 'R$ 800,00', commission: 'R$ 160,00', status: 'Pendente', date: '09/11/2026' },
];

export default function Comissoes() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Comissões"
        description="Acompanhe os repasses registrados para profissionais veterinários."
        action={
          <Button disabled title="Disponível após a integração financeira" type="button">
            Novo repasse
          </Button>
        }
      />
      <DemoNotice />
      <Card className="p-0 sm:p-0">
        <Table>
          <thead className="bg-slate-50">
            <tr>
              <TableHead>Veterinário</TableHead>
              <TableHead>Consultas</TableHead>
              <TableHead>Valor total</TableHead>
              <TableHead>Comissão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </tr>
          </thead>
          <tbody>
            {commissions.map((commission) => (
              <tr className="transition-colors hover:bg-brand-floor" key={commission.veterinarian}>
                <TableCell className="font-medium">{commission.veterinarian}</TableCell>
                <TableCell>{commission.consultations}</TableCell>
                <TableCell>{commission.total}</TableCell>
                <TableCell>{commission.commission}</TableCell>
                <TableCell>
                  <Badge variant={commission.status === 'Pago' ? 'success' : 'warning'}>
                    {commission.status}
                  </Badge>
                </TableCell>
                <TableCell>{commission.date}</TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
