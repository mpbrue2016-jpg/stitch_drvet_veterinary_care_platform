import type { Metadata } from 'next';
import { PartnerTutorOnboarding } from '@/components/partner-tutor-onboarding';

export const metadata: Metadata = {
  title: 'Cadastro via QR Code Parceiro',
  description: 'Onboarding rápido de tutores e cadastro do primeiro pet via QR Code de Pet Shop parceiro.',
};

export default function CadastroPage() {
  return <PartnerTutorOnboarding />;
}
