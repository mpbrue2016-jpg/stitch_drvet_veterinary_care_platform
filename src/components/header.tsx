'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
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

const publicNavItems = [
  { href: '#especialistas', label: 'Especialistas' },
  { href: '#como-funciona', label: 'Como Funciona' },
  { href: '#consultorio-vet', label: 'Para Veterinários' },
  { href: '#parceiros', label: 'Pet Shops & Clínicas' },
  { href: '#drvets-ads', label: 'DrVet Ads', badge: 'B2B' },
  { href: '#depoimentos', label: 'Avaliações' },
];

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="border-b border-[#00B298]/20 bg-gradient-to-r from-[#153B50] via-[#0C2D48] to-[#153B50] px-4 py-2.5 text-xs text-white shadow-sm sm:text-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="relative mr-1 inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-bold tracking-wide text-[#25C5DC]">PLANTÃO 24H:</span>
            <span>Médicos veterinários online para pronto atendimento por vídeo em até 10 minutos.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-300">
            <div className="hidden items-center gap-1.5 transition hover:text-white md:flex">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#00B298]/20 text-[10px] font-bold text-[#00B298]">
                ✓
              </span>
              <span>Conforme Resolução CFMV nº 1.465/2022</span>
            </div>
            <a
              className="flex items-center gap-1 font-semibold transition hover:text-[#32D77D]"
              href="#parceiros"
            >
              <span>Seja um Pet Shop Parceiro</span>
              <span className="text-[#00B298]">↗</span>
            </a>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            aria-label="DrVets — Telemedicina Veterinária"
            className="group flex shrink-0 items-center gap-3 focus:outline-none"
            href="/"
          >
            <Image
              alt="DrVets Tele Veterinária Logo"
              className="h-12 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02] md:h-14"
              height={200}
              priority
              quality={95}
              referrerPolicy="no-referrer"
              sizes="240px"
              src="/home/drvets-logo.png"
              width={300}
            />
          </Link>

          <nav
            aria-label="Navegação pública"
            className="hidden items-center gap-1 text-sm font-medium text-slate-700 lg:flex"
          >
            <a
              className="flex items-center gap-1.5 rounded-full bg-[#F0F8FB] px-3.5 py-2 font-bold text-[#0B68C2] transition"
              href="#inicio"
            >
              Início
            </a>
            {publicNavItems.map((item) => (
              <a
                className="flex items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-slate-50 hover:text-[#0B68C2]"
                href={item.href}
                key={item.href}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-[#25C5DC]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#153B50]">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 xl:flex">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                ✓
              </span>
              <span>CRMV 100% Verificado</span>
            </div>

            <Link
              className="flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-[#153B50] transition hover:text-[#0B68C2]"
              href="/login"
            >
              <svg
                aria-hidden="true"
                className="h-[18px] w-[18px] text-slate-500"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="M20 21a8 8 0 10-16 0" />
                <circle cx="12" cy="8" r="4" />
              </svg>
              <span className="hidden sm:inline">Área do Tutor</span>
            </Link>

            <a
              className="flex items-center gap-2 rounded-full bg-[linear-gradient(92deg,#0A63BA_0%,#0690B4_45%,#0EB485_100%)] px-4 py-2.5 text-xs font-bold tracking-wide text-white shadow-[0_15px_35px_-5px_rgba(19,168,138,0.35)] transition duration-200 hover:bg-[linear-gradient(92deg,#0855A0_0%,#057E9E_45%,#0B9C73_100%)] hover:shadow-[0_8px_25px_-4px_rgba(11,104,194,0.4)] sm:px-5 sm:text-sm"
              href="#triage-box"
            >
              <svg
                aria-hidden="true"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.9"
                viewBox="0 0 24 24"
              >
                <rect height="12" rx="2" width="14" x="2" y="6" />
                <path d="M16 10l6-3v10l-6-3z" />
              </svg>
              <span>Encontrar veterinário</span>
              <span aria-hidden="true" className="text-base font-bold">
                →
              </span>
            </a>

            <button
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-[#153B50] lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              type="button"
            >
              <span aria-hidden="true" className="text-lg font-bold">
                {mobileOpen ? '×' : '☰'}
              </span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav
            aria-label="Navegação pública móvel"
            className="grid gap-1 border-t border-slate-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 lg:hidden"
          >
            <a
              className="rounded-xl bg-[#F0F8FB] px-3 py-2 text-[#0B68C2]"
              href="#inicio"
              onClick={() => setMobileOpen(false)}
            >
              Início
            </a>
            {publicNavItems.map((item) => (
              <a
                className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50"
                href={item.href}
                key={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-[#25C5DC]/20 px-2 py-0.5 text-[10px] font-bold text-[#153B50]">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </nav>
        )}
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
