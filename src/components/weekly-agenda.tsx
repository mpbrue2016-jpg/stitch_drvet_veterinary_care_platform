'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BellRing,
  CalendarCheck2,
  CheckCheck,
  Clock,
  Lock,
  MailCheck,
  Send,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  Skeleton,
  Toast,
} from '@/components/ui';
import { PushInlineBanner } from '@/components/push-inline-banner';
import type { IndividualVetAgendaDigest } from '@/lib/agenda/individual-digest';
import { isLikelyOfflineError } from '@/lib/offline/vet-cache-helpers';
import {
  getCachedVetAppointments,
  saveVetAppointmentsToCache,
} from '@/lib/offline/vet-indexeddb';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listarAgendamentos } from '@/services/appointments.service';
import { listarDisponibilidade } from '@/services/availability.service';
import {
  dispatchVetAgendaCommunicado,
  fetchVetAgendaCommunications,
  markNotificationRead,
  showLocalServiceWorkerNotification,
} from '@/services/push.service';
import type {
  Appointment,
  AvailabilitySlot,
  PushNotificationItem,
} from '@/types/entities';

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

function formatDateTimeShort(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

function notificationKindLabel(kind: PushNotificationItem['kind']) {
  switch (kind) {
    case 'vet_queue_new':
      return { label: 'Nova reserva', variant: 'warning' as const };
    case 'vet_agenda_reminder':
      return { label: 'Lembrete', variant: 'warning' as const };
    case 'vet_agenda_summary':
      return { label: 'Comunicado', variant: 'info' as const };
    case 'appointment_cancelled':
      return { label: 'Cancelamento', variant: 'neutral' as const };
    default:
      return { label: 'Agenda', variant: 'info' as const };
  }
}

export function WeeklyAgenda({ setup }: { setup?: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isVeterinarian, setIsVeterinarian] = useState(false);
  const [digest, setDigest] = useState<IndividualVetAgendaDigest | null>(null);
  const [agendaNotifications, setAgendaNotifications] = useState<PushNotificationItem[]>([]);
  const [outboxStats, setOutboxStats] = useState<{
    schemaReady: boolean;
    emailQueued: number;
    pushSent: number;
  } | null>(null);
  const [commsSchemaMissing, setCommsSchemaMissing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState('');
  const [notice, setNotice] = useState('');
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

  const loadAgendaData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setOfflineNotice('');
    try {
      const rangeEnd = addDays(weekStart, 5);
      const [appointmentsResult, availabilityResult, commsResult] = await Promise.all([
        listarAgendamentos({
          from: weekStart.toISOString(),
          to: rangeEnd.toISOString(),
          mine: true,
        }),
        listarDisponibilidade({ mine: true }).catch(() => ({
          availability: [] as AvailabilitySlot[],
        })),
        fetchVetAgendaCommunications().catch(() => null),
      ]);

      setAppointments(appointmentsResult.appointments);
      setCurrentUserId(appointmentsResult.currentUserId);
      setAvailabilitySlots(availabilityResult.availability);

      if (commsResult) {
        setCommsSchemaMissing(commsResult.schemaMissing);
        setIsVeterinarian(commsResult.isVeterinarian);
        setDigest(commsResult.digest);
        setAgendaNotifications(commsResult.notifications);
        setOutboxStats(commsResult.outboxStats ?? null);
      }

      if (appointmentsResult.currentUserId) {
        const vetOwned = appointmentsResult.appointments.filter(
          (item) => item.veterinarian_id === appointmentsResult.currentUserId,
        );
        if (vetOwned.length > 0 || commsResult?.isVeterinarian) {
          void saveVetAppointmentsToCache(
            appointmentsResult.currentUserId,
            vetOwned,
            commsResult?.digest?.veterinarianName ?? null,
          ).catch(() => null);
        }
      }
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const cached = await getCachedVetAppointments().catch(() => null);
        if (cached && cached.appointments.length > 0 && cached.veterinarianId) {
          setAppointments(cached.appointments);
          setCurrentUserId(cached.veterinarianId);
          setIsVeterinarian(true);
          setOfflineNotice(
            cached.lastSyncedAt
              ? `Sem conexão com a internet. Exibindo agendamentos salvos localmente no IndexedDB em ${formatDateTimeShort(cached.lastSyncedAt)}.`
              : 'Sem conexão com a internet. Exibindo agendamentos salvos localmente no IndexedDB.',
          );
          return;
        }
      }
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar a agenda.',
      );
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadAgendaData();
  }, [loadAgendaData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleAvailabilityUpdated() {
      void loadAgendaData();
    }
    window.addEventListener('drvet:availability-updated', handleAvailabilityUpdated);
    return () => {
      window.removeEventListener('drvet:availability-updated', handleAvailabilityUpdated);
    };
  }, [loadAgendaData]);

  useEffect(() => {
    if (!configured || !currentUserId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`vet-individual-agenda-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `veterinarian_id=eq.${currentUserId}`,
        },
        () => {
          void loadAgendaData();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        () => {
          void loadAgendaData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, currentUserId, loadAgendaData]);

  async function handleDispatchCommunicado() {
    setDispatching(true);
    setErrorMessage('');
    setNotice('');
    try {
      const result = await dispatchVetAgendaCommunicado(true);
      setDigest(result.digest);
      if (result.notification) {
        const createdNotification = result.notification;
        setAgendaNotifications((current) => [
          createdNotification,
          ...current.filter((item) => item.id !== createdNotification.id),
        ]);
      }

      if (result.dispatch.delivered > 0) {
        setNotice(
          `Comunicado individual enviado via Web Push para ${result.dispatch.delivered} dispositivo(s) e registrado na fila de e-mail.`,
        );
      } else {
        const shownLocally = await showLocalServiceWorkerNotification({
          title: result.digest.title,
          body: result.digest.body,
          url: '/agenda',
          tag: `vet-digest-${Date.now()}`,
        });
        setNotice(
          shownLocally
            ? 'Comunicado da sua agenda individual gerado, exibido pelo Service Worker e enfileirado para e-mail.'
            : 'Comunicado da sua agenda individual registrado na central e na fila de e-mail.',
        );
      }
      await loadAgendaData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar o comunicado da sua agenda.',
      );
    } finally {
      setDispatching(false);
    }
  }

  async function handleMarkNotificationRead(id: string) {
    try {
      await markNotificationRead({ id });
      const now = new Date().toISOString();
      setAgendaNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: now } : item)),
      );
    } catch {
      // ignore non-critical update error
    }
  }

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
  const ownAvailabilitySlots = useMemo(
    () =>
      availabilitySlots
        .filter((slot) => slot.veterinarian_id === currentUserId)
        .sort(
          (left, right) =>
            new Date(left.starts_at).getTime() -
            new Date(right.starts_at).getTime(),
        ),
    [availabilitySlots, currentUserId],
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

  const weekStartMs = weekStart.getTime();
  const weekRangeEndMs = addDays(weekStart, 5).getTime();

  const slotsByCell = useMemo(() => {
    const grouped = new Map<string, AvailabilitySlot[]>();
    ownAvailabilitySlots.forEach((slot) => {
      const startsAt = new Date(slot.starts_at);
      const ms = startsAt.getTime();
      if (ms < weekStartMs || ms >= weekRangeEndMs) return;
      const key = `${dateKey(startsAt)}-${startsAt.getHours()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    });
    return grouped;
  }, [ownAvailabilitySlots, weekRangeEndMs, weekStartMs]);

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
  const openPublishedSlotsCount = ownAvailabilitySlots.filter(
    (slot) => slot.is_available && !slot.is_blocked,
  ).length;
  const unreadAgendaCount = agendaNotifications.filter((item) => !item.read_at).length;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Agenda Individual do Veterinário"
        description="Cada médico-veterinário gerencia seus próprios horários e recebe comunicados exclusivos apenas sobre a sua agenda."
        action={
          <div className="flex flex-wrap gap-2">
            {isVeterinarian && (
              <Button
                disabled={dispatching || loading || commsSchemaMissing}
                onClick={() => void handleDispatchCommunicado()}
                type="button"
                variant="secondary"
              >
                <Send className="mr-1.5 h-4 w-4" />
                {dispatching ? 'Enviando comunicado...' : 'Receber comunicado da minha agenda'}
              </Button>
            )}
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#087a68] bg-white px-5 text-sm font-bold text-[#087a68] hover:bg-[#f0f8fb]"
              href="/agendamento"
            >
              Ver agendamentos
            </Link>
          </div>
        }
      />

      {offlineNotice && (
        <div
          className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          role="status"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{offlineNotice}</span>
        </div>
      )}

      {digest && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#b9e1f8] bg-[#f6faff] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#087a68] text-white">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#087a68]">
                Agenda individual isolada · {digest.crmvLabel || 'Profissional autenticado'}
              </p>
              <p className="text-sm font-extrabold text-[#153b50]">
                {digest.veterinarianName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="success">
              {digest.confirmedNext7Days} confirmada(s) (7 dias)
            </Badge>
            <Badge variant="warning">
              {digest.pendingNext7Days} pendente(s)
            </Badge>
            <Badge variant="info">
              {digest.openFutureSlots} janela(s) aberta(s)
            </Badge>
          </div>
        </div>
      )}

      {setup}
      <PushInlineBanner audience="veterinarian" />

      {notice && (
        <div className="mb-4">
          <Toast message={notice} onDismiss={() => setNotice('')} variant="success" />
        </div>
      )}

      {errorMessage && (
        <div
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadAgendaData()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <section
        aria-label="Indicadores da agenda individual desta semana"
        className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Atendimentos na semana"
          value={loading ? '…' : String(activeAppointments.length)}
          detail="Consultas da sua agenda individual"
          icon="▦"
        />
        <MetricCard
          label="Janelas abertas"
          value={loading ? '…' : String(openPublishedSlotsCount)}
          detail="Horários futuros disponíveis para tutores"
          icon="◉"
        />
        <MetricCard
          label="Teleconsultas"
          value={
            loading
              ? '…'
              : String(
                  activeAppointments.filter((item) => item.kind === 'teleconsultation')
                    .length,
                )
          }
          detail="Na sua semana"
          icon="⌖"
        />
        <MetricCard
          label="Aguardando confirmação"
          value={
            loading
              ? '…'
              : String(
                  activeAppointments.filter((item) => item.status === 'pending').length,
                )
          }
          detail="Reservas na sua fila individual"
          icon="◷"
        />
      </section>

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
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
              <Badge variant="info">Somente sua agenda individual</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wide text-slate-500">
                Status:
              </span>
              <Badge variant="warning">Aguardando</Badge>
              <Badge variant="success">Confirmado</Badge>
              <Badge variant="info">Janela aberta</Badge>
              <Badge variant="neutral">Bloqueado / Cancelado</Badge>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 p-5" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
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
                      const cellKey = `${dateKey(date)}-${hour}`;
                      const cellAppointments = appointmentsByCell.get(cellKey) ?? [];
                      const cellSlots = (slotsByCell.get(cellKey) ?? []).filter(
                        (slot) =>
                          !cellAppointments.some(
                            (apt) =>
                              apt.availability_id === slot.id &&
                              apt.status !== 'cancelled',
                          ),
                      );
                      const hasContent =
                        cellAppointments.length > 0 || cellSlots.length > 0;

                      return (
                        <div className="border-l border-slate-100 p-2" key={cellKey}>
                          {hasContent ? (
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
                                      {formatTime(appointment.starts_at)}–
                                      {formatTime(appointment.ends_at)}
                                    </span>
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      <Badge variant={statusVariant(appointment.status)}>
                                        {statusLabels[appointment.status]}
                                      </Badge>
                                    </span>
                                  </Link>
                                </li>
                              ))}
                              {cellSlots.map((slot) => (
                                <li key={slot.id}>
                                  <div
                                    className={`rounded-xl border border-dashed p-2 text-left ${
                                      slot.is_blocked
                                        ? 'border-amber-300 bg-amber-50/70'
                                        : 'border-emerald-300 bg-[#e6f7f4]/60'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-[#153b50]">
                                      {slot.is_blocked ? (
                                        <>
                                          <Lock className="h-3 w-3 text-amber-700" />
                                          Bloqueado
                                        </>
                                      ) : (
                                        <>
                                          <CalendarCheck2 className="h-3 w-3 text-[#087a68]" />
                                          Janela aberta
                                        </>
                                      )}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-slate-600">
                                      {formatTime(slot.starts_at)}–
                                      {formatTime(slot.ends_at)}
                                    </span>
                                    {slot.is_blocked && slot.block_reason && (
                                      <span className="mt-0.5 block truncate text-[10px] text-amber-800">
                                        {slot.block_reason}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="grid h-full min-h-14 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
                              <span className="text-[11px] text-slate-400">
                                Sem janela
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
              Presencial / Janela aberta
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              Teleconsulta
            </span>
            <span>
              Cada veterinário visualiza e gerencia apenas os horários da própria agenda.
            </span>
          </div>
        </Card>

        <aside className="grid gap-4">
          <Card
            title="Comunicados da Minha Agenda"
            description="Cada veterinário recebe apenas notificações e resumos da própria agenda."
          >
            <div className="grid gap-3">
              {commsSchemaMissing ? (
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                  Aplique a migration #17 no Supabase para ativar o histórico de comunicados individuais no banco.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#ebf5ff] p-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#153b50]">
                      <BellRing className="h-4 w-4 text-[#087a68]" />
                      <span>
                        {unreadAgendaCount > 0
                          ? `${unreadAgendaCount} comunicado(s) não lido(s)`
                          : 'Comunicados individuais em dia'}
                      </span>
                    </div>
                    {outboxStats?.schemaReady && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                        <MailCheck className="h-3.5 w-3.5 text-[#087a68]" />
                        {outboxStats.emailQueued} na fila de e-mail
                      </span>
                    )}
                  </div>

                  {isVeterinarian && (
                    <Button
                      disabled={dispatching || loading}
                      onClick={() => void handleDispatchCommunicado()}
                      type="button"
                      variant="primary"
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      {dispatching
                        ? 'Gerando comunicado...'
                        : 'Enviar comunicado da minha agenda agora'}
                    </Button>
                  )}

                  {agendaNotifications.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                      Nenhum comunicado individual registrado ainda. Clique no botão acima ou aguarde novas reservas na sua agenda.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {agendaNotifications.slice(0, 4).map((item) => {
                        const meta = notificationKindLabel(item.kind);
                        return (
                          <li
                            className={`rounded-xl border p-3 ${
                              item.read_at
                                ? 'border-slate-200 bg-white'
                                : 'border-sky-200 bg-[#f6faff]'
                            }`}
                            key={item.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={meta.variant}>{meta.label}</Badge>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                <Clock className="h-3 w-3" />
                                {formatDateTimeShort(item.created_at)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs font-bold text-[#153b50]">
                              {item.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {item.body}
                            </p>
                            {!item.read_at && (
                              <button
                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#087a68] hover:underline"
                                onClick={() => void handleMarkNotificationRead(item.id)}
                                type="button"
                              >
                                <CheckCheck className="h-3 w-3" />
                                Marcar como lido
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <Link
                    className="inline-flex items-center justify-center text-xs font-bold text-[#0B68C2] hover:underline"
                    href="/notificacoes"
                  >
                    Ver central completa &amp; configurar Web Push →
                  </Link>
                </>
              )}
            </div>
          </Card>

          <Card
            title="Próximo atendimento"
            description="Próximo compromisso não cancelado da sua agenda individual."
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
                description="Não há consultas futuras na sua agenda esta semana."
              />
            )}
          </Card>
        </aside>
      </div>

      {!loading && !errorMessage && otherAppointments.length > 0 && (
        <Card
          className="mt-5"
          title="Outros horários desta semana"
          description="Consultas da sua agenda fora das faixas exibidas na grade."
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
