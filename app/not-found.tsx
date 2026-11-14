import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-xl justify-items-center gap-5 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:my-12 sm:p-10">
      <span className="inline-flex rounded-full bg-[#ebf5ff] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-[#006b57]">
        DrVet · 404
      </span>
      <h1 className="text-2xl font-extrabold text-[#153b50] sm:text-3xl">
        Página não encontrada
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        O endereço acessado não existe ou foi movido. Volte para a página inicial ou
        acesse seus agendamentos para continuar o atendimento do seu pet.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          className="inline-flex min-h-11 items-center rounded-full bg-[#087a68] px-5 text-sm font-bold text-white hover:bg-[#0f8a72]"
          href="/"
        >
          Ir para a Home
        </Link>
        <Link
          className="inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
          href="/agendamento"
        >
          Meus agendamentos
        </Link>
      </div>
    </div>
  );
}
