import type { Metadata } from 'next';
import { PartnersPortal } from '@/components/partners-portal';

export const metadata: Metadata = {
  title: 'Parceiros B2B e DrVet Ads — DrVet',
  description: 'Rede de farmácias e pet shops parceiros com cupons e campanhas DrVet Ads.',
};

export default function ParceirosPage() {
  return <PartnersPortal />;
}
