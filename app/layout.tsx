import type { Metadata } from 'next';
import { Caveat, Plus_Jakarta_Sans } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'DrVets — Telemedicina Veterinária 24h | Seu pet sempre por perto',
    template: '%s | DrVets',
  },
  description:
    'Plataforma de telemedicina veterinária 24h, prontuário clínico, prescrição ICP-Brasil e ecossistema pet DrVets.',
  openGraph: {
    title: 'DrVets — Telemedicina Veterinária 24h | Seu pet sempre por perto',
    description:
      'Converse por vídeo com médicos-veterinários com CRMV verificado no conforto de casa.',
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`${plusJakarta.variable} ${caveat.variable}`}
      lang="pt-BR"
    >
      <body className="bg-brand-floor font-sans text-brand-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}