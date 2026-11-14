import Link from 'next/link';
import { AppointmentsList } from '@/components/appointments-list';

export default function Agendamento({
  searchParams,
}: {
  searchParams?: { denied?: string };
}) {
  const denied = searchParams?.denied;

  return (
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
            DrVet
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[#153b50]">
            Agendamentos
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Solicitações e consultas vinculadas à sua conta.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded-full bg-[#087a68] px-5 text-sm font-bold text-white"
          href="/agendamento/edit"
        >
          + Novo agendamento
        </Link>
      </header>
      {denied && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {denied === 'admin'
            ? 'Acesso restrito a administradores master da plataforma.'
            : 'Acesso restrito a perfis profissionais (veterinário, parceiro ou equipe credenciada).'}
        </div>
      )}
      <AppointmentsList />
    </div>
  );
}
