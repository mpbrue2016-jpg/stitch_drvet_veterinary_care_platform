import type { Metadata } from 'next';
import { TeleconsultaRoom } from '@/components/teleconsulta-room';

export const metadata: Metadata = {
  title: 'Sala de Teleconsulta — DrVet',
  description: 'Sala de atendimento remoto e chat clínico em tempo real.',
};

export default function TeleconsultaPage() {
  return <TeleconsultaRoom />;
}
