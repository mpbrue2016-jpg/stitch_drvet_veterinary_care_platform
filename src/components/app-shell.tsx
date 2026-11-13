'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const navigation = [
  { href: '/', label: 'Início / Dashboard', icon: 'dashboard' },
  { href: '/agenda', label: 'Agenda & Consultas', icon: 'calendar' },
  { href: '/agendamento', label: 'Agendamentos', icon: 'event' },
  { href: '/carteira/vacinas', label: 'Carteira de vacinas', icon: 'health' },
  { href: '/exames', label: 'Exames', icon: 'document' },
  { href: '/receitas', label: 'Rascunhos de receita', icon: 'document' },
  { href: '/comissoes', label: 'Faturamento & Repasses', icon: 'payments' },
] as const;

const navigationIconPaths = {
  dashboard: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zm0 7h8v11h-8V10zM3 13h8v8H3v-8z',
  calendar: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm2 8h4v4H7v-4z',
  event: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm4 9 2 2 4-4',
  health: 'M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13',
  document: 'M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5m-10 4h6m-6 4h6',
  payments: 'M3 6h18v13H3V6zm0 4h18M7 3h10M7 14h4',
} as const;

function NavigationIcon({ name }: { name: keyof typeof navigationIconPaths }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
      <path d={navigationIconPaths[name]} />
    </svg>
  );
}

