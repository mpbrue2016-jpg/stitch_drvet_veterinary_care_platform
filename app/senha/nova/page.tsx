'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { newPasswordSchema } from '@/lib/validations';
import { atualizarSenha, buscarContextoAcessoAtual } from '@/services/auth.service';

export default function NewPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function checkSession() {
      if (!isSupabaseConfigured()) {
        if (active) {
          setHasValidSession(false);
          setCheckingSession(false);
        }
        return;
      }
      const ctx = await buscarContextoAcessoAtual();
      if (active) {
        setHasValidSession(ctx.authenticated && ctx.emailConfirmed);
        setCheckingSession(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setMessage('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmation = String(formData.get('confirmation') ?? '');

    const parsed = newPasswordSchema.safeParse({ password, confirmation });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Verifique os campos da nova senha.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await atualizarSenha(parsed.data.password);

      setMessage('Senha alterada. Você já pode continuar usando sua conta.');
      window.setTimeout(() => {
        router.replace('/agendamento');
        router.refresh();
      }, 1200);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível redefinir a senha. Solicite um novo link.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6faff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link className="text-sm font-bold text-[#087a68]" href="/login">
          ← Voltar para entrar
        </Link>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          Acesso seguro
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-[#153b50]">
          Criar nova senha
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Escolha uma senha com pelo menos 8 caracteres.
        </p>

        {!checkingSession && !hasValidSession ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">
              Sessão de recuperação ausente, não confirmada ou expirada.
            </p>
            <p>
              Para redefinir sua senha com segurança, abra o link enviado por e-mail
              ou solicite uma nova recuperação na tela de login.
            </p>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#087a68] px-5 font-bold text-white"
              href="/login"
            >
              Ir para login e solicitar link
            </Link>
          </div>
        ) : (
          <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Nova senha
              <input
                autoComplete="new-password"
                className="min-h-11 rounded-xl border border-slate-300 px-3"
                disabled={checkingSession || isSubmitting}
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Confirmar nova senha
              <input
                autoComplete="new-password"
                className="min-h-11 rounded-xl border border-slate-300 px-3"
                disabled={checkingSession || isSubmitting}
                minLength={8}
                name="confirmation"
                required
                type="password"
              />
            </label>
            {errorMessage && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
                {errorMessage}
              </p>
            )}
            {message && (
              <p
                className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
                role="status"
              >
                {message}
              </p>
            )}
            <button
              className="min-h-12 rounded-full bg-[#087a68] px-5 font-bold text-white disabled:opacity-60"
              disabled={checkingSession || isSubmitting}
              type="submit"
            >
              {checkingSession
                ? 'Validando sessão...'
                : isSubmitting
                  ? 'Salvando...'
                  : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
