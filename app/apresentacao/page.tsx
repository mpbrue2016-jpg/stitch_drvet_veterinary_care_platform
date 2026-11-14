import type { Metadata } from 'next';
import { ExecutiveDeck } from '@/components/executive-deck';

export const metadata: Metadata = {
  title: 'Apresentação Executiva DrVet',
  description: 'Apresentação executiva interativa de toda a arquitetura, fluxos clínicos e ecossistema B2B da plataforma DrVet.',
};

export default function ApresentacaoPage() {
  return <ExecutiveDeck />;
}