function isActiveRoute(pathname: string, href: string) {
  return href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function PawMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-[#006b57] text-white ${small ? 'h-9 w-9' : 'h-10 w-10'}`}>
      <svg aria-hidden="true" className={small ? 'h-5 w-5' : 'h-6 w-6'} fill="currentColor" viewBox="0 0 24 24">
        <ellipse cx="12" cy="16.5" rx="5.3" ry="4.3" />
        <ellipse cx="5.5" cy="10" rx="2.1" ry="2.8" transform="rotate(-20 5.5 10)" />
        <ellipse cx="10" cy="6.8" rx="2.1" ry="2.8" transform="rotate(-7 10 6.8)" />
        <ellipse cx="14.5" cy="6.8" rx="2.1" ry="2.8" transform="rotate(7 14.5 6.8)" />
        <ellipse cx="18.5" cy="10" rx="2.1" ry="2.8" transform="rotate(20 18.5 10)" />
      </svg>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  const isPublicHome = pathname === '/';
  const isAuthPage = pathname === '/login' || pathname === '/senha/nova';
  const pageTitle = navigation.find((item) => isActiveRoute(pathname, item.href))?.label ?? 'DrVet';

  async function signOut() {
    setAuthError('');
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.',
      );
    }
  }

  return (
    <div className={`${isPublicHome || isAuthPage ? 'min-h-screen' : 'min-h-screen lg:flex'} bg-[#f6faff]`}>
      {!isPublicHome && !isAuthPage && (
        <aside className="hidden w-72 shrink-0 flex-col justify-between bg-[#ebf5ff] lg:flex">
          <div>
            <Link aria-label="DrVet — início" className="flex h-20 items-center gap-3 px-5" href="/">
              <PawMark />
              <span className="min-w-0">
                <span className="block text-lg font-bold tracking-tight text-[#006b57]">DrVet</span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Telemedicina Clínica</span>
              </span>
              <span className="ml-auto rounded-full bg-[#c7e7ff] px-2 py-0.5 text-[10px] font-bold uppercase text-[#274a60]">Pro</span>
            </Link>
            <nav aria-label="Navegação principal" className="grid gap-1 px-3 py-4">
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Prática médica</p>
              {navigation.slice(0, 6).map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? 'bg-[#13a88a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#d4ebff]'}`}
                    href={item.href}
                    key={item.href}
                  >
                    <NavigationIcon name={item.icon} />
                    <span>{item.label}</span>
                    {item.href === '/agenda' && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#d4ebff] text-[#006b57]'}`}>Hoje</span>}
                  </Link>
                );
              })}
              <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Gestão &amp; sistema</p>
              {navigation.slice(6).map((item) => (
                <Link
                  aria-current={isActiveRoute(pathname, item.href) ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActiveRoute(pathname, item.href) ? 'bg-[#13a88a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#d4ebff]'}`}
                  href={item.href}
                  key={item.href}
                >
                  <NavigationIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="m-3 rounded-2xl bg-[#dff0ff] p-4 text-xs leading-5 text-slate-700">
            <span className="font-bold text-[#006b57]">Ambiente de demonstração</span>
            <p className="mt-1">Conecte uma conta autorizada para acessar os dados clínicos.</p>
          </div>
        </aside>
      )}

      <div className={`flex min-h-screen min-w-0 flex-1 flex-col ${isPublicHome ? '' : ''}`}>
        {isAuthPage ? null : isPublicHome ? (
          <>
            <div className="bg-gradient-to-r from-[#153b50] via-[#0c2d48] to-[#153b50] px-4 py-2 text-center text-xs font-medium text-white sm:text-left">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-between">
                <span><span className="font-bold text-[#35c6b0]">CUIDADO VETERINÁRIO:</span> informação e acompanhamento para a saúde do seu pet.</span>
                <span className="hidden text-slate-200 sm:inline">Atendimento sujeito à disponibilidade profissional.</span>
              </div>
            </div>
            <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
              <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
                <Link aria-label="DrVet — início" className="flex shrink-0 items-center gap-3" href="/">
                  <PawMark />
                  <span>
                    <span className="block text-lg font-bold tracking-tight text-[#006b57]">DrVet</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-600">Telemedicina</span>
                  </span>
                </Link>
                <nav aria-label="Navegação pública" className="hidden items-center gap-1 xl:flex">
                  <a className="rounded-full bg-[#ebf5ff] px-4 py-2 text-sm font-semibold text-[#006b57]" href="#inicio">Início</a>
                  <a className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="#especialidades">Especialidades</a>
                  <a className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="#como-funciona">Como funciona</a>
                  <Link className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/agendamento">Agendamentos</Link>
                </nav>
                <div className="flex items-center gap-2">
                  <Link className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#153b50] hover:bg-slate-50 sm:inline-flex" href="/agenda">Área profissional</Link>
                  <Link className="rounded-full bg-gradient-to-r from-[#0a63ba] via-[#0690b4] to-[#0eb485] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] sm:px-5 sm:text-sm" href="/agendamento">
                    Conheça o DrVet <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </header>
          </>
        ) : (
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-20 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  aria-expanded={menuOpen}
                  aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-brand-navy lg:hidden"
                  onClick={() => setMenuOpen((open) => !open)}
                  type="button"
                >
                  <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
                </button>
                <Link aria-label="DrVet — início" className="flex items-center gap-2 lg:hidden" href="/">
                  <PawMark small />
                  <span className="font-extrabold tracking-tight text-brand-navy">DrVet</span>
                </Link>
                <div className="hidden lg:block">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">DrVet · Prática médica</p>
                  <p className="text-lg font-bold text-brand-ink">{pageTitle}</p>
                </div>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                <span className="rounded-full bg-[#dff0ff] px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {isSupabaseConfigured() ? 'Sessão autenticada' : 'Acesso de demonstração'}
                </span>
                <span className="hidden text-sm font-medium text-brand-muted xl:block">Telemedicina clínica</span>
                {isSupabaseConfigured() && (
                  <button
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void signOut()}
                    type="button"
                  >
                    Sair
                  </button>
                )}
              </div>
            </div>
            {authError && (
              <p className="px-4 pb-2 text-right text-xs text-red-700 sm:px-6" role="alert">
                {authError}
              </p>
            )}
            {menuOpen && (
              <nav aria-label="Navegação móvel" className="grid gap-1 border-t border-slate-100 bg-[#ebf5ff] p-3 lg:hidden">
                {navigation.map((item) => {
                  const active = isActiveRoute(pathname, item.href);
                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${active ? 'bg-[#13a88a] text-white' : 'text-slate-700 hover:bg-white'}`}
                      href={item.href}
                      key={item.href}
                      onClick={() => setMenuOpen(false)}
                    >
                      <NavigationIcon name={item.icon} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </header>
        )}
        {isAuthPage ? (
          children
        ) : (
          <main className={`w-full flex-1 ${isPublicHome ? '' : 'px-4 py-6 sm:px-6 sm:py-8 lg:px-8'}`}>{children}</main>
        )}
        {!isPublicHome && !isAuthPage && (
          <footer className="hidden border-t border-slate-200 bg-white px-8 py-4 text-center text-xs text-brand-muted lg:block">
            DrVet · Ambiente de demonstração
          </footer>
        )}
      </div>
    </div>
  );
}
