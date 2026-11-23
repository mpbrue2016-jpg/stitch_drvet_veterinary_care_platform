import type { Metadata } from 'next';
import { PaymentsCheckout } from '@/components/payments-checkout';

export const metadata: Metadata = {
  title: 'Pagamentos e Checkout — DrVet',
  description: 'Pagamento de teleconsultas, aplicação de cupons e comprovantes.',
};

export default function PagamentosPage() {
  return <PaymentsCheckout />;
}
