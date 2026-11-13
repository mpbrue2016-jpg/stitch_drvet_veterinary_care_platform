'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { loginSchema, resetRequestSchema, signUpSchema } from '@/lib/validations';
import {
  cadastrarUsuario,
  entrarComEmailSenha,
  enviarRecuperacaoSenha,
} from '@/services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetRequest, setIsResetRequest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [nextPath, setNextPath] = useState('/agendamento');

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setNeedsSetup(searchParams.get('setup') === 'required' || !isSupabaseConfigured());
    const requestedPath = searchParams.get('next');
    if (requestedPath) {
      const target = new URL(requestedPath, window.location.origin);
      if (target.origin === window.location.origin) {
        setNextPath(`${target.pathname}${target.search}${target.hash}`);
      }
    }
    if (searchParams.get('error') === 'callback') {
      setErrorMessage(
        'Não foi possível confirmar o acesso. Solicite um novo link de confirmação.',
      );
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const displayName = String(formData.get('displayName') ?? '').trim();

    if (isResetRequest) {
      const parsed = resetRequestSchema.safeParse({ email });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.');
        return;
      }
    } else if (isSignUp) {
      const parsed = signUpSchema.safeParse({ email, password, displayName });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'Confira os dados do cadastro.');
        return;
      }
    } else {
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'E-mail ou senha inválidos.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isResetRequest) {
        await enviarRecuperacaoSenha(
          email,
          `${window.location.origin}/auth/callback?next=/senha/nova`,
        );
        setMessage(
          'Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha.',
        );
        return;
      }

      if (isSignUp) {
        const data = await cadastrarUsuario({
          email,
          password,
          displayName,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        });

        if (data.session) {
          router.replace('/agendamento');
          router.refresh();
          return;
        }
        setMessage(
          'Cadastro iniciado. Verifique seu e-mail para confirmar a conta antes de entrar.',
        );
        return;
      }

      await entrarComEmailSenha({ email, password });
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a autenticação.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6faff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link className="text-sm font-bold text-[#087a68]" href="/">
          ← Voltar ao DrVet
        </Link>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          Acesso seguro
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-[#153b50]">
          {isResetRequest
            ? 'Recuperar senha'
            : isSignUp
              ? 'Criar conta'
              : 'Entrar no DrVet'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isResetRequest
            ? 'Informe seu e-mail e enviaremos instruções para redefinir sua senha.'
            : 'Sua conta autenticada protege o acesso aos dados de tutores e pacientes.'}
        </p>

        {needsSetup && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Modo frontend ativo (Supabase não configurado). Você pode testar o formulário
            com validação Zod ou navegar diretamente para{' '}
            <Link className="font-bold underline" href="/agendamento">
              Agendamentos
            </Link>
            .
          </div>
        )}

        <form className="mt-6 grid gap-4" noValidate onSubmit={handleSubmit}>
          {isSignUp && !isResetRequest && (
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Nome completo
              <input
                autoComplete="name"
                className="min-h-11 rounded-xl border border-slate-300 px-3"
                maxLength={120}
                name="displayName"
                required
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            E-mail
            <input
              autoComplete="email"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              name="email"
              required
              type="email"
            />
          </label>
          {!isResetRequest && (
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Senha
              <input
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="min-h-11 rounded-xl border border-slate-300 px-3"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
          )}

          {errorMessage && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
              {errorMessage}
            </p>
          )}
          {message && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
              {message}
            </p>
          )}

          <button
            className="min-h-12 rounded-full bg-[#087a68] px-5 font-bold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? 'Aguarde...'
              : isResetRequest
                ? 'Enviar instruções'
                : isSignUp
                  ? 'Criar conta'
                  : 'Entrar'}
          </button>
        </form>

        {!isSignUp && !isResetRequest && (
          <button
            className="mt-4 min-h-10 w-full text-sm font-semibold text-[#087a68]"
            onClick={() => {
              setIsResetRequest(true);
              setMessage('');
              setErrorMessage('');
            }}
            type="button"
          >
            Esqueci minha senha
          </button>
        )}

        <button
          className="mt-5 min-h-11 w-full text-sm font-semibold text-[#087a68]"
          onClick={() => {
            if (isResetRequest) {
              setIsResetRequest(false);
              setIsSignUp(false);
            } else {
              setIsSignUp((current) => !current);
            }
            setMessage('');
            setErrorMessage('');
          }}
          type="button"
        >
          {isResetRequest
            ? 'Voltar para entrar'
            : isSignUp
              ? 'Já tenho uma conta'
              : 'Criar uma conta de tutor'}
        </button>
      </section>
    </main>
  );
}
