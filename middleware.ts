import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  getRouteAccessDenial,
  isEmailConfirmedUser,
  normalizeUserRole,
  sanitizeNextPath,
} from '@/lib/auth/guards';
import { getSupabasePublicConfig, isSupabaseConfigured } from '@/lib/supabase/config';
import { isSchemaMissingError } from '@/services/errors';
import type { Database, OrganizationRole } from '@/types/database';

const protectedPaths = [
  '/agenda',
  '/agendamento',
  '/teleconsulta',
  '/pets',
  '/perfil',
  '/assinaturas',
  '/pagamentos',
  '/parceiros',
  '/anuncios',
  '/admin',
  '/carteira/vacinas',
  '/exames',
  '/prontuarios',
  '/receitas',
  '/comissoes',
  '/painel',
  '/notificacoes',
  '/senha/nova',
];

const publicBypassPaths = ['/receitas/verificar'];

const roleCheckedPaths = [
  '/agenda',
  '/receitas',
  '/comissoes',
  '/parceiros',
  '/anuncios',
  '/painel',
  '/admin',
];

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPublicBypass = publicBypassPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (isPublicBypass) return NextResponse.next({ request });

  const isProtectedPath = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!isProtectedPath) return NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = '/login';
    setupUrl.searchParams.set('setup', 'required');
    return NextResponse.redirect(setupUrl);
  }

  const { url, key } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database, 'public'>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const nextTarget = sanitizeNextPath(
    `${pathname}${request.nextUrl.search}`,
    '/agendamento',
  );

  if (error || !data.user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', nextTarget);
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (!isEmailConfirmedUser(data.user)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('error', 'unconfirmed');
    loginUrl.searchParams.set('next', nextTarget);
    if (data.user.email) {
      loginUrl.searchParams.set('email', data.user.email);
    }
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  const requiresRoleCheck = roleCheckedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (requiresRoleCheck) {
    const [
      { data: profile, error: profileError },
      { data: memberships, error: membershipError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle(),
      supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', data.user.id),
    ]);

    if (isSchemaMissingError(profileError) || isSchemaMissingError(membershipError)) {
      const restrictedUrl = request.nextUrl.clone();
      restrictedUrl.pathname = '/agendamento';
      restrictedUrl.search = '?denied=schema';
      return copyCookies(response, NextResponse.redirect(restrictedUrl));
    }

    const role = normalizeUserRole(profile?.role);
    const organizationRoles = (memberships ?? []).map(
      (item) => item.role,
    ) as OrganizationRole[];

    const denial = getRouteAccessDenial(pathname, { role, organizationRoles });
    if (denial) {
      const restrictedUrl = request.nextUrl.clone();
      restrictedUrl.pathname = '/agendamento';
      restrictedUrl.search = '';
      restrictedUrl.searchParams.set('denied', denial);
      return copyCookies(response, NextResponse.redirect(restrictedUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/agenda/:path*',
    '/agendamento/:path*',
    '/teleconsulta/:path*',
    '/pets/:path*',
    '/perfil/:path*',
    '/assinaturas/:path*',
    '/pagamentos/:path*',
    '/parceiros/:path*',
    '/anuncios/:path*',
    '/admin/:path*',
    '/carteira/vacinas/:path*',
    '/exames/:path*',
    '/prontuarios/:path*',
    '/receitas/:path*',
    '/comissoes/:path*',
    '/painel/:path*',
    '/notificacoes/:path*',
    '/senha/nova',
  ],
};
