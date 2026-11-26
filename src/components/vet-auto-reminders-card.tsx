'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { Button, Card, Skeleton, Toast } from '@/components/ui';
import {
  describeVetReminderChannel,
  filterAppointmentsDueForVet30MinReminder,
  shouldSendPushForChannel,
  shouldSendWhatsappForChannel,
} from '@/lib/notifications/vet-reminders';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  fetchVet30MinReminders,
  showLocalServiceWorkerNotification,
  syncVet30MinReminders,
  type Vet30MinRemindersPayload,
  type VetReminderChannel,
} from '@/services/push.service';
import type { Appointment, PushNotificationItem } from '@/types/entities';

export interface VetAutoRemindersCardProps {
  appointments: Appointment[];
  veterinarianEmail?: string | null;
  veterinarianPhone?: string | null;
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function VetAutoRemindersCard({
  appointments,
  veterinarianEmail = null,
  veterinarianPhone = null,
}: VetAutoRemindersCardProps) {
  const configured = isSupabaseConfigured();
  const [payload, setPayload] = useState<Vet30MinRemindersPayload | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [phoneInput, setPhoneInput] = useState(veterinarianPhone ?? '');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const shownLocalIdsRef = useRef<Set<string>>(new Set());

  const enabled = payload?.enabled ?? true;
  const channel: VetReminderChannel = payload?.channel ?? 'both';
  const activePhone = payload?.recipientPhone ?? veterinarianPhone ?? null;
  const recentReminders: PushNotificationItem[] = payload?.recentReminders ?? [];
  const upcomingWithin30Min = filterAppointmentsDueForVet30MinReminder(appointments);

  useEffect(() => {
    const resolved = payload?.recipientPhone ?? veterinarianPhone ?? '';
    setPhoneInput(resolved);
  }, [payload?.recipientPhone, veterinarianPhone]);

  const notifyCreatedLocallyIfAllowed = useCallback(
    async (
      items: PushNotificationItem[] | undefined,
      activeChannel: VetReminderChannel,
    ) => {
      if (!items || items.length === 0 || !shouldSendPushForChannel(activeChannel)) {
        return;
      }
      for (const item of items) {
        if (shownLocalIdsRef.current.has(item.id)) continue;
        shownLocalIdsRef.current.add(item.id);
        await showLocalServiceWorkerNotification({
          title: item.title,
          body: item.body,
          url: item.action_url,
          tag: `vet-30m-${item.id}`,
        });
      }
    },
    [],
  );

  const loadReminders = useCallback(
    async (sync = true) => {
      if (!configured) {
        setLoading(false);
        return;
      }
      try {
        const result = await fetchVet30MinReminders(sync);
        setPayload(result);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Não foi possível consultar os lembretes automáticos.',
        );
      } finally {
        setLoading(false);
      }
    },
    [configured],
  );

  useEffect(() => {
    void loadReminders(true);
  }, [loadReminders]);

