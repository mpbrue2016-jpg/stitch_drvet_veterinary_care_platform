import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, getSupabasePublicConfig } from '@/lib/supabase/config';
import type { Database } from '@/types/database';

const protectedPaths = [
  '/agenda',
  '/agendamento',
  '/carteira/vacinas',
  '/exames',
  '/prontuarios',
  '/receitas',
  '/comissoes',
  '/senha/nova',
];

export async function middleware(request: NextRequest) {
  const isProtectedPath = protectedPaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (!isProtectedPath) return NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('setup', 'required');
    return NextResponse.redirect(loginUrl);
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
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) =>
      redirect.cookies.set(cookie),
    );
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    '/agenda/:path*',
    '/agendamento/:path*',
    '/carteira/vacinas/:path*',
    '/exames/:path*',
    '/prontuarios/:path*',
    '/receitas/:path*',
    '/comissoes/:path*',
    '/senha/nova',
  ],
};
