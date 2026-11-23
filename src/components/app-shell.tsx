'use client';

import Link from 'next/link';
<<<<<<< HEAD
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
=======
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
>>>>>>> origin/main
import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { observarMudancaAutenticacao, sairDaConta } from '@/services/auth.service';
import { Footer } from '@/components/footer';
import { PawMark, PublicHeader, WorkspaceHeader } from '@/components/header';

const navigation = [
  { href: '/', label: 'Início / Dashboard', icon: 'dashboard' },
  { href: '/painel/veterinario', label: 'Painel Veterinário', icon: 'dashboard' },
  { href: '/agenda', label: 'Agenda & Consultas', icon: 'calendar' },
  { href: '/agendamento', label: 'Agendamentos', icon: 'event' },
  { href: '/notificacoes', label: 'Notificações & Push', icon: 'bell' },
  { href: '/teleconsulta', label: 'Sala de Teleconsulta', icon: 'event' },
  { href: '/pets', label: 'Meus Pets', icon: 'health' },
  { href: '/prontuarios', label: 'Prontuários SOAP', icon: 'document' },
  { href: '/carteira/vacinas', label: 'Carteira de vacinas', icon: 'health' },
  { href: '/exames', label: 'Exames', icon: 'document' },
  { href: '/receitas', label: 'Rascunhos de receita', icon: 'document' },
  { href: '/assinaturas', label: 'Clube DrVet', icon: 'health' },
  { href: '/pagamentos', label: 'Pagamentos & Checkout', icon: 'payments' },
  { href: '/painel/parceiro', label: 'Painel Parceiro B2B', icon: 'dashboard' },
  { href: '/parceiros', label: 'Parceiros B2B', icon: 'dashboard' },
  { href: '/anuncios', label: 'DrVet Ads', icon: 'dashboard' },
  { href: '/comissoes', label: 'Faturamento & Repasses', icon: 'payments' },
  { href: '/painel', label: 'Central & OFX', icon: 'document' },
  { href: '/cadastro', label: 'Cadastro QR', icon: 'health' },
  { href: '/apresentacao', label: 'Apresentação', icon: 'dashboard' },
  { href: '/admin/integracoes', label: 'Integrações & CDC', icon: 'dashboard' },
  { href: '/admin', label: 'Admin Master', icon: 'dashboard' },
  { href: '/perfil', label: 'Meu Perfil', icon: 'dashboard' },
] as const;

const navigationIconPaths = {
  dashboard: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zm0 7h8v11h-8V10zM3 13h8v8H3v-8z',
  calendar: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm2 8h4v4H7v-4z',
  event: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm4 9 2 2 4-4',
  health: 'M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13',
  document: 'M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5m-10 4h6m-6 4h6',
  payments: 'M3 6h18v13H3V6zm0 4h18M7 3h10M7 14h4',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
} as const;

function NavigationIcon({ name }: { name: keyof typeof navigationIconPaths }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d={navigationIconPaths[name]} />
    </svg>
  );
}

