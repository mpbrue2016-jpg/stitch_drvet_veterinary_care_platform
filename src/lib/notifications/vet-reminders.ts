import type { Appointment } from '../../types/entities';

export const VET_REMINDER_LEAD_MINUTES = 30;
export const VET_REMINDER_WINDOW_PAST_BUFFER_MS = 5 * 60_000;
export const VET_REMINDER_WINDOW_FUTURE_MS = VET_REMINDER_LEAD_MINUTES * 60_000;

export type VetReminderChannel =
  | 'all'
  | 'both'
  | 'push'
  | 'email'
  | 'whatsapp'
  | 'push_whatsapp'
  | 'email_whatsapp';

const VALID_VET_REMINDER_CHANNELS: readonly VetReminderChannel[] = [
  'all',
  'both',
  'push',
  'email',
  'whatsapp',
  'push_whatsapp',
  'email_whatsapp',
];

export function normalizeVetReminderChannel(
  value: unknown,
  fallback: VetReminderChannel = 'both',
): VetReminderChannel {
  if (
    typeof value === 'string' &&
    (VALID_VET_REMINDER_CHANNELS as readonly string[]).includes(value)
  ) {
    return value as VetReminderChannel;
  }
  return fallback;
}

export function shouldSendPushForChannel(channel: VetReminderChannel): boolean {
  return (
    channel === 'all' ||
    channel === 'both' ||
    channel === 'push' ||
    channel === 'push_whatsapp'
  );
}

export function shouldSendEmailForChannel(channel: VetReminderChannel): boolean {
  return (
    channel === 'all' ||
    channel === 'both' ||
    channel === 'email' ||
    channel === 'email_whatsapp'
  );
}

export function shouldSendWhatsappForChannel(channel: VetReminderChannel): boolean {
  return (
    channel === 'all' ||
    channel === 'whatsapp' ||
    channel === 'push_whatsapp' ||
    channel === 'email_whatsapp'
  );
}

export function describeVetReminderChannel(channel: VetReminderChannel): string {
  switch (channel) {
    case 'all':
      return 'Web Push, E-mail e WhatsApp';
    case 'both':
      return 'Web Push e E-mail';
    case 'push':
      return 'Somente Web Push';
    case 'email':
      return 'Somente E-mail';
    case 'whatsapp':
      return 'Somente WhatsApp';
    case 'push_whatsapp':
      return 'Web Push e WhatsApp';
    case 'email_whatsapp':
      return 'E-mail e WhatsApp';
  }
}

export function normalizeWhatsappPhoneToE164(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;

  if (cleaned.toLowerCase().startsWith('whatsapp:')) {
    cleaned = cleaned.slice(9).trim();
  }

  // Reject clearly non-phone payloads (letters, HTML, control characters)
  if (/[a-zA-Z<>]/.test(cleaned)) {
    return null;
  }

  const hasExplicitPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;

  if (hasExplicitPlus) {
    if (digits.length < 10 || digits.length > 15 || digits.startsWith('0')) {
      return null;
    }
    return `+${digits}`;
  }

  // Brazil local numbers: DDD (2 digits) + 8 or 9 digits => prepend +55
  if (digits.length === 10 || digits.length === 11) {
    if (digits.startsWith('0')) return null;
    return `+55${digits}`;
  }

  // Brazil E.164 without leading '+': 55 + DDD (2) + 8/9 digits
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith('55')
  ) {
    return `+${digits}`;
  }

  return null;
}

export function formatTwilioWhatsappAddress(
  raw: string | null | undefined,
): string | null {
  const e164 = normalizeWhatsappPhoneToE164(raw);
  return e164 ? `whatsapp:${e164}` : null;
}

export function isVetAutoReminderEnabled(value: unknown): boolean {
  return value !== false && value !== 'false';
}

export function getVet30MinReminderDedupeKey(appointmentId: string): string {
  return `vet-reminder-${appointmentId}-${VET_REMINDER_LEAD_MINUTES}`;
}

export function filterAppointmentsDueForVet30MinReminder<
  T extends Pick<Appointment, 'id' | 'status' | 'starts_at'>,
>(appointments: T[], now: Date = new Date()): T[] {
  const nowMs = now.getTime();
  const minStartMs = nowMs - VET_REMINDER_WINDOW_PAST_BUFFER_MS;
  const maxStartMs = nowMs + VET_REMINDER_WINDOW_FUTURE_MS;

  return appointments
    .filter((appointment) => {
      if (appointment.status !== 'confirmed' && appointment.status !== 'pending') {
        return false;
      }
      const startMs = new Date(appointment.starts_at).getTime();
      if (Number.isNaN(startMs)) return false;
      return startMs > minStartMs && startMs <= maxStartMs;
    })
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    );
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface Vet30MinReminderContent {
  dedupeKey: string;
  title: string;
  body: string;
  actionUrl: string;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
  whatsappText: string;
}

