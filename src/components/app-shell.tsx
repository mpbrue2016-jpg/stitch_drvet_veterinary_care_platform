'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';

const navigation = [
  { href: '/', label: 'Início', icon: '⌂' },
  { href: '/agendamento', label: 'Agendamentos', icon: '＋' },
  { href: '/agenda', label: 'Agenda', icon: '▦' },
  { href: '/receitas', label: 'Receitas', icon: '▤' },
  { href: '/comissoes', label: 'Comissões', icon: 'R$' },
];

function isActiveRoute(pathname: string, href: string) {
  return href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageTitle = navigation.find((item) => isActiveRoute(pathname, item.href))?.label ?? 'DrVet';

  return (
    <div className="min-h-screen bg-brand-floor lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <Link aria-label="DrVet — início" className="flex h-20 items-center gap-3 border-b border-slate-100 px-6" href="/">
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-brand-green text-2xl font-semibold text-white">+</span>
          <span className="text-lg font-extrabold tracking-tight text-brand-navy">DrVet</span>
        </Link>
        <nav aria-label="Navegação principal" className="grid gap-1 p-4">
          <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-brand-muted">Menu principal</p>
          {navigation.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? 'bg-brand-ice text-brand-navy' : 'text-slate-600 hover:bg-slate-50 hover:text-brand-navy'}`}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true" className="grid h-6 w-6 place-items-center text-base font-bold text-brand-green">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-100 p-5 text-xs leading-5 text-brand-muted">
          Plataforma em desenvolvimento
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
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
                <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-green text-xl font-semibold text-white">+</span>
                <span className="font-extrabold tracking-tight text-brand-navy">DrVet</span>
              </Link>
              <div className="hidden lg:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">DrVet</p>
                <p className="text-lg font-bold text-brand-ink">{pageTitle}</p>
              </div>
            </div>
            <div className="hidden text-sm font-medium text-brand-muted sm:block">Cuidado veterinário conectado</div>
          </div>
          {menuOpen && (
            <nav aria-label="Navegação móvel" className="grid gap-1 border-t border-slate-100 p-3 lg:hidden">
              {navigation.map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${active ? 'bg-brand-ice text-brand-navy' : 'text-slate-600 hover:bg-slate-50'}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span aria-hidden="true" className="grid h-6 w-6 place-items-center text-base font-bold text-brand-green">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>
        <main className="w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
        <footer className="hidden border-t border-slate-200 bg-white px-8 py-4 text-center text-xs text-brand-muted lg:block">
          DrVet · Plataforma em desenvolvimento
        </footer>
      </div>
    </div>
  );
}
