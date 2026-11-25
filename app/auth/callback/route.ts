import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isEmailConfirmedUser, sanitizeNextPath } from '@/lib/auth/guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'recovery',
  'invite',
  'magiclink',
  'email_change',
  'email',
]);

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/login?setup=required', request.url));
  }

  const upstreamError = request.nextUrl.searchParams.get('error');
  if (upstreamError) {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const otpTypeParam = request.nextUrl.searchParams.get('type');
  const nextPath = sanitizeNextPath(
    request.nextUrl.searchParams.get('next'),
    '/agendamento',
  );

  const supabase = createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=callback', request.url));
    }
  } else if (
    tokenHash &&
    otpTypeParam &&
    ALLOWED_OTP_TYPES.has(otpTypeParam as EmailOtpType)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpTypeParam as EmailOtpType,
    });
    if (error) {
      return NextResponse.redirect(new URL('/login?error=callback', request.url));
    }
  } else {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  if (!isEmailConfirmedUser(userData.user)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'unconfirmed');
    loginUrl.searchParams.set('next', nextPath);
    if (userData.user.email) {
      loginUrl.searchParams.set('email', userData.user.email);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
