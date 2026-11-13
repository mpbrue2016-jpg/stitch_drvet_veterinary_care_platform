'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default function NewPasswordPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setMessage('');

    if (!isSupabaseConfigured()) {
      setErrorMessage('O Supabase ainda não está configurado neste ambiente.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmation = String(formData.get('confirmation') ?? '');
    if (password.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('As senhas informadas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({
        password,
      });
      if (error) throw error;

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

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Nova senha
            <input
              autoComplete="new-password"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
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
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </section>
    </main>
  );
}
