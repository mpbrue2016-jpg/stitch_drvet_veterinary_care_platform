'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Badge, Button, Card, DemoNotice, Input, PageHeader, Select, Toast } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createPetSchema } from '@/lib/validations';
import {
  buscarPerfilAtual,
  cadastrarUsuario,
  entrarComEmailSenha,
} from '@/services/auth.service';
import { criarPet, listarPets } from '@/services/pets.service';
import type { Pet, UserProfile } from '@/types/entities';

type Step = 'account' | 'pet' | 'success';

export function PartnerTutorOnboarding() {
  const configured = isSupabaseConfigured();
  const [step, setStep] = useState<Step>('account');
  const [couponCode, setCouponCode] = useState('DRVET15');
  const [partnerName, setPartnerName] = useState('Pet Care Parceiro Credenciado');
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('Cachorro');
  const [breed, setBreed] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [existingPets, setExistingPets] = useState<Pet[]>([]);
  const [createdPet, setCreatedPet] = useState<Pet | null>(null);

  const [loading, setLoading] = useState(configured);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cupom = params.get('cupom');
    const parceiro = params.get('parceiro');
    if (cupom) setCouponCode(cupom.trim().toUpperCase().slice(0, 24));
    if (parceiro) setPartnerName(parceiro.trim().slice(0, 80));
  }, []);

  const syncSession = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const current = await buscarPerfilAtual();
      setProfile(current);
      if (current) {
        const { pets } = await listarPets();
        setExistingPets(pets);
        setStep('pet');
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void syncSession();
  }, [syncSession]);

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setErrorMessage('');
    setNotice('');
    setSubmitting(true);
    try {
      if (authMode === 'signup') {
        if (displayName.trim().length < 2) {
          throw new Error('Informe seu nome completo para criar a conta.');
        }
        const redirect =
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=/cadastro`
            : undefined;
        const result = await cadastrarUsuario({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          emailRedirectTo: redirect,
        });
        if (result.session) {
          await syncSession();
          setNotice('Conta criada com sucesso! Agora cadastre o seu pet.');
        } else {
          setNotice(
            'Cadastro iniciado! Verifique o link de confirmação no seu e-mail para liberar o acesso.',
          );
        }
      } else {
        await entrarComEmailSenha({ email: email.trim(), password });
        await syncSession();
        setNotice('Sessão autenticada! Continue cadastrando o seu pet.');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível autenticar sua conta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setErrorMessage('');
    setNotice('');
    const parsed = createPetSchema.safeParse({
      name: petName.trim(),
      species: species.trim(),
      breed: breed.trim() || null,
      birth_date: birthDate || null,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Verifique os dados do pet antes de salvar.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const { pet } = await criarPet(parsed.data);
      setCreatedPet(pet);
      setExistingPets((current) => [pet, ...current]);
      setStep('success');
      setNotice(`Cadastro de ${pet.name} concluído com benefício ${couponCode}!`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível concluir o cadastro do pet.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        action={
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
            href="/"
          >
            Voltar à Home
          </Link>
        }
        description="Cadastro rápido do tutor via QR Code do Pet Shop parceiro com vínculo imediato do primeiro paciente."
        title="Onboarding QR Code — Tutor & Pet"
      />

      {!configured && <DemoNotice />}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-[#10344A] to-[#153B50] p-5 text-white shadow-card">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
            Atendimento Parceiro Verificado
          </span>
          <h2 className="mt-2 text-lg font-extrabold sm:text-xl">{partnerName}</h2>
          <p className="mt-1 text-xs text-slate-300">
            Benefício promocional vinculado para a 1ª teleconsulta veterinária 24h.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-400/40 bg-white/10 px-4 py-2.5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Cupom QR Ativo
          </p>
          <p className="mt-0.5 text-xl font-extrabold tracking-widest text-white">
            {couponCode}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2">
        {[
          { key: 'account', label: '1. Conta do Tutor' },
          { key: 'pet', label: '2. Dados do Pet' },
          { key: 'success', label: '3. Pronto para Consulta' },
        ].map((item) => {
          const active = step === item.key;
          return (
            <div
              className={`rounded-xl border px-3 py-2.5 text-center text-xs font-bold ${
                active
                  ? 'border-brand-green bg-emerald-50 text-brand-navy'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
              key={item.key}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {notice && (
        <div className="mb-4">
          <Toast message={notice} onDismiss={() => setNotice('')} variant="success" />
        </div>
      )}
      {errorMessage && (
        <div className="mb-4">
          <Toast message={errorMessage} onDismiss={() => setErrorMessage('')} variant="danger" />
        </div>
      )}

      {loading ? (
        <Card title="Verificando sessão">
          <p className="text-sm text-brand-muted">Carregando dados de onboarding…</p>
        </Card>
      ) : step === 'account' ? (
        <Card
          description="Entre com sua conta DrVet ou crie seu acesso em menos de 1 minuto."
          title="Etapa 1 — Identificação do Tutor"
        >
          <div className="mb-5 flex gap-2">
            <Button
              onClick={() => setAuthMode('signup')}
              type="button"
              variant={authMode === 'signup' ? 'secondary' : 'outline'}
            >
              Criar nova conta
            </Button>
            <Button
              onClick={() => setAuthMode('login')}
              type="button"
              variant={authMode === 'login' ? 'secondary' : 'outline'}
            >
              Já tenho conta
            </Button>
          </div>

          <form className="grid gap-4" onSubmit={(event) => void handleAccountSubmit(event)}>
            {authMode === 'signup' && (
              <Input
                label="Seu nome completo"
                name="displayName"
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex.: Mariana Silva"
                required
                value={displayName}
              />
            )}
            <Input
              label="E-mail"
              name="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@email.com"
              required
              type="email"
              value={email}
            />
            <Input
              label="Senha (mínimo 8 caracteres)"
              minLength={8}
              name="password"
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button disabled={!configured || submitting} type="submit" variant="secondary">
                {submitting
                  ? 'Processando…'
                  : authMode === 'signup'
                    ? 'Continuar para cadastro do pet'
                    : 'Entrar e continuar'}
              </Button>
              {!configured && (
                <Button onClick={() => setStep('pet')} type="button" variant="outline">
                  Pré-visualizar etapa do pet
                </Button>
              )}
            </div>
          </form>
        </Card>
      ) : step === 'pet' ? (
        <Card
          description={
            profile
              ? `Conta conectada como ${profile.display_name}. Cadastre o paciente para liberar o agendamento.`
              : 'Cadastre os dados básicos do paciente.'
          }
          title="Etapa 2 — Cadastro do Primeiro Pet"
        >
          {existingPets.length > 0 && (
            <div className="mb-5 rounded-xl border border-slate-200 bg-[#F5F8FA] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Pets já vinculados ({existingPets.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {existingPets.map((item) => (
                  <Badge key={item.id} variant="info">
                    {item.name} · {item.species}
                  </Badge>
                ))}
              </div>
              <div className="mt-3">
                <Link
                  className="text-xs font-bold text-brand-green hover:underline"
                  href={`/agendamento/edit?cupom=${encodeURIComponent(couponCode)}`}
                >
                  Já quero agendar com um pet existente →
                </Link>
              </div>
            </div>
          )}

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handlePetSubmit(event)}>
            <Input
              label="Nome do pet"
              name="petName"
              onChange={(e) => setPetName(e.target.value)}
              placeholder="Ex.: Pipoca"
              required
              value={petName}
            />
            <Select
              label="Espécie"
              name="species"
              onChange={(e) => setSpecies(e.target.value)}
              value={species}
            >
              <option value="Cachorro">Cachorro</option>
              <option value="Gato">Gato</option>
              <option value="Ave">Ave</option>
              <option value="Outro">Coelho / Exótico</option>
            </Select>
            <Input
              label="Raça (opcional)"
              name="breed"
              onChange={(e) => setBreed(e.target.value)}
              placeholder="Ex.: Spitz Alemão"
              value={breed}
            />
            <Input
              label="Data de nascimento (opcional)"
              name="birthDate"
              onChange={(e) => setBirthDate(e.target.value)}
              type="date"
              value={birthDate}
            />
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button disabled={!configured || submitting} type="submit" variant="secondary">
                {submitting ? 'Salvando pet…' : 'Concluir cadastro do pet'}
              </Button>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
                href="/pets"
              >
                Ir para Meus Pets
              </Link>
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Cadastro concluído com sucesso">
          <div className="grid gap-4 py-2">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
                ✓
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-brand-navy">
                  {createdPet?.name ?? 'Paciente'} já está pronto no DrVet!
                </h3>
                <p className="text-sm text-brand-muted">
                  Código {couponCode} registrado para atendimento prioritário com {partnerName}.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-green px-5 text-sm font-bold text-white hover:bg-[#0f8a72]"
                href={`/agendamento/edit?cupom=${encodeURIComponent(couponCode)}`}
              >
                Agendar 1ª teleconsulta agora →
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
                href="/carteira/vacinas"
              >
                Abrir carteira de vacinas
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
