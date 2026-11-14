'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import {
  atualizarStatusAgendamento,
  listarAgendamentos,
} from '@/services/appointments.service';
import type { Appointment } from '@/types/entities';

const statusLabels: Record<Appointment['status'], string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AppointmentsList() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await listarAgendamentos();
      setAppointments(result.appointments);
      setCurrentUserId(result.currentUserId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar os agendamentos.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  async function transitionAppointment(
    id: string,
    status: 'confirmed' | 'cancelled' | 'completed',
  ) {
    setUpdatingId(id);
    setErrorMessage('');
    try {
      await atualizarStatusAgendamento(id, status);
      await loadAppointments();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao alterar o agendamento.',
      );
    } finally {
      setUpdatingId('');
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#153b50]">Meus agendamentos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Solicitações e consultas vinculadas à sua conta.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center rounded-full bg-[#087a68] px-5 text-sm font-bold text-white"
          href="/agendamento/edit"
        >
          Novo agendamento
        </Link>
      </div>

      {errorMessage && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadAppointments()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {loading ? (
        <div className="mt-5 grid gap-3" aria-busy="true" aria-label="Carregando agendamentos">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Nenhum agendamento cadastrado"
            description="Cadastre um pet e escolha um horário disponível para começar."
          />
        </div>
      ) : (
        <ul className="mt-5 grid gap-3">
          {appointments.map((appointment) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#f6faff] p-4"
              key={appointment.id}
            >
              <div>
                <p className="font-bold text-[#153b50]">{formatDate(appointment.starts_at)}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {appointment.pet
                    ? `${appointment.pet.name} · ${appointment.pet.species}`
                    : 'Paciente'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {appointment.kind === 'teleconsultation' ? 'Teleconsulta' : 'Presencial'}
                  {' · '}
                  {statusLabels[appointment.status]}
                </p>
                {appointment.reason && (
                  <p className="mt-1 text-sm text-slate-600">{appointment.reason}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {appointment.veterinarian_id === currentUserId &&
                  appointment.status === 'pending' && (
                    <button
                      className="min-h-10 rounded-full bg-[#087a68] px-4 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === appointment.id}
                      onClick={() =>
                        void transitionAppointment(appointment.id, 'confirmed')
                      }
                      type="button"
                    >
                      Confirmar
                    </button>
                  )}
                {appointment.veterinarian_id === currentUserId &&
                  appointment.status === 'confirmed' &&
                  new Date(appointment.ends_at) <= new Date() && (
                    <button
                      className="min-h-10 rounded-full bg-[#087a68] px-4 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={updatingId === appointment.id}
                      onClick={() =>
                        void transitionAppointment(appointment.id, 'completed')
                      }
                      type="button"
                    >
                      Concluir
                    </button>
                  )}
                {appointment.kind === 'teleconsultation' &&
                  (appointment.status === 'confirmed' ||
                    appointment.status === 'completed') && (
                    <Link
                      className="inline-flex min-h-10 items-center rounded-full border border-[#087a68] px-4 text-sm font-semibold text-[#087a68]"
                      href={`/teleconsulta?appointmentId=${appointment.id}`}
                    >
                      Sala de teleconsulta
                    </Link>
                  )}
                {appointment.tutor_id === currentUserId &&
                  (appointment.status === 'pending' ||
                    appointment.status === 'confirmed') && (
                    <Link
                      className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-[#153b50]"
                      href={`/pagamentos?appointmentId=${appointment.id}`}
                    >
                      Pagamentos
                    </Link>
                  )}
                {(appointment.status === 'completed' ||
                  (appointment.veterinarian_id === currentUserId &&
                    appointment.status === 'confirmed' &&
                    new Date(appointment.starts_at) <= new Date())) && (
                  <Link
                    className="inline-flex min-h-10 items-center rounded-full border border-[#087a68] px-4 text-sm font-semibold text-[#087a68]"
                    href={`/prontuarios/${appointment.id}`}
                  >
                    {appointment.veterinarian_id === currentUserId
                      ? 'Prontuário'
                      : 'Ver prontuário'}
                  </Link>
                )}
                {appointment.veterinarian_id === currentUserId &&
                  (appointment.status === 'completed' ||
                    (appointment.status === 'confirmed' &&
                      new Date(appointment.starts_at) <= new Date())) && (
                    <>
                      <Link
                        className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-[#153b50]"
                        href={`/receitas?appointmentId=${appointment.id}`}
                      >
                        Receita
                      </Link>
                      <Link
                        className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-[#153b50]"
                        href={`/exames?appointmentId=${appointment.id}`}
                      >
                        Exames
                      </Link>
                    </>
                  )}
                {(appointment.status === 'pending' ||
                  appointment.status === 'confirmed') && (
                  <button
                    className="min-h-10 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-700 disabled:opacity-60"
                    disabled={updatingId === appointment.id}
                    onClick={() =>
                      void transitionAppointment(appointment.id, 'cancelled')
                    }
                    type="button"
                  >
                    {updatingId === appointment.id ? 'Atualizando...' : 'Cancelar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
