'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Appointment = {
  id: string;
  kind: 'teleconsultation' | 'in_person';
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  reason: string | null;
  starts_at: string;
  ends_at: string;
  pet_id: string;
  veterinarian_id: string;
  pet: { name: string; species: string } | null;
};

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
      const response = await fetch('/api/appointments');
      const result: {
        appointments?: Appointment[];
        currentUserId?: string;
        error?: string;
      } =
        await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível carregar os agendamentos.');
      }
      setAppointments(result.appointments ?? []);
      setCurrentUserId(result.currentUserId ?? '');
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
      const response = await fetch('/api/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível alterar o agendamento.');
      }
      await loadAppointments();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao cancelar o agendamento.',
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
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      )}
      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Carregando agendamentos...</p>
      ) : appointments.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="font-semibold text-[#153b50]">Nenhum agendamento cadastrado</p>
          <p className="mt-2 text-sm text-slate-600">
            Cadastre um pet e escolha um horário disponível para começar.
          </p>
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
                    <Link
                      className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-[#153b50]"
                      href={`/exames?appointmentId=${appointment.id}`}
                    >
                      Exames
                    </Link>
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
