import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DrVet Telemedicina',
  description: 'Plataforma de telemedicina veterinária DrVet',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-floor-5 text-text-344">{children}</body>
    </html>
  );
}