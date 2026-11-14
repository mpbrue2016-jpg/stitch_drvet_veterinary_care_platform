import type { Metadata } from 'next';
import { OperationsHub } from '@/components/operations-hub';

export const metadata: Metadata = {
  title: 'Central Operacional & Exportações',
  description: 'Diretório de veterinários credenciados, exportação bancária CSV/OFX e repositório de contratos digitais.',
};

export default function OperationsHubPage() {
  return <OperationsHub />;
}
