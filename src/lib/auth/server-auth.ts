import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { createSupabaseServerClient } from '@/lib/supabase/server';
import { isEmailConfirmedUser } from './guards';

export type ServerAuthResult =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

export async function requireConfirmedApiUser(
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<ServerAuthResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Autenticação necessária.' },
        { status: 401 },
      ),
    };
  }

  if (!isEmailConfirmedUser(authData.user)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Confirme seu e-mail pelo link enviado antes de acessar esta funcionalidade.',
          code: 'EMAIL_NOT_CONFIRMED',
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: authData.user };
}
