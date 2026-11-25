'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  APP_NAVIGATION,
  getAuthorizedNavItems,
  getRoleLabel,
  type AppNavItem,
  type NavIconName,
  type NavSection,
  type UserAuthContext,
} from '@/lib/auth/guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  buscarContextoAcessoAtual,
  observarMudancaAutenticacao,
  sairDaConta,
} from '@/services/auth.service';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Footer } from '@/components/footer';
import { PawMark, PublicHeader, WorkspaceHeader } from '@/components/header';

const navigationIconPaths: Record<NavIconName, string> = {
  dashboard: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zm0 7h8v11h-8V10zM3 13h8v8H3v-8z',
  calendar: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm2 8h4v4H7v-4z',
  event: 'M7 2v3m10-3v3M4 8h16M5 4h14a2 2 0 012 2v13H3V6a2 2 0 012-2zm4 9 2 2 4-4',
  health: 'M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13',
  document: 'M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5m-10 4h6m-6 4h6',
  payments: 'M3 6h18v13H3V6zm0 4h18M7 3h10M7 14h4',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
};

const sectionTitles: { key: NavSection; title: string }[] = [
  { key: 'patient', title: 'Tutor & Paciente' },
  { key: 'clinical', title: 'Prática Clínica & Repasses' },
  { key: 'partner', title: 'Parceiros & Anúncios' },
  { key: 'admin', title: 'Administração' },
  { key: 'account', title: 'Conta & Institucional' },
];

const DEFAULT_SAFE_CONTEXT: UserAuthContext = {
  role: 'tutor',
  organizationRoles: [],
};

function NavigationIcon({ name }: { name: NavIconName }) {
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
  const [accessContext, setAccessContext] =
    useState<UserAuthContext>(DEFAULT_SAFE_CONTEXT);
  const [hasLoadedContext, setHasLoadedContext] = useState(false);

  const isPublicHome = pathname === '/';
  const isPublicRoute =
    isPublicHome ||
    pathname === '/cadastro' ||
    pathname === '/apresentacao' ||
    pathname.startsWith('/receitas/verificar');
  const isAuthPage = pathname === '/login' || pathname === '/senha/nova';

  const pageTitle =
    APP_NAVIGATION.find((item) => isActiveRoute(pathname, item.href))?.label ??
    'DrVet';

  const visibleNavigation = useMemo(
    () => getAuthorizedNavItems(accessContext),
    [accessContext],
  );

  const groupedNavigation = useMemo(() => {
    const groups = new Map<NavSection, AppNavItem[]>();
    for (const section of sectionTitles) {
      groups.set(section.key, []);
    }
    for (const item of visibleNavigation) {
      groups.get(item.section)?.push(item);
    }
    return sectionTitles
      .map((section) => ({
        ...section,
        items: groups.get(section.key) ?? [],
      }))
      .filter((section) => section.items.length > 0);
  }, [visibleNavigation]);

  useEffect(() => {
    if (!isSupabaseConfigured() || isAuthPage) return;
    let active = true;

    async function syncContext() {
      const ctx = await buscarContextoAcessoAtual();
      if (!active) return;
      if (ctx.authenticated && ctx.emailConfirmed) {
        setAccessContext({
          role: ctx.role,
          organizationRoles: ctx.organizationRoles,
        });
      } else {
        setAccessContext(DEFAULT_SAFE_CONTEXT);
      }
      setHasLoadedContext(true);
    }

    void syncContext();

    if (isPublicRoute) {
      return () => {
        active = false;
      };
    }

    const unsubscribe = observarMudancaAutenticacao((authenticated) => {
      if (!authenticated) {
        setAccessContext(DEFAULT_SAFE_CONTEXT);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      } else {
        void syncContext();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isAuthPage, isPublicRoute, pathname, router]);

  async function signOut() {
    setAuthError('');
    if (!isSupabaseConfigured()) {
      router.replace('/login');
      return;
    }
    try {
      await sairDaConta();
      setAccessContext(DEFAULT_SAFE_CONTEXT);
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.',
      );
    }
  }

  const roleBadgeLabel = hasLoadedContext
    ? getRoleLabel(accessContext.role)
    : undefined;

  return (
    <div
      className={`${isPublicHome || isAuthPage ? 'min-h-screen' : 'min-h-screen lg:flex'} bg-[#f6faff] print:block print:min-h-0 print:bg-white`}
    >
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#153b50] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg print:hidden"
        href="#main-content"
      >
        Ir para o conteúdo principal
      </a>
      {!isPublicHome && !isAuthPage && (
        <aside className="hidden w-72 shrink-0 flex-col justify-between bg-[#ebf5ff] lg:flex print:hidden">
          <div>
            <Link
              aria-label="DrVet — início"
              className="flex h-20 items-center gap-3 px-5"
              href="/"
            >
              <PawMark />
              <span className="min-w-0">
                <span className="block text-lg font-bold tracking-tight text-[#006b57]">
                  DrVet
                </span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Telemedicina Clínica
                </span>
              </span>
              <span className="ml-auto rounded-full bg-[#c7e7ff] px-2 py-0.5 text-[10px] font-bold uppercase text-[#274a60]">
                {roleBadgeLabel ?? 'Tutor'}
              </span>
            </Link>
            <nav aria-label="Navegação principal" className="grid gap-1 px-3 py-4">
              {groupedNavigation.map((section, sectionIdx) => (
                <div className={sectionIdx > 0 ? 'pt-5' : ''} key={section.key}>
                  <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
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
                        {item.badge && (
                          <span
                            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#d4ebff] text-[#006b57]'}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
          <div className="m-3 rounded-2xl bg-[#dff0ff] p-4 text-xs leading-5 text-slate-700">
            <span className="font-bold text-[#006b57]">
              {isSupabaseConfigured()
                ? `Acesso: ${roleBadgeLabel ?? 'Tutor'}`
                : 'Ambiente de demonstração'}
            </span>
            <p className="mt-1">
              {isSupabaseConfigured()
                ? 'Menus e permissões ajustados automaticamente conforme o seu perfil.'
                : 'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em .env.local.'}
            </p>
          </div>
        </aside>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col print:block print:min-h-0">
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
                  className="grid gap-1 border-t border-slate-100 bg-[#ebf5ff] p-3 lg:hidden print:hidden"
                >
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
              ) : null
            }
            onSignOut={() => void signOut()}
            onToggleMenu={() => setMenuOpen((open) => !open)}
            pageTitle={pageTitle}
            roleLabel={roleBadgeLabel}
          />
        )}
        {isAuthPage ? (
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        ) : (
          <main
            className={`w-full flex-1 outline-none ${isPublicHome ? '' : 'px-4 py-6 sm:px-6 sm:py-8 lg:px-8'} print:p-0`}
            id="main-content"
            tabIndex={-1}
          >
            {!isPublicHome && <Breadcrumbs />}
            {children}
          </main>
        )}
        {!isPublicHome && !isAuthPage && <Footer />}
      </div>
    </div>
  );
}
