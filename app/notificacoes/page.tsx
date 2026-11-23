import type { Metadata } from 'next';
import { NotificationCenter } from '@/components/notification-center';

export const metadata: Metadata = {
  title: 'Notificações Push & Lembretes',
  description:
    'Gerencie notificações Web Push para lembretes de consultas marcadas e alertas da fila de atendimento veterinário.',
};

export default function NotificationsPage() {
  return <NotificationCenter />;
}