  useEffect(() => {
    if (!configured || !enabled || payload?.schemaMissing) return;

    const timer = window.setInterval(() => {
      void syncVet30MinReminders({ syncNow: true })
        .then((res) => {
          setPayload((prev) => ({
            ...res,
            recentReminders:
              res.createdNotifications && res.createdNotifications.length > 0
                ? [
                    ...res.createdNotifications,
                    ...(prev?.recentReminders ?? []).filter(
                      (existing) =>
                        !res.createdNotifications?.some((n) => n.id === existing.id),
                    ),
                  ].slice(0, 10)
                : prev?.recentReminders ?? [],
          }));
          void notifyCreatedLocallyIfAllowed(res.createdNotifications, res.channel);
        })
        .catch(() => null);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [configured, enabled, notifyCreatedLocallyIfAllowed, payload?.schemaMissing]);

  async function handleUpdatePreferences(patch: {
    channel?: VetReminderChannel;
    enabled?: boolean;
    syncNow?: boolean;
    whatsappPhone?: string | null;
  }) {
    if (!configured) return;
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const res = await syncVet30MinReminders({
        channel: patch.channel ?? channel,
        enabled: patch.enabled ?? enabled,
        syncNow: patch.syncNow ?? true,
        ...(patch.whatsappPhone !== undefined
          ? { whatsappPhone: patch.whatsappPhone }
          : {}),
      });

      setPayload((prev) => ({
        ...res,
        recentReminders:
          res.createdNotifications && res.createdNotifications.length > 0
            ? [
                ...res.createdNotifications,
                ...(prev?.recentReminders ?? []).filter(
                  (existing) =>
                    !res.createdNotifications?.some((n) => n.id === existing.id),
                ),
              ].slice(0, 10)
            : prev?.recentReminders ?? [],
      }));

      await notifyCreatedLocallyIfAllowed(res.createdNotifications, res.channel);

      if (res.summary.triggeredCount > 0) {
        setNotice(
          `${res.summary.triggeredCount} lembrete(s) de 30 min disparado(s) (${res.summary.pushDelivered} push · ${res.summary.emailSent} e-mail · ${res.summary.whatsappSent} WhatsApp enviado(s), ${res.summary.emailQueued + res.summary.whatsappQueued} na fila).`,
        );
      } else if (patch.whatsappPhone !== undefined) {
        setNotice(
          res.recipientPhone
            ? `Número WhatsApp (${res.recipientPhone}) salvo para os lembretes.`
            : 'Número WhatsApp removido dos lembretes automáticos.',
        );
      } else if (patch.enabled !== undefined || patch.channel !== undefined) {
        setNotice('Preferência de lembrete automático de 30 minutos salva.');
      } else {
        setNotice(
          res.summary.dueAppointmentsCount > 0
            ? 'Os lembretes das consultas nos próximos 30 minutos já foram entregues.'
            : 'Nenhuma consulta agendada nos próximos 30 minutos.',
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar os lembretes automáticos.',
      );
    } finally {
      setBusy(false);
    }
  }

  const whatsappActiveSelected = shouldSendWhatsappForChannel(channel);

  return (
    <Card
      className="mb-6"
      description="Disparo automático por Web Push, e-mail e/ou WhatsApp (Twilio) 30 minutos antes de cada consulta agendada."
      title="Lembretes Automáticos (30 min antes)"
    >
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
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#F9FBFC] p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EBF5FF] text-[#153B50]"
              >
                <BellRing className="h-4 w-4" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[#153B50]">
                    Aviso prévio de 30 minutos por consulta
                  </p>
                  <span className="text-xs font-semibold text-[#087A68] tabular-nums">
                    {upcomingWithin30Min.length} na janela atual
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Canal ativo:{' '}
                  <strong className="text-[#153B50]">
                    {describeVetReminderChannel(channel)}
                  </strong>
                  {veterinarianEmail || payload?.recipientEmail
                    ? ` · ${payload?.recipientEmail ?? veterinarianEmail}`
                    : ''}
                  {activePhone ? ` · ${activePhone}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="sr-only" htmlFor="vet-reminder-channel-select">
                Canal do lembrete automático de 30 minutos
              </label>
              <select
                aria-label="Canal do lembrete automático de 30 minutos"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#153B50] focus:border-[#153B50] focus:outline-none"
                disabled={busy || !configured}
                id="vet-reminder-channel-select"
                onChange={(event) =>
                  void handleUpdatePreferences({
                    channel: event.target.value as VetReminderChannel,
                    syncNow: false,
                  })
                }
                value={channel}
              >
                <option value="all">Push, E-mail e WhatsApp</option>
                <option value="both">Push e E-mail</option>
                <option value="push_whatsapp">Push e WhatsApp</option>
                <option value="email_whatsapp">E-mail e WhatsApp</option>
                <option value="whatsapp">Somente WhatsApp</option>
                <option value="push">Somente Web Push</option>
                <option value="email">Somente E-mail</option>
              </select>

              <button
                aria-checked={enabled}
                aria-label="Ativar lembretes automáticos 30 minutos antes"
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                  enabled ? 'bg-[#087A68]' : 'bg-slate-300'
                }`}
                disabled={busy || !configured}
                onClick={() =>
                  void handleUpdatePreferences({
                    enabled: !enabled,
                    syncNow: !enabled,
                  })
                }
                role="switch"
                type="button"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>

              <Button
                disabled={busy || !configured || !enabled}
                onClick={() => void handleUpdatePreferences({ syncNow: true })}
                type="button"
                variant="outline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Verificar agora
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#087A68]" />
              <div>
                <p className="font-bold text-[#153B50]">WhatsApp para lembretes Twilio</p>
                <p className="mt-0.5">
                  Informe o número com DDD (ex: +55 11 99999-8888).{' '}
                  {whatsappActiveSelected && !activePhone
                    ? 'Cadastre um número para receber alertas de consultas agendadas no WhatsApp.'
                    : activePhone
                      ? `Destino configurado: ${activePhone}.`
                      : 'Usará também como telefone principal do perfil.'}
                </p>
              </div>
            </div>

            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleUpdatePreferences({
                  whatsappPhone: phoneInput.trim(),
                  syncNow: false,
                });
              }}
            >
              <label className="sr-only" htmlFor="vet-reminder-whatsapp-phone">
                Telefone WhatsApp com DDD
              </label>
              <input
                className="h-10 w-52 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-[#153B50] tabular-nums focus:border-[#153B50] focus:outline-none"
                disabled={busy || !configured}
                id="vet-reminder-whatsapp-phone"
                maxLength={32}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+55 11 99999-8888"
                type="tel"
                value={phoneInput}
              />
              <Button disabled={busy || !configured} type="submit" variant="outline">
                Salvar WhatsApp
              </Button>
            </form>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#087A68]" />
              <div>
                <p className="font-bold text-[#153B50]">Web Push no navegador</p>
                <p className="mt-0.5">
                  Alerta imediato 30 min antes.{' '}
                  <Link className="font-semibold text-[#087A68] hover:underline" href="/notificacoes">
                    Gerenciar dispositivos →
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#153B50]" />
              <div>
                <p className="font-bold text-[#153B50]">Lembrete por E-mail</p>
                <p className="mt-0.5">
                  {payload?.emailProviderConfigured
                    ? 'Envio transacional direto ativado no servidor.'
                    : 'Registrado automaticamente na fila de e-mail do servidor.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#087A68]" />
              <div>
                <p className="font-bold text-[#153B50]">WhatsApp via Twilio</p>
                <p className="mt-0.5">
                  {payload?.whatsappProviderConfigured
                    ? 'API Twilio Messages ativada para lembretes de consultas.'
                    : 'Registrado na fila WhatsApp do servidor aguardando credenciais Twilio.'}
                </p>
              </div>
            </div>
          </div>

          {recentReminders.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                Últimos lembretes de 30 minutos disparados
              </p>
              <ul className="grid gap-2">
                {recentReminders.slice(0, 3).map((item) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-[#F9FBFC] px-3 py-2 text-xs"
                    key={item.id}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#087A68]" />
                      <span className="truncate font-semibold text-[#153B50]">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums text-slate-500">
                      <span>{formatShortTime(item.created_at)}</span>
                      <Link
                        className="font-bold text-[#087A68] hover:underline"
                        href={item.action_url || '/agenda'}
                      >
                        Abrir
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
