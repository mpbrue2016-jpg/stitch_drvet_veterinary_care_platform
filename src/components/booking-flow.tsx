'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Skeleton } from '@/components/ui';
import { createBookingSchema, createPetSchema } from '@/lib/validations';
import { criarAgendamento } from '@/services/appointments.service';
import { listarDisponibilidade } from '@/services/availability.service';
import { criarPet, listarPets } from '@/services/pets.service';
import type { AppointmentKind, AvailabilitySlot, Pet } from '@/types/entities';

type BookingResult = {
  id: string;
  starts_at: string;
  ends_at: string;
  petName: string;
  kind: AppointmentKind;
};

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDayCard(value: string) {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const dayDifference = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  const label =
    dayDifference === 0
      ? 'Hoje'
      : dayDifference === 1
        ? 'Amanhã'
        : new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
  return {
    label,
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date),
  };
}

export function BookingFlow() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [petId, setPetId] = useState('');
  const [newPet, setNewPet] = useState(false);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [kind, setKind] = useState<AppointmentKind>('teleconsultation');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState<BookingResult | null>(null);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [petResult, availabilityResult] = await Promise.all([
        listarPets(),
        listarDisponibilidade(),
      ]);

      const loadedPets = petResult.pets;
      const loadedAvailability = availabilityResult.availability;
      setPets(loadedPets);
      setAvailability(loadedAvailability);
      setPetId((current) =>
        loadedPets.some((pet) => pet.id === current)
          ? current
          : loadedPets[0]?.id ?? '',
      );
      const availableDays = Array.from(
        new Set(loadedAvailability.map((slot) => dayKey(slot.starts_at))),
      );
      setSelectedDay((current) =>
        availableDays.includes(current) ? current : availableDays[0] ?? '',
      );
      setSelectedSlotId((current) =>
        loadedAvailability.some((slot) => slot.id === current)
          ? current
          : '',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar os dados.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const availableDays = useMemo(() => {
    const days = new Map<string, string>();
    availability.forEach((slot) => {
      const key = dayKey(slot.starts_at);
      if (!days.has(key)) days.set(key, slot.starts_at);
    });
    return Array.from(days.entries());
  }, [availability]);
  const daySlots = availability.filter(
    (slot) => dayKey(slot.starts_at) === selectedDay,
  );
  const selectedSlot = availability.find((slot) => slot.id === selectedSlotId);
  const selectedPet = pets.find((pet) => pet.id === petId);
  const hasSelection = Boolean((petId || newPet) && selectedSlot);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedSlot) {
      setErrorMessage('Selecione um horário disponível.');
      return;
    }
    if (!petId && !newPet) {
      setErrorMessage('Selecione ou cadastre um pet antes de continuar.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    const formData = new FormData(form);

    try {
      let selectedPetId = petId;
      let selectedPetName = selectedPet?.name ?? '';

      if (newPet) {
        const parsedPet = createPetSchema.safeParse({
          name: String(formData.get('petName') ?? ''),
          species: String(formData.get('species') ?? ''),
          breed: String(formData.get('breed') ?? '') || null,
          birth_date: String(formData.get('birthDate') ?? '') || null,
        });
        if (!parsedPet.success) {
          throw new Error(
            parsedPet.error.issues[0]?.message ?? 'Preencha corretamente os dados do pet.',
          );
        }
        const { pet: createdPet } = await criarPet(parsedPet.data);
        selectedPetId = createdPet.id;
        selectedPetName = createdPet.name;
        setPets((current) => [...current, createdPet]);
        setPetId(createdPet.id);
        setNewPet(false);
      }

      const parsedBooking = createBookingSchema.safeParse({
        availability_id: selectedSlot.id,
        pet_id: selectedPetId,
        kind,
        reason: String(formData.get('reason') ?? '').trim() || null,
      });
      if (!parsedBooking.success) {
        throw new Error(
          parsedBooking.error.issues[0]?.message ?? 'Confira os dados da solicitação.',
        );
      }

      const { appointment } = await criarAgendamento(parsedBooking.data);
      setSuccess({
        id: appointment.id,
        starts_at: selectedSlot.starts_at,
        ends_at: selectedSlot.ends_at,
        petName: selectedPetName,
        kind,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir o agendamento.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link className="text-sm font-semibold text-[#087a68]" href="/agendamento">
          ← Meus agendamentos
        </Link>
        <div className="mt-8 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-800">
          ✓
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-[#153b50]">
          Solicitação enviada
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          O horário só estará confirmado depois da resposta do profissional.
          Acompanhe o status em Meus agendamentos.
        </p>
        <div className="mt-5 rounded-2xl bg-[#ebf5ff] p-4">
          <p className="font-bold text-[#153b50]">{success.petName}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatDate(success.starts_at)} · {formatTime(success.starts_at)}–
            {formatTime(success.ends_at)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {success.kind === 'teleconsultation' ? 'Teleconsulta' : 'Presencial'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Protocolo: {success.id}
          </p>
        </div>
        <Link
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#087a68] px-5 font-bold text-white"
          href="/agendamento"
        >
          Ver meus agendamentos
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto min-h-screen max-w-xl overflow-hidden bg-[#f6faff] sm:min-h-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-sm">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          aria-label="Voltar aos meus agendamentos"
          className="grid h-10 w-10 place-items-center rounded-full text-xl text-[#153b50] hover:bg-slate-100"
          href="/agendamento"
        >
          ←
        </Link>
        <div className="text-center">
          <h1 className="text-base font-bold text-[#153b50]">
            Agendar consulta
          </h1>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#087a68]">
            Etapa final da solicitação
          </p>
        </div>
        <span aria-hidden="true" className="h-10 w-10" />
      </header>

      <div className="grid gap-4 px-4 pb-36 pt-4 sm:p-6 sm:pb-36">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#d4ebff] text-lg text-[#006b57]">
              ▦
            </span>
            <div>
              <h2 className="font-bold text-[#153b50]">Consulta veterinária</h2>
              <p className="text-xs text-slate-600">
                Escolha um horário publicado
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dff0ff] px-3 py-1 text-xs font-semibold text-[#006b57]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#13a88a]" />
            Online
          </span>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-[#153b50]">Paciente</h2>
            <span className="text-xs text-slate-500">Dados da sua conta</span>
          </div>
          {!newPet ? (
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Pet
              <select
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-3"
                disabled={loading || submitting}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setNewPet(true);
                    setPetId('');
                  } else {
                    setPetId(event.target.value);
                  }
                }}
                value={petId}
              >
                <option value="">Selecione um pet</option>
                {pets.map((pet) => (
                  <option key={pet.id} value={pet.id}>
                    {pet.name} · {pet.species}
                  </option>
                ))}
                <option value="__new__">Cadastrar um novo pet</option>
              </select>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Nome do pet
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  maxLength={100}
                  name="petName"
                  form="booking-form"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Espécie
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  maxLength={60}
                  name="species"
                  form="booking-form"
                  placeholder="Ex.: cachorro"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Raça (opcional)
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  maxLength={100}
                  name="breed"
                  form="booking-form"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Nascimento (opcional)
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  name="birthDate"
                  form="booking-form"
                  type="date"
                />
              </label>
              <button
                className="text-left text-sm font-semibold text-[#087a68] sm:col-span-2"
                onClick={() => setNewPet(false)}
                type="button"
              >
                Escolher um pet já cadastrado
              </button>
            </div>
          )}
          {!newPet && pets.length === 0 && !loading && (
            <p className="mt-3 text-sm text-slate-600">
              Cadastre um pet para continuar.
            </p>
          )}
          {!newPet && selectedPet && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#ebf5ff] p-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#d4ebff] text-xl text-[#006b57]">
                ♧
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-[#153b50]">{selectedPet.name}</p>
                <p className="text-sm text-slate-600">{selectedPet.species}</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                Ativo
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-[#153b50]">Tipo de atendimento</h2>
            <span className="rounded-full bg-[#d4ebff] px-2 py-0.5 text-[11px] font-semibold text-[#274a60]">
              Selecione
            </span>
          </div>
          <p className="mb-3 text-sm font-bold text-[#153b50]">
            Consulta veterinária
          </p>
          <p className="mb-3 text-sm leading-5 text-slate-600">
            Escolha entre teleconsulta ou atendimento presencial conforme a disponibilidade publicada.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['teleconsultation', 'Teleconsulta', 'Atendimento por vídeo'],
              ['in_person', 'Presencial', 'Na clínica'],
            ] as const).map(([value, title, description]) => (
              <button
                aria-pressed={kind === value}
                className={`rounded-xl border p-3 text-left transition ${
                  kind === value
                    ? 'border-[#087a68] bg-[#ebf5ff] ring-1 ring-[#087a68]'
                    : 'border-slate-200 bg-white'
                }`}
                disabled={submitting}
                key={value}
                onClick={() => setKind(value)}
                type="button"
              >
                <span className="block text-sm font-bold text-[#153b50]">
                  {title}
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  {description}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-[#f6faff] p-3 text-xs leading-5 text-slate-600">
            A modalidade escolhida será enviada ao profissional para confirmação.
            Recursos de vídeo e prontuário ficam sujeitos à disponibilidade e às
            configurações da clínica.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-[#153b50]">Profissional disponível</h2>
            <span className="text-xs font-semibold text-[#087a68]">
              Agenda publicada
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#dff0ff] text-2xl text-[#006b57]">
              ♙
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-[#153b50]">
                Dra. Camila Nogueira · CRMV-SP 28491
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Clínica Geral e Dermatologia · Atendimento sujeito à confirmação.
              </p>
            </div>
            <span
              aria-label="Credenciamento validado pelo sistema"
              className="ml-auto text-lg text-[#087a68]"
            >
              ✓
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold text-[#153b50]">Data e horário disponível</h2>
            <span className="text-xs text-slate-500">Seu horário local</span>
          </div>
          {loading ? (
            <div className="grid gap-2" aria-busy="true">
              <Skeleton className="h-20 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
          ) : availableDays.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Não há horários publicados. Tente novamente mais tarde ou consulte
              a equipe para saber quando a agenda será aberta.
            </p>
          ) : (
            <>
              <div
                aria-label="Datas disponíveis"
                className="flex gap-2 overflow-x-auto pb-2"
                role="group"
              >
                {availableDays.map(([key, date]) => {
                  const card = formatDayCard(date);
                  const active = selectedDay === key;
                  return (
                    <button
                      aria-pressed={active}
                      className={`flex min-h-20 min-w-0 basis-[calc((100%-1rem)/3)] shrink-0 flex-col items-center justify-center rounded-xl p-2 text-center ${
                        active
                          ? 'bg-[#006b57] text-white shadow-sm'
                          : 'bg-[#ebf5ff] text-[#153b50]'
                      }`}
                      key={key}
                      onClick={() => {
                        setSelectedDay(key);
                        setSelectedSlotId('');
                      }}
                      type="button"
                    >
                      <span className="text-[11px] font-semibold capitalize leading-tight">
                        {card.label}
                      </span>
                      <span className="text-xl font-extrabold">{card.day}</span>
                      <span className="text-xs capitalize">{card.month}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {daySlots.map((slot) => {
                  const active = slot.id === selectedSlotId;
                  return (
                    <button
                      aria-pressed={active}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-[#087a68] bg-[#dff0ff] ring-1 ring-[#087a68]'
                          : 'border-slate-100 bg-[#f6faff] hover:bg-[#ebf5ff]'
                      }`}
                      key={slot.id}
                      onClick={() => setSelectedSlotId(slot.id)}
                      type="button"
                    >
                      <span className="block text-base font-bold text-[#153b50]">
                        {formatTime(slot.starts_at)}
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                      </span>
                      <span
                        className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${active ? 'text-[#006b57]' : 'text-slate-500'}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${active ? 'bg-[#13a88a]' : 'bg-slate-300'}`}
                        />
                        {active ? 'Selecionado' : 'Disponível'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#dff0ff] pb-2">
            <h2 className="font-bold text-[#153b50]">Resumo de valores e benefícios</h2>
            <span className="text-[11px] font-semibold text-slate-500">Não configurado</span>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Preço, descontos, vouchers e formas de pagamento ainda não foram
            configurados para esta consulta. Nenhuma cobrança será feita ao
            enviar a solicitação.
          </p>
        </div>

        <div className="rounded-xl bg-[#ebf5ff] p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-xl text-[#006b57]">
              ⓘ
            </span>
            <div>
              <h2 className="font-bold text-[#153b50]">Sobre o atendimento</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                A solicitação não confirma consulta, gravação, prescrição digital
                ou assinatura. Esses recursos dependem de validação profissional
                e configuração dos serviços correspondentes.
              </p>
            </div>
          </div>
        </div>

        <form
          className="grid gap-4"
          id="booking-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Motivo ou sintomas (opcional)
            <textarea
              className="min-h-24 rounded-xl border border-slate-300 bg-white p-3"
              maxLength={1000}
              name="reason"
              placeholder="Conte brevemente o motivo da consulta."
            />
          </label>

          {errorMessage && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              <p>{errorMessage}</p>
              <button
                className="font-semibold underline"
                onClick={() => void loadOptions()}
                type="button"
              >
                Atualizar disponibilidade
              </button>
            </div>
          )}

          {selectedSlot && (
            <div className="rounded-xl bg-[#ebf5ff] p-3 text-sm text-[#153b50]">
              <span className="font-bold">Resumo: </span>
              {selectedPet?.name ?? (newPet ? 'Novo pet' : 'Selecione um pet')}
              {' · '}
              {kind === 'teleconsultation' ? 'Teleconsulta' : 'Presencial'}
              {' · '}
              {formatDate(selectedSlot.starts_at)} às{' '}
              {formatTime(selectedSlot.starts_at)}
            </div>
          )}

          <button
            className="fixed inset-x-0 bottom-0 z-20 border-t border-[#cbe6fc] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl disabled:cursor-not-allowed sm:left-1/2 sm:right-auto sm:w-[min(100%,36rem)] sm:-translate-x-1/2 sm:rounded-t-2xl sm:border-x sm:px-6 lg:left-[calc(50%+9rem)]"
            disabled={loading || submitting || !hasSelection}
            type="submit"
          >
            <span
              className={`mx-auto flex min-h-12 w-full max-w-xl items-center justify-center gap-2 rounded-full px-5 font-bold text-white shadow-md transition ${loading || submitting || !hasSelection ? 'bg-slate-400' : 'bg-[#006b57] hover:bg-[#005141]'}`}
            >
              {submitting ? 'Enviando solicitação…' : 'Solicitar atendimento'}
              <span aria-hidden="true">→</span>
            </span>
            <span className="mx-auto mt-2 block max-w-xl text-center text-[11px] text-slate-500">
              Solicitação pendente · sem cobrança
            </span>
          </button>
        </form>
      </div>
    </section>
  );
}
