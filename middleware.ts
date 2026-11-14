import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig, isSupabaseConfigured } from '@/lib/supabase/config';
import type { Database } from '@/types/database';

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
  '/senha/nova',
];

const professionalOnlyPaths = [
  '/agenda',
  '/receitas',
  '/comissoes',
  '/painel/veterinario',
  '/painel/parceiro',
];
const adminOnlyPaths = ['/admin'];

export async function middleware(request: NextRequest) {
  const isProtectedPath = protectedPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
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
  if (error || !data.user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) =>
      redirect.cookies.set(cookie),
    );
    return redirect;
  }

  const requiresProfessionalRole = professionalOnlyPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (requiresProfessionalRole) {
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle(),
      supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', data.user.id)
        .limit(1),
    ]);

    const role = profile?.role ?? 'tutor';
    const hasOrgMembership = (memberships?.length ?? 0) > 0;
    const isAllowed =
      role === 'admin' ||
      role === 'veterinarian' ||
      role === 'partner' ||
      hasOrgMembership;

    if (!isAllowed) {
      const restrictedUrl = request.nextUrl.clone();
      restrictedUrl.pathname = '/agendamento';
      restrictedUrl.searchParams.set('denied', 'role');
      const redirect = NextResponse.redirect(restrictedUrl);
      response.cookies.getAll().forEach((cookie) =>
        redirect.cookies.set(cookie),
      );
      return redirect;
    }
  }

  const requiresAdminRole = adminOnlyPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (requiresAdminRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      const restrictedUrl = request.nextUrl.clone();
      restrictedUrl.pathname = '/agendamento';
      restrictedUrl.searchParams.set('denied', 'admin');
      const redirect = NextResponse.redirect(restrictedUrl);
      response.cookies.getAll().forEach((cookie) =>
        redirect.cookies.set(cookie),
      );
      return redirect;
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
    '/senha/nova',
  ],
};