function isActiveRoute(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  const exactOnlyRoutes = ['/painel', '/admin'];
  if (exactOnlyRoutes.includes(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userRole, setUserRole] = useState<'tutor' | 'veterinarian' | 'admin' | 'staff'>('tutor');
  const isPublicHome = pathname === '/';
  const isPublicRoute =
    isPublicHome ||
    pathname === '/cadastro' ||
    pathname === '/apresentacao';
  const isAuthPage = pathname === '/login' || pathname === '/senha/nova';
  const pageTitle =
    navigation.find((item) => isActiveRoute(pathname, item.href))?.label ?? 'DrVet';

  useEffect(() => {
    if (!isSupabaseConfigured() || isPublicRoute || isAuthPage) return;
    return observarMudancaAutenticacao((authenticated) => {
      if (!authenticated) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });
  }, [isAuthPage, isPublicRoute, pathname, router]);

  async function signOut() {
    setAuthError('');
    if (!isSupabaseConfigured()) {
      router.replace('/login');
      return;
    }
    try {
      await sairDaConta();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.',
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadUserRole() {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        if (!cancelled) setUserRole('tutor');
        return;
      }

      const [membershipsResult, veterinarianResult] = await Promise.all([
        supabase
          .from('organization_memberships')
          .select('organization_id, role')
          .eq('user_id', data.user!.id)
          .order('organization_id', { ascending: true }),
        supabase
          .from('veterinarian_profiles')
          .select('organization_id, status')
          .eq('user_id', data.user!.id)
          .eq('status', 'approved')
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const memberships = membershipsResult.data ?? [];
      const isAdmin = memberships.some(
        (membership) =>
          membership.role === 'owner' || membership.role === 'admin',
      );
      const isVeterinarian =
        memberships.some(
          (membership) => membership.role === 'veterinarian',
        ) && Boolean(veterinarianResult.data);

      if (isAdmin) {
        setUserRole('admin');
        return;
      }

      if (isVeterinarian) {
        setUserRole('veterinarian');
        return;
      }

      if (memberships.length > 0) {
        setUserRole('staff');
        return;
      }

      setUserRole('tutor');
    }

    void loadUserRole();

    return () => {
      cancelled = true;
    };
  }, []);

  function isNavItemVisible(item: { href: string }) {
    switch (userRole) {
      case 'admin':
        return true;
      case 'veterinarian':
        return (
          item.href === '/' ||
          item.href === '/agenda' ||
          item.href === '/agendamento' ||
          item.href === '/carteira/vacinas' ||
          item.href === '/exames' ||
          item.href === '/receitas'
        );
      case 'tutor':
        return (
          item.href === '/' ||
          item.href === '/agendamento' ||
          item.href === '/carteira/vacinas'
        );
      case 'staff':
        return item.href === '/' || item.href === '/agendamento';
      default:
        return item.href === '/' || item.href === '/agendamento';
    }
  }

  const visibleNavigation = navigation.filter((item) => isNavItemVisible(item));

  return (
    <div className={`${isPublicHome || isAuthPage ? 'min-h-screen' : 'min-h-screen lg:flex'} bg-[#f6faff]`}>
      {!isPublicHome && !isAuthPage && (
        <aside className="hidden w-72 shrink-0 flex-col justify-between bg-[#ebf5ff] lg:flex">
          <div>
            <Link aria-label="DrVet — início" className="flex h-20 items-center gap-3 px-5" href="/">
              <PawMark />
              <span className="min-w-0">
                <span className="block text-lg font-bold tracking-tight text-[#006b57]">DrVet</span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Telemedicina Clínica
                </span>
              </span>
              <span className="ml-auto rounded-full bg-[#c7e7ff] px-2 py-0.5 text-[10px] font-bold uppercase text-[#274a60]">
                Pro
              </span>
            </Link>
            <nav aria-label="Navegação principal" className="grid gap-1 px-3 py-4">
<<<<<<< HEAD
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Prática médica</p>
              {visibleNavigation.slice(0, 6).map((item) => {
=======
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                Prática médica
              </p>
              {navigation.slice(0, 10).map((item) => {
>>>>>>> origin/main
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
                    {item.href === '/agenda' && (
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#d4ebff] text-[#006b57]'}`}
                      >
                        Hoje
                      </span>
                    )}
                  </Link>
                );
              })}
              <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                Gestão &amp; sistema
              </p>
              {navigation.slice(10).map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? 'bg-[#13a88a] text-white shadow-sm' : 'text-slate-700 hover:bg-[#d4ebff]'}`}
                    href={item.href}
                    key={item.href}
                  >
                    <NavigationIcon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
<<<<<<< HEAD
              <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Gestão &amp; sistema</p>
              {visibleNavigation.slice(6).map((item) => (
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
=======
>>>>>>> origin/main
            </nav>
          </div>
          <div className="m-3 rounded-2xl bg-[#dff0ff] p-4 text-xs leading-5 text-slate-700">
            <span className="font-bold text-[#006b57]">
              {isSupabaseConfigured() ? 'Supabase conectado' : 'Ambiente de demonstração'}
            </span>
            <p className="mt-1">
              {isSupabaseConfigured()
                ? 'Conecte uma conta autorizada para acessar os dados clínicos.'
                : 'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local.'}
            </p>
          </div>
        </aside>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {isAuthPage ? null : isPublicHome ? (
          <PublicHeader />
        ) : (
          <WorkspaceHeader
            authError={authError}
            menuOpen={menuOpen}
            mobileNav={
              menuOpen ? (
                <nav
                  aria-label="Navegação móvel"
                  className="grid gap-1 border-t border-slate-100 bg-[#ebf5ff] p-3 lg:hidden"
                >
<<<<<<< HEAD
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
                {visibleNavigation.map((item) => {
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
=======
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
              ) : null
            }
            onSignOut={() => void signOut()}
            onToggleMenu={() => setMenuOpen((open) => !open)}
            pageTitle={pageTitle}
          />
>>>>>>> origin/main
        )}
        {isAuthPage ? (
          children
        ) : (
          <main className={`w-full flex-1 ${isPublicHome ? '' : 'px-4 py-6 sm:px-6 sm:py-8 lg:px-8'}`}>
            {children}
          </main>
        )}
        {!isPublicHome && !isAuthPage && <Footer />}
      </div>
    </div>
  );
}
