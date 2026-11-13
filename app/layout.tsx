import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DrVet',
    template: '%s | DrVet',
  },
  description: 'Plataforma de cuidado e telemedicina veterinária DrVet.',
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