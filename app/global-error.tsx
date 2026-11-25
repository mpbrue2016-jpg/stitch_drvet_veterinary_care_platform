'use client';

export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="grid min-h-screen place-items-center bg-[#f6faff] p-6 text-[#153b50]">
        <main className="grid max-w-lg justify-items-center gap-5 rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-red-700">
            DrVet · Recuperação Global
          </span>
          <h1 className="text-2xl font-extrabold">
            Não foi possível exibir esta página
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Ocorreu um erro inesperado no carregamento da interface. Você pode
            tentar recarregar com segurança ou voltar para a tela inicial.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              className="inline-flex min-h-10 items-center rounded-lg bg-[#087a68] px-4 text-sm font-semibold text-white hover:bg-[#066556]"
              onClick={reset}
              type="button"
            >
              Tentar novamente
            </button>
            <a
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
              href="/"
            >
              Ir para a Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
