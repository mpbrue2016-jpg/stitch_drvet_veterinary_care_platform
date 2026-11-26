import type {
  Appointment,
  AvailabilitySlot,
  NotificationKind,
} from '../../types/entities';

export const VET_AGENDA_NOTIFICATION_KINDS: NotificationKind[] = [
  'vet_queue_new',
  'vet_agenda_reminder',
  'vet_agenda_summary',
  'appointment_cancelled',
];

export function isVetAgendaNotificationKind(kind: NotificationKind): boolean {
  return (
    kind === 'vet_queue_new' ||
    kind === 'vet_agenda_reminder' ||
    kind === 'vet_agenda_summary'
  );
}

export function filterAppointmentsForVeterinarian(
  appointments: Appointment[],
  veterinarianId: string,
): Appointment[] {
  if (!veterinarianId) return [];
  return appointments
    .filter((appointment) => appointment.veterinarian_id === veterinarianId)
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    );
}

export function filterAvailabilityForVeterinarian(
  slots: AvailabilitySlot[],
  veterinarianId: string,
): AvailabilitySlot[] {
  if (!veterinarianId) return [];
  return slots
    .filter((slot) => slot.veterinarian_id === veterinarianId)
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    );
}

export interface IndividualVetAgendaDigest {
  veterinarianId: string;
  veterinarianName: string;
  crmvLabel: string | null;
  confirmedNext7Days: number;
  pendingNext7Days: number;
  openFutureSlots: number;
  blockedFutureSlots: number;
  nextAppointment: {
    id: string;
    petName: string;
    kind: Appointment['kind'];
    status: Appointment['status'];
    startsAt: string;
  } | null;
  title: string;
  body: string;
}

function formatBrDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

export function buildIndividualVetAgendaDigest(params: {
  veterinarianId: string;
  veterinarianName: string;
  crmvLabel?: string | null;
  appointments: Appointment[];
  slots: AvailabilitySlot[];
  now?: Date;
}): IndividualVetAgendaDigest {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;

  const ownAppointments = filterAppointmentsForVeterinarian(
    params.appointments,
    params.veterinarianId,
  );
  const ownSlots = filterAvailabilityForVeterinarian(
    params.slots,
    params.veterinarianId,
  );

  const next7DaysAppointments = ownAppointments.filter((appointment) => {
    const startMs = new Date(appointment.starts_at).getTime();
    return (
      startMs >= nowMs - 5 * 60_000 &&
      startMs <= sevenDaysMs &&
      (appointment.status === 'confirmed' || appointment.status === 'pending')
    );
  });

  const confirmedNext7Days = next7DaysAppointments.filter(
    (item) => item.status === 'confirmed',
  ).length;
  const pendingNext7Days = next7DaysAppointments.filter(
    (item) => item.status === 'pending',
  ).length;

  const futureSlots = ownSlots.filter(
    (slot) =>
      new Date(slot.starts_at).getTime() > nowMs &&
      new Date(slot.starts_at).getTime() <= sevenDaysMs,
  );
  const openFutureSlots = futureSlots.filter(
    (slot) => slot.is_available && !slot.is_blocked,
  ).length;
  const blockedFutureSlots = futureSlots.filter((slot) => slot.is_blocked).length;

  const nextApt = ownAppointments.find(
    (item) =>
      (item.status === 'confirmed' || item.status === 'pending') &&
      new Date(item.ends_at).getTime() >= nowMs,
  );

  const safeVetName = params.veterinarianName.trim() || 'Veterinário(a)';
  const title = `Comunicado da Agenda Individual · ${safeVetName}`;

  const summaryHeader =
    `Próximos 7 dias da sua agenda` +
    (params.crmvLabel ? ` (${params.crmvLabel})` : '') +
    `: ${confirmedNext7Days} confirmada(s), ${pendingNext7Days} pendente(s), ` +
    `${openFutureSlots} janela(s) aberta(s)` +
    (blockedFutureSlots > 0 ? ` e ${blockedFutureSlots} bloqueada(s)` : '') +
    `.`;

  const body = nextApt
    ? `${summaryHeader} Próximo atendimento: ${nextApt.pet?.name ?? 'Paciente'} (${
        nextApt.kind === 'teleconsultation' ? 'Teleconsulta' : 'Presencial'
      }) em ${formatBrDateTime(nextApt.starts_at)}.`
    : `${summaryHeader} Nenhum atendimento futuro reservado até o momento.`;

  return {
    veterinarianId: params.veterinarianId,
    veterinarianName: safeVetName,
    crmvLabel: params.crmvLabel ?? null,
    confirmedNext7Days,
    pendingNext7Days,
    openFutureSlots,
    blockedFutureSlots,
    nextAppointment: nextApt
      ? {
          id: nextApt.id,
          petName: nextApt.pet?.name ?? 'Paciente',
          kind: nextApt.kind,
          status: nextApt.status,
          startsAt: nextApt.starts_at,
        }
      : null,
    title,
    body,
  };
}

export interface VetConsultationSummary {
  todayTotal: number;
  waiting: number;
  inProgress: number;
  completed: number;
  todayWaiting: number;
  todayInProgress: number;
  todayCompleted: number;
  pendingConfirmation: number;
  referenceDateKey: string;
}

