import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DrVet — Telemedicina Veterinária',
    template: '%s | DrVet',
  },
  description: 'Plataforma de cuidado, prontuário clínico e telemedicina veterinária DrVet.',
  openGraph: {
    title: 'DrVet — Telemedicina Veterinária',
    description: 'Plataforma de cuidado, prontuário clínico e telemedicina veterinária DrVet.',
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
      <body className="bg-brand-floor text-brand-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}