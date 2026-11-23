import type { Metadata } from 'next';
import { VetDashboard } from '@/components/vet-dashboard';

export const metadata: Metadata = {
  title: 'Painel Operacional do Veterinário',
  description: 'Cockpit operacional do médico-veterinário com agenda, fila de atendimentos, prontuários e honorários.',
};

export default function VetDashboardPage() {
  return <VetDashboard />;
}