const DEFAULT_CLINIC_TIME_ZONE = 'America/Sao_Paulo';

export function toClinicDateKey(
  dateInput: Date | string,
  timeZone = DEFAULT_CLINIC_TIME_ZONE,
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function summarizeVetConsultations(params: {
  appointments: Appointment[];
  inProgressAppointmentIds?: Iterable<string>;
  veterinarianId?: string;
  now?: Date;
  timeZone?: string;
}): VetConsultationSummary {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const timeZone = params.timeZone ?? DEFAULT_CLINIC_TIME_ZONE;
  const referenceDateKey = toClinicDateKey(now, timeZone);

  const scopedAppointments = params.veterinarianId
    ? filterAppointmentsForVeterinarian(params.appointments, params.veterinarianId)
    : params.appointments;

  const activeSessionIds = new Set(params.inProgressAppointmentIds ?? []);

  let todayTotal = 0;
  let waiting = 0;
  let inProgress = 0;
  let completed = 0;
  let todayWaiting = 0;
  let todayInProgress = 0;
  let todayCompleted = 0;
  let pendingConfirmation = 0;

  for (const appointment of scopedAppointments) {
    if (appointment.status === 'cancelled') {
      continue;
    }

    const isToday = toClinicDateKey(appointment.starts_at, timeZone) === referenceDateKey;
    if (isToday) {
      todayTotal += 1;
    }

    if (appointment.status === 'completed') {
      completed += 1;
      if (isToday) todayCompleted += 1;
      continue;
    }

    const startMs = new Date(appointment.starts_at).getTime();
    const endMs = new Date(appointment.ends_at).getTime();
    const isWindowActive =
      appointment.status === 'confirmed' &&
      !Number.isNaN(startMs) &&
      !Number.isNaN(endMs) &&
      startMs <= nowMs &&
      endMs >= nowMs;

    if (activeSessionIds.has(appointment.id) || isWindowActive) {
      inProgress += 1;
      if (isToday) todayInProgress += 1;
      continue;
    }

    waiting += 1;
    if (isToday) todayWaiting += 1;
    if (appointment.status === 'pending') {
      pendingConfirmation += 1;
    }
  }

  return {
    todayTotal,
    waiting,
    inProgress,
    completed,
    todayWaiting,
    todayInProgress,
    todayCompleted,
    pendingConfirmation,
    referenceDateKey,
  };
}

export const DEFAULT_DAILY_CONSULTATION_GOAL = 8;
export const MIN_DAILY_CONSULTATION_GOAL = 1;
export const MAX_DAILY_CONSULTATION_GOAL = 40;
export const DAILY_CONSULTATION_GOAL_PRESETS = [4, 6, 8, 10, 12, 15, 20] as const;

export function clampDailyConsultationGoal(
  value: unknown,
  fallback = DEFAULT_DAILY_CONSULTATION_GOAL,
): number {
  const safeFallback =
    typeof fallback === 'number' &&
    Number.isFinite(fallback) &&
    fallback >= MIN_DAILY_CONSULTATION_GOAL &&
    fallback <= MAX_DAILY_CONSULTATION_GOAL
      ? Math.round(fallback)
      : DEFAULT_DAILY_CONSULTATION_GOAL;

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return safeFallback;
  }

  return Math.min(
    MAX_DAILY_CONSULTATION_GOAL,
    Math.max(MIN_DAILY_CONSULTATION_GOAL, Math.round(parsed)),
  );
}

export function getVetDailyGoalStorageKey(veterinarianId?: string | null): string {
  const normalizedId = veterinarianId?.trim() || 'default';
  return `drvet:vet-daily-goal:v1:${normalizedId}`;
}

export function parseStoredDailyConsultationGoal(
  raw: string | null | undefined,
  fallback = DEFAULT_DAILY_CONSULTATION_GOAL,
): number {
  if (!raw) return clampDailyConsultationGoal(fallback);
  return clampDailyConsultationGoal(raw, fallback);
}

export function buildDailyGoalSelectOptions(currentGoal: number): number[] {
  const safeCurrent = clampDailyConsultationGoal(currentGoal);
  const values = new Set<number>([...DAILY_CONSULTATION_GOAL_PRESETS, safeCurrent]);
  return Array.from(values).sort((a, b) => a - b);
}

export interface DailyConsultationGoalProgress {
  goal: number;
  todayTotal: number;
  percent: number;
  rawPercent: number;
  remaining: number;
  exceededBy: number;
  reached: boolean;
}

export function calculateDailyGoalProgress(
  todayTotal: number,
  dailyGoal: unknown,
): DailyConsultationGoalProgress {
  const goal = clampDailyConsultationGoal(dailyGoal);
  const safeTodayTotal =
    typeof todayTotal === 'number' && Number.isFinite(todayTotal)
      ? Math.max(0, Math.floor(todayTotal))
      : 0;
  const rawPercent = Math.round((safeTodayTotal / goal) * 100);
  const percent = Math.min(100, Math.max(0, rawPercent));
  const remaining = Math.max(0, goal - safeTodayTotal);
  const exceededBy = Math.max(0, safeTodayTotal - goal);

  return {
    goal,
    todayTotal: safeTodayTotal,
    percent,
    rawPercent,
    remaining,
    exceededBy,
    reached: safeTodayTotal >= goal,
  };
}


