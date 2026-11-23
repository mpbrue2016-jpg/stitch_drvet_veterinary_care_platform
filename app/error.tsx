'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto grid max-w-xl justify-items-center gap-5 rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm sm:my-12 sm:p-10">
      <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-red-700">
        DrVet · Recuperação
      </span>
      <h1 className="text-2xl font-extrabold text-[#153b50] sm:text-3xl">
        Algo não saiu como esperado
      </h1>
      <p className="text-sm leading-6 text-slate-600">
        Ocorreu uma falha temporária ao carregar esta tela. Você pode tentar novamente
        ou retornar à página inicial.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset} type="button" variant="secondary">
          Tentar novamente
        </Button>
        <Link
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
          href="/"
        >
          Voltar à Home
        </Link>
      </div>
    </div>
  );
}
