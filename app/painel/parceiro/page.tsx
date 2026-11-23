import type { Metadata } from 'next';
import { PartnerDashboard } from '@/components/partner-dashboard';

export const metadata: Metadata = {
  title: 'Painel Comercial do Parceiro B2B',
  description: 'Gestão comercial de Pet Shops, farmácias credenciadas, cupons QR e campanhas DrVet Ads.',
};

export default function PartnerDashboardPage() {
  return <PartnerDashboard />;
}
