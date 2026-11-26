import {
  isEmailConfirmedUser,
  normalizeUserRole,
  type UserAuthContext,
} from '@/lib/auth/guards';
import { clearVetOfflineCache } from '@/lib/offline/vet-indexeddb';
import { getSupabaseClient } from '@/lib/supabase';
import type { OrganizationRole } from '@/types/database';
import type { UserProfile } from '@/types/entities';
import { isSchemaMissingError, toFriendlyError } from './errors';

function mapAuthError(error: unknown, fallback: string): Error {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return new Error('E-mail ou senha incorretos.');
  }
  if (lower.includes('email not confirmed')) {
    return new Error('Confirme seu e-mail pelo link enviado antes de entrar.');
  }
  if (lower.includes('user already registered')) {
    return new Error('Este e-mail já está cadastrado no DrVet.');
  }
  if (lower.includes('password should be at least')) {
    return new Error('A senha deve ter pelo menos 8 caracteres.');
  }
  if (lower.includes('auth session missing')) {
    return new Error(
      'Sessão de redefinição ausente ou expirada. Solicite um novo link de recuperação.',
    );
  }
  if (lower.includes('rate limit')) {
    return new Error('Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.');
  }

  return toFriendlyError(error, fallback);
}

export async function entrarComEmailSenha(input: {
  email: string;
  password: string;
}) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) throw error;
    if (!isEmailConfirmedUser(data.user)) {
      await supabase.auth.signOut().catch(() => null);
      throw new Error('Confirme seu e-mail pelo link enviado antes de entrar.');
    }
    return data;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível entrar na sua conta.');
  }
}

export async function cadastrarUsuario(input: {
  email: string;
  password: string;
  displayName: string;
  emailRedirectTo?: string;
}) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName },
        emailRedirectTo: input.emailRedirectTo,
      },
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível concluir seu cadastro.');
  }
}

export async function reenviarConfirmacaoEmail(
  email: string,
  emailRedirectTo: string,
) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo,
      },
    });
    if (error) throw error;
  } catch (error) {
    throw mapAuthError(
      error,
      'Não foi possível reenviar o e-mail de confirmação.',
    );
  }
}

export async function enviarRecuperacaoSenha(email: string, redirectTo: string) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível enviar o e-mail de recuperação.');
  }
}

export async function atualizarSenha(password: string) {
  try {
    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error(
        'Sessão de recuperação inválida ou expirada. Solicite um novo link em Entrar.',
      );
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível atualizar a senha.');
  }
}

export async function sairDaConta() {
  try {
    await clearVetOfflineCache().catch(() => null);
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_OFFLINE_CACHE',
      });
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível encerrar a sessão.');
  }
}

export async function buscarPerfilAtual(): Promise<UserProfile | null> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, email, phone, role, avatar_path, created_at, updated_at')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (error && !isSchemaMissingError(error)) throw error;
    if (!profile) {
      return {
        id: authData.user.id,
        display_name:
          String(authData.user.user_metadata?.display_name ?? '') ||
          authData.user.email ||
          'Usuário',
        email: authData.user.email,
        phone: null,
        role: 'tutor',
        avatar_path: null,
        created_at: authData.user.created_at,
        updated_at: authData.user.created_at,
      };
    }

    return {
      ...profile,
      email: profile.email ?? authData.user.email,
    };
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível carregar o perfil do usuário.');
  }
}

export async function buscarContextoAcessoAtual(): Promise<
  UserAuthContext & { authenticated: boolean; emailConfirmed: boolean }
> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return {
        authenticated: false,
        emailConfirmed: false,
        role: 'tutor',
        organizationRoles: [],
      };
    }

    const emailConfirmed = isEmailConfirmedUser(authData.user);
    const [
      { data: profile, error: profileError },
      { data: memberships, error: membershipError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle(),
      supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', authData.user.id),
    ]);

    if (profileError && !isSchemaMissingError(profileError)) throw profileError;
    if (membershipError && !isSchemaMissingError(membershipError)) throw membershipError;

    return {
      authenticated: true,
      emailConfirmed,
      role: normalizeUserRole(profile?.role),
      organizationRoles: (memberships ?? []).map(
        (item) => item.role,
      ) as OrganizationRole[],
    };
  } catch {
    return {
      authenticated: false,
      emailConfirmed: false,
      role: 'tutor',
      organizationRoles: [],
    };
  }
}

export async function atualizarPerfilAtual(input: {
  display_name: string;
  phone?: string | null;
}): Promise<UserProfile> {
  try {
    const response = await fetch('/api/profile', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: input.display_name.trim(),
        phone: input.phone?.trim() || null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      profile?: UserProfile;
      error?: string;
    } | null;

    if (!response.ok || !payload?.profile) {
      throw new Error(
        payload?.error || 'Não foi possível atualizar os dados do seu perfil.',
      );
    }

    return payload.profile;
  } catch (error) {
    throw mapAuthError(error, 'Não foi possível atualizar os dados do seu perfil.');
  }
}

export function observarMudancaAutenticacao(
  callback: (authenticated: boolean) => void,
) {
  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(Boolean(session && isEmailConfirmedUser(session.user)));
  });
  return () => subscription.unsubscribe();
}
