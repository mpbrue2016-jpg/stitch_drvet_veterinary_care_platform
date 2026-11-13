'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
} from '@/components/ui';

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

const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const workHours = [8, 9, 10, 11, 14, 15, 16, 17];

const statusLabels: Record<Appointment['status'], string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
};

function startOfBusinessWeek(date: Date) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  const weekday = monday.getDay();
  monday.setDate(monday.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return monday;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatPeriod(start: Date, end: Date) {
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} de ${month.format(end)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

function statusVariant(status: Appointment['status']) {
  if (status === 'confirmed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled') return 'neutral';
  return 'info';
}

export function WeeklyAgenda({ setup }: { setup?: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const weekStart = useMemo(() => {
    const start = startOfBusinessWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);
  const weekDays = useMemo(
    () => weekdays.map((label, index) => ({ label, date: addDays(weekStart, index) })),
    [weekStart],
  );
  const weekEnd = weekDays[weekDays.length - 1].date;

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const rangeEnd = addDays(weekStart, 5);
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: rangeEnd.toISOString(),
      });
      const response = await fetch(`/api/appointments?${params.toString()}`, {
        cache: 'no-store',
      });
      const result: {
        appointments?: Appointment[];
        currentUserId?: string;
        error?: string;
      } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível carregar a agenda.');
      }
      setAppointments(result.appointments ?? []);
      setCurrentUserId(result.currentUserId ?? '');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar a agenda.',
      );
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const professionalAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.veterinarian_id === currentUserId)
        .sort(
          (left, right) =>
            new Date(left.starts_at).getTime() -
            new Date(right.starts_at).getTime(),
        ),
    [appointments, currentUserId],
  );
  const activeAppointments = professionalAppointments.filter(
    (appointment) => appointment.status !== 'cancelled',
  );
  const nextAppointment = activeAppointments.find(
    (appointment) => new Date(appointment.ends_at).getTime() >= Date.now(),
  );
  const appointmentsByCell = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    professionalAppointments.forEach((appointment) => {
      const startsAt = new Date(appointment.starts_at);
      const key = `${dateKey(startsAt)}-${startsAt.getHours()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), appointment]);
    });
    return grouped;
  }, [professionalAppointments]);
  const displayedAppointmentIds = useMemo(
    () =>
      new Set(
        weekDays.flatMap(({ date }) =>
          workHours.flatMap((hour) =>
            (appointmentsByCell.get(`${dateKey(date)}-${hour}`) ?? []).map(
              (appointment) => appointment.id,
            ),
          ),
        ),
      ),
    [appointmentsByCell, weekDays],
  );
  const otherAppointments = professionalAppointments.filter(
    (appointment) => !displayedAppointmentIds.has(appointment.id),
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Agenda de consultas"
        description="Acompanhe os atendimentos da semana e gerencie sua disponibilidade."
        action={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#087a68] px-5 text-sm font-bold text-white"
            href="/agendamento"
          >
            Ver agendamentos
          </Link>
        }
      />

      {setup}

      {errorMessage && (
        <div
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadAppointments()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <section
        aria-label="Indicadores da agenda desta semana"
        className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Atendimentos na semana"
          value={loading ? '…' : String(activeAppointments.length)}
          detail="Consultas não canceladas"
          icon="▦"
        />
        <MetricCard
          label="Teleconsultas"
          value={loading
            ? '…'
            : String(activeAppointments.filter((item) => item.kind === 'teleconsultation').length)}
          detail="Nesta semana"
          icon="◉"
        />
        <MetricCard
          label="Presenciais"
          value={loading
            ? '…'
            : String(activeAppointments.filter((item) => item.kind === 'in_person').length)}
          detail="Nesta semana"
          icon="⌖"
        />
        <MetricCard
          label="Aguardando confirmação"
          value={loading
            ? '…'
            : String(activeAppointments.filter((item) => item.status === 'pending').length)}
          detail="Solicitações pendentes"
          icon="◷"
        />
      </section>

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-label="Semana anterior"
                  type="button"
                  variant="outline"
                  onClick={() => setWeekOffset((offset) => offset - 1)}
                >
                  ‹
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={weekOffset === 0}
                  onClick={() => setWeekOffset(0)}
                >
                  Hoje
                </Button>
                <Button
                  aria-label="Próxima semana"
                  type="button"
                  variant="outline"
                  onClick={() => setWeekOffset((offset) => offset + 1)}
                >
                  ›
                </Button>
                <h2 className="ml-1 font-bold capitalize text-[#153b50] sm:ml-3">
                  {formatPeriod(weekStart, weekEnd)}
                </h2>
              </div>
              <Badge variant="info">Horário local do dispositivo</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wide text-slate-500">
                Status:
              </span>
              <Badge variant="warning">Aguardando</Badge>
              <Badge variant="success">Confirmado</Badge>
              <Badge variant="info">Concluído</Badge>
              <Badge variant="neutral">Cancelado</Badge>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Carregando atendimentos da semana…
            </p>
          ) : errorMessage ? (
            <EmptyState
              title="Agenda indisponível"
              description="Não foi possível carregar os dados deste período."
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[76px_repeat(5,minmax(120px,1fr))] border-b border-slate-100 bg-[#ebf5ff]">
                  <div className="p-3 text-[10px] font-bold uppercase text-slate-600">
                    Horário
                  </div>
                  {weekDays.map(({ label, date }) => (
                    <div
                      className="border-l border-slate-100 p-3 text-center"
                      key={label}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#153b50]">
                        {formatDay(date)}
                      </p>
                    </div>
                  ))}
                </div>
                {workHours.map((hour) => (
                  <div
                    className="grid min-h-20 grid-cols-[76px_repeat(5,minmax(120px,1fr))] border-b border-slate-100 last:border-b-0"
                    key={hour}
                  >
                    <div className="bg-[#f6faff] px-3 py-4 text-xs font-semibold text-slate-600">
                      {`${String(hour).padStart(2, '0')}:00`}
                    </div>
                    {weekDays.map(({ date }) => {
                      const cellAppointments =
                        appointmentsByCell.get(`${dateKey(date)}-${hour}`) ?? [];
                      return (
                        <div
                          className="border-l border-slate-100 p-2"
                          key={`${dateKey(date)}-${hour}`}
                        >
                          {cellAppointments.length > 0 ? (
                            <ul className="grid h-full content-start gap-2">
                              {cellAppointments.map((appointment) => (
                                <li key={appointment.id}>
                                  <Link
                                    className={`block rounded-xl border p-2 text-left transition hover:shadow-sm ${
                                      appointment.status === 'cancelled'
                                        ? 'border-slate-200 bg-slate-50'
                                        : appointment.kind === 'teleconsultation'
                                          ? 'border-sky-200 bg-sky-50'
                                          : 'border-emerald-200 bg-emerald-50'
                                    }`}
                                    href="/agendamento"
                                  >
                                    <span className="block truncate text-xs font-bold text-[#153b50]">
                                      {appointment.pet?.name ?? 'Paciente'}
                                    </span>
                                    <span className="mt-1 block text-[11px] text-slate-600">
                                      {formatTime(appointment.starts_at)}–{formatTime(appointment.ends_at)}
                                    </span>
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      <Badge variant={statusVariant(appointment.status)}>
                                        {statusLabels[appointment.status]}
                                      </Badge>
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="grid h-full min-h-14 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
                              <span className="text-[11px] text-slate-400">
                                Livre
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-[#f6faff] px-4 py-3 text-[11px] text-slate-600 sm:px-5">
            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Atendimento presencial
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              Teleconsulta
            </span>
            <span>Os horários livres não representam disponibilidade publicada.</span>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card
            title="Próximo atendimento"
            description="Próximo compromisso não cancelado na semana selecionada."
          >
            {nextAppointment ? (
              <div className="rounded-xl bg-[#ebf5ff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={statusVariant(nextAppointment.status)}>
                    {statusLabels[nextAppointment.status]}
                  </Badge>
                  <span className="text-xs font-semibold text-slate-600">
                    {formatTime(nextAppointment.starts_at)}
                  </span>
                </div>
                <p className="mt-3 font-bold text-[#153b50]">
                  {nextAppointment.pet?.name ?? 'Paciente'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {nextAppointment.pet?.species ?? 'Espécie não informada'}
                  {' · '}
                  {nextAppointment.kind === 'teleconsultation'
                    ? 'Teleconsulta'
                    : 'Presencial'}
                </p>
                {nextAppointment.reason && (
                  <p className="mt-2 text-sm text-slate-600">
                    {nextAppointment.reason}
                  </p>
                )}
                <Link
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#087a68] px-4 text-sm font-semibold text-white"
                  href="/agendamento"
                >
                  Abrir agendamentos
                </Link>
              </div>
            ) : (
              <EmptyState
                title="Nenhum atendimento futuro"
                description="Não há consultas futuras nesta semana."
              />
            )}
          </Card>
          <Card
            title="Disponibilidade"
            description="Gerencie horários publicados e bloqueios na configuração abaixo."
          >
            <div className="rounded-xl bg-[#ebf5ff] p-4 text-sm text-slate-600">
              Os horários livres da grade são apenas intervalos sem consulta marcada.
              Confira os horários publicados na seção de disponibilidade antes de
              orientar um tutor.
            </div>
          </Card>
        </aside>
      </div>

      {!loading && !errorMessage && otherAppointments.length > 0 && (
        <Card
          className="mt-5"
          title="Outros horários desta semana"
          description="Consultas fora das faixas exibidas na grade."
        >
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherAppointments.map((appointment) => (
              <li key={appointment.id}>
                <Link
                  className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
                  href="/agendamento"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[#153b50]">
                      {appointment.pet?.name ?? 'Paciente'}
                    </p>
                    <Badge variant={statusVariant(appointment.status)}>
                      {statusLabels[appointment.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(appointment.starts_at))}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
