import type { Metadata } from 'next';
import { AdminConsole } from '@/components/admin-console';

export const metadata: Metadata = {
  title: 'Admin Master & Integrações — DrVet',
  description: 'Governança RBAC, credenciamento e endpoints de integração.',
};

export default function AdminPage() {
  return <AdminConsole />;
}