export function buildVet30MinReminderContent(params: {
  appointment: Pick<Appointment, 'id' | 'kind' | 'status' | 'starts_at'>;
  petName?: string | null;
  tutorName?: string | null;
  veterinarianName?: string | null;
  timeZone?: string;
}): Vet30MinReminderContent {
  const timeZone = params.timeZone ?? 'America/Sao_Paulo';
  const startDate = new Date(params.appointment.starts_at);
  const formattedTime = Number.isNaN(startDate.getTime())
    ? '--:--'
    : new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      }).format(startDate);
  const formattedDateTime = Number.isNaN(startDate.getTime())
    ? params.appointment.starts_at
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone,
      }).format(startDate);

  const safePetName = params.petName?.trim() || 'Paciente';
  const safeTutorName = params.tutorName?.trim() || null;
  const safeVetName = params.veterinarianName?.trim() || 'Veterinário(a)';
  const modalityLabel =
    params.appointment.kind === 'teleconsultation'
      ? 'Teleconsulta'
      : 'Atendimento presencial';
  const statusLabel =
    params.appointment.status === 'confirmed'
      ? 'confirmado'
      : 'aguardando confirmação';

  const dedupeKey = getVet30MinReminderDedupeKey(params.appointment.id);
  const title = `Sua agenda individual: ${safePetName} às ${formattedTime}`;
  const body = `${modalityLabel} (${statusLabel}) em cerca de 30 minutos (${formattedDateTime}).`;
  const actionUrl =
    params.appointment.kind === 'teleconsultation'
      ? `/teleconsulta?appointmentId=${params.appointment.id}`
      : '/agenda';

  const emailSubject = `[DrVet] Lembrete (30 min): ${safePetName} às ${formattedTime}`;
  const tutorSuffix = safeTutorName ? ` · Tutor(a): ${safeTutorName}` : '';
  const emailText = [
    `Olá, ${safeVetName}.`,
    '',
    `Você tem um atendimento agendado para daqui a aproximadamente 30 minutos:`,
    `- Paciente: ${safePetName}${tutorSuffix}`,
    `- Modalidade: ${modalityLabel}`,
    `- Status: ${statusLabel}`,
    `- Horário: ${formattedDateTime}`,
    '',
    `Acesse sua agenda ou sala clínica no painel DrVet (${actionUrl}).`,
  ].join('\n');

  const emailHtml = [
    `<div style="font-family:system-ui,-apple-system,sans-serif;color:#153B50;line-height:1.5;max-width:560px">`,
    `<h2 style="margin:0 0 12px;font-size:18px">Lembrete automático de consulta (30 min)</h2>`,
    `<p style="margin:0 0 12px">Olá, <strong>${escapeHtml(safeVetName)}</strong>.</p>`,
    `<p style="margin:0 0 12px">Seu próximo atendimento na agenda individual está previsto para <strong>${escapeHtml(formattedDateTime)}</strong>:</p>`,
    `<ul style="margin:0 0 16px;padding-left:20px">`,
    `<li><strong>Paciente:</strong> ${escapeHtml(safePetName)}${safeTutorName ? ` (${escapeHtml(safeTutorName)})` : ''}</li>`,
    `<li><strong>Modalidade:</strong> ${escapeHtml(modalityLabel)}</li>`,
    `<li><strong>Status:</strong> ${escapeHtml(statusLabel)}</li>`,
    `</ul>`,
    `<p style="margin:0;color:#475569;font-size:13px">Acesse seu painel DrVet para abrir a agenda ou a sala de atendimento.</p>`,
    `</div>`,
  ].join('');

  const whatsappText = [
    `*DrVet · Lembrete de Consulta (30 min)*`,
    `Olá, ${safeVetName}.`,
    `Seu atendimento na agenda individual começa em cerca de 30 minutos:`,
    `• Paciente: ${safePetName}${tutorSuffix}`,
    `• Modalidade: ${modalityLabel}`,
    `• Status: ${statusLabel}`,
    `• Horário: ${formattedDateTime}`,
    '',
    `Painel DrVet: ${actionUrl}`,
  ].join('\n');

  return {
    dedupeKey,
    title,
    body,
    actionUrl,
    emailSubject,
    emailText,
    emailHtml,
    whatsappText,
  };
}

export function buildAppointmentWhatsappReminderText(params: {
  title: string;
  body: string;
  actionUrl?: string | null;
  recipientName?: string | null;
}): string {
  const safeName = params.recipientName?.trim();
  const safeUrl = params.actionUrl?.trim() || '/agendamento';
  return [
    `*DrVet · ${params.title}*`,
    ...(safeName ? [`Olá, ${safeName}.`] : []),
    params.body,
    '',
    `Acesse: ${safeUrl}`,
  ].join('\n');
}
