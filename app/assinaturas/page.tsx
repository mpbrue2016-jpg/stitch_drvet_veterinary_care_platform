import type { Metadata } from 'next';
import { SubscriptionsClub } from '@/components/subscriptions-club';

export const metadata: Metadata = {
  title: 'Clube DrVet e Pagamentos — DrVet',
  description: 'Assinaturas preventivas Clube DrVet e comprovantes de pagamento.',
};

export default function AssinaturasPage() {
  return <SubscriptionsClub />;
}
