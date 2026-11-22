import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DrVets — Telemedicina Veterinária 24h | Seu pet sempre por perto',
    template: '%s | DrVets',
  },
  description:
    'Plataforma de telemedicina veterinária 24h, prontuário clínico, prescrição ICP-Brasil e ecossistema pet DrVets.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/pwa-192x192.png',
    apple: '/apple-touch-icon.png',
  },
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
    <html lang="pt-BR">
      <body className="bg-brand-floor font-sans text-brand-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}