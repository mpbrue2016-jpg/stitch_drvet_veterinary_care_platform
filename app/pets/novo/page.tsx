<<<<<<< HEAD
'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export default function NovoPetPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setNeedsSetup(searchParams.get('setup') === 'required');
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!isSupabaseConfigured()) {
      setErrorMessage(
        'O Supabase ainda não está configurado. Preenche o .env.local e reinicia o servidor.',
      );
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      species: String(formData.get('species') ?? '').trim(),
      breed: String(formData.get('breed') ?? '').trim() || null,
      birth_date: String(formData.get('birth_date') ?? '').trim() || null,
      sex: String(formData.get('sex') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
    };

    if (!payload.name || !payload.species) {
      setErrorMessage('Nome e espécie são obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { pet?: { id: string }; error?: string };

      if (!response.ok || !result.pet) {
        setErrorMessage(result.error ?? 'Não foi possível cadastrar o pet.');
        return;
      }

      router.replace('/agendamento');
      router.refresh();
    } catch {
      setErrorMessage('Erro de conexão. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6faff] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <Link className="text-sm font-bold text-[#087a68]" href="/agendamento">
          ← Voltar
        </Link>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          Cadastro de pet
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-[#153b50]">
          Cadastrar um novo pet
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Complete os dados do animal para continuar com o agendamento.
        </p>

        {needsSetup && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Configure o Supabase no arquivo local <code>.env.local</code> para ativar a autenticação.
          </div>
        )}

        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Nome *
            <input
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              maxLength={100}
              name="name"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Espécie *
            <input
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              maxLength={60}
              name="species"
              placeholder="Ex: cão, gato, coelho"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Raça
            <input
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              maxLength={100}
              name="breed"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Data de nascimento
            <input
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              name="birth_date"
              type="date"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Sexo
            <select className="min-h-11 rounded-xl border border-slate-300 px-3" name="sex">
              <option value="">Não informado</option>
              <option value="female">Fêmea</option>
              <option value="male">Macho</option>
              <option value="unknown">Não sabido</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Observações
            <textarea
              className="min-h-24 rounded-xl border border-slate-300 bg-white p-3"
              maxLength={2000}
              name="notes"
              placeholder="Informações relevantes (alergias, comportamento, etc.)"
            />
          </label>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="min-h-12 rounded-full bg-[#087a68] px-5 font-bold text-white disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Salvando...' : 'Cadastrar pet'}
          </button>
        </form>
      </section>
    </main>
  );
}
=======
import { PetsManager } from '@/components/pets-manager';

export default function NewPetPage() {
  return <PetsManager initialCreateMode />;
}
>>>>>>> origin/main
