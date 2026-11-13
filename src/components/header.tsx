'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { isSupabaseEnvConfigured } from '@/lib/supabase';

export function PawMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-[#006b57] text-white ${small ? 'h-9 w-9' : 'h-10 w-10'}`}
    >
      <svg
        aria-hidden="true"
        className={small ? 'h-5 w-5' : 'h-6 w-6'}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <ellipse cx="12" cy="16.5" rx="5.3" ry="4.3" />
        <ellipse cx="5.5" cy="10" rx="2.1" ry="2.8" transform="rotate(-20 5.5 10)" />
        <ellipse cx="10" cy="6.8" rx="2.1" ry="2.8" transform="rotate(-7 10 6.8)" />
        <ellipse cx="14.5" cy="6.8" rx="2.1" ry="2.8" transform="rotate(7 14.5 6.8)" />
        <ellipse cx="18.5" cy="10" rx="2.1" ry="2.8" transform="rotate(20 18.5 10)" />
      </svg>
    </span>
  );
}

export function PublicHeader() {
  return (
    <>
      <div className="bg-gradient-to-r from-[#153b50] via-[#0c2d48] to-[#153b50] px-4 py-2 text-center text-xs font-medium text-white sm:text-left">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-between">
          <span>
            <span className="font-bold text-[#35c6b0]">CUIDADO VETERINÁRIO:</span>{' '}
            informação e acompanhamento para a saúde do seu pet.
          </span>
          <span className="hidden text-slate-200 sm:inline">
            Atendimento sujeito à disponibilidade profissional.
          </span>
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link aria-label="DrVet — início" className="flex shrink-0 items-center gap-3" href="/">
            <PawMark />
            <span>
              <span className="block text-lg font-bold tracking-tight text-[#006b57]">DrVet</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Telemedicina
              </span>
            </span>
          </Link>
          <nav aria-label="Navegação pública" className="hidden items-center gap-1 xl:flex">
            <a
              className="rounded-full bg-[#ebf5ff] px-4 py-2 text-sm font-semibold text-[#006b57]"
              href="#inicio"
            >
              Início
            </a>
            <a className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="#especialidades">
              Especialidades
            </a>
            <a className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="#como-funciona">
              Como funciona
            </a>
            <Link className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/agendamento">
              Agendamentos
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#153b50] hover:bg-slate-50 sm:inline-flex"
              href="/agenda"
            >
              Área profissional
            </Link>
            <Link
              className="rounded-full bg-gradient-to-r from-[#0a63ba] via-[#0690b4] to-[#0eb485] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] sm:px-5 sm:text-sm"
              href="/agendamento"
            >
              Conheça o DrVet <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

export function WorkspaceHeader({
  pageTitle,
  menuOpen,
  onToggleMenu,
  onSignOut,
  authError,
  mobileNav,
}: {
  pageTitle: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSignOut: () => void;
  authError?: string;
  mobileNav?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-brand-navy lg:hidden"
            onClick={onToggleMenu}
            type="button"
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
          <Link aria-label="DrVet — início" className="flex items-center gap-2 lg:hidden" href="/">
            <PawMark small />
            <span className="font-extrabold tracking-tight text-brand-navy">DrVet</span>
          </Link>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              DrVet · Prática médica
            </p>
            <p className="text-lg font-bold text-brand-ink">{pageTitle}</p>
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="rounded-full bg-[#dff0ff] px-3 py-1.5 text-xs font-semibold text-slate-700">
            {isSupabaseEnvConfigured ? 'Sessão autenticada' : 'Modo demonstração (Mock)'}
          </span>
          <span className="hidden text-sm font-medium text-brand-muted xl:block">
            Telemedicina clínica
          </span>
          {isSupabaseEnvConfigured ? (
            <button
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onSignOut}
              type="button"
            >
              Sair
            </button>
          ) : (
            <Link
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              href="/login"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
      {authError && (
        <p className="px-4 pb-2 text-right text-xs text-red-700 sm:px-6" role="alert">
          {authError}
        </p>
      )}
      {mobileNav}
    </header>
  );
}
