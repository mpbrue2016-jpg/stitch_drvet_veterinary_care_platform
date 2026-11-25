'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCheck,
  Clock,
  ExternalLink,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Stethoscope,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DemoNotice,
  EmptyState,
  MetricCard,
  PageHeader,
  Skeleton,
  Toast,
} from '@/components/ui';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import type { LeadMinutesOption } from '@/services/push.service';
import type { PushNotificationItem } from '@/types/entities';

type HistoryFilter = 'all' | 'tutor' | 'vet';

const LEAD_TIME_OPTIONS: { value: LeadMinutesOption; label: string }[] = [
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 1440, label: '24 horas antes' },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatLeadTimeLabel(minutes: number) {
  if (minutes === 1440) return '24 horas';
  if (minutes >= 60) return `${minutes / 60}h`;
  return `${minutes} min`;
}

function getKindMeta(kind: PushNotificationItem['kind']) {
  switch (kind) {
    case 'vet_queue_new':
      return {
        label: 'Fila Veterinária',
        variant: 'warning' as const,
      };
    case 'appointment_reminder':
      return {
        label: 'Lembrete de Consulta',
        variant: 'info' as const,
      };
    case 'appointment_confirmed':
      return {
        label: 'Consulta Confirmada',
        variant: 'success' as const,
      };
    case 'appointment_cancelled':
      return {
        label: 'Consulta Cancelada',
        variant: 'neutral' as const,
      };
    default:
      return {
        label: 'Teste / Sistema',
        variant: 'info' as const,
      };
  }
}

export function NotificationCenter() {
  const {
    authenticated,
    busy,
    clearFeedback,
    configured,
    disablePush,
    enablePush,
    errorMessage,
    isPushEnabledOnThisDevice,
    loading,
    markAllRead,
    markAsRead,
    notice,
    notifications,
    outboxSummary,
    permission,
    preferences,
    refresh,
    schemaMissing,
    sendTestPush,
    subscriptions,
    supported,
    unreadCount,
    updatePreferences,
    vapidConfiguredFromEnv,
  } = usePushNotifications();

  const [filter, setFilter] = useState<HistoryFilter>('all');

  const filteredNotifications = useMemo(() => {
    if (filter === 'tutor') {
      return notifications.filter(
        (item) =>
          item.kind === 'appointment_reminder' ||
          item.kind === 'appointment_confirmed' ||
          item.kind === 'appointment_cancelled',
      );
    }
    if (filter === 'vet') {
      return notifications.filter((item) => item.kind === 'vet_queue_new');
    }
    return notifications;
  }, [filter, notifications]);

  const permissionLabel = !supported
    ? 'Sem suporte Push'
    : permission === 'granted'
      ? isPushEnabledOnThisDevice
        ? 'Ativo'
        : 'Permitido'
      : permission === 'denied'
        ? 'Bloqueado'
        : 'Pendente';

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loading || busy}
              onClick={() => void refresh(true)}
              type="button"
              variant="outline"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Sincronizar lembretes
            </Button>
            {isPushEnabledOnThisDevice ? (
              <Button
                disabled={busy || schemaMissing}
                onClick={() => void disablePush()}
                type="button"
                variant="outline"
              >
                <BellOff className="mr-1.5 h-4 w-4" />
                Desativar neste aparelho
              </Button>
            ) : (
              <Button
                disabled={!supported || permission === 'denied' || busy || schemaMissing || !authenticated}
                onClick={() => void enablePush()}
                type="button"
                variant="secondary"
              >
                <BellRing className="mr-1.5 h-4 w-4" />
                {busy ? 'Ativando...' : 'Ativar notificações Push'}
              </Button>
            )}
          </div>
        }
        description="Alertas Web Push e em tempo real para avisar tutores sobre o horário das consultas e veterinários sobre novos pedidos na fila."
        title="Notificações Push & Lembretes"
      />

      {!configured && <DemoNotice />}

      {notice && (
        <Toast message={notice} onDismiss={clearFeedback} variant="success" />
      )}
      {errorMessage && (
        <Toast message={errorMessage} onDismiss={clearFeedback} variant="danger" />
      )}

      {schemaMissing && (
        <Card
          description="As tabelas push_subscriptions e notifications pertencem à Migration 12 do DrVet."
          title="Estrutura de notificações pendente no banco"
        >
          <div className="flex items-start gap-3 text-sm text-slate-700">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p>
              A conexão com o Supabase está ativa, porém as tabelas de Push Notifications ainda não foram inicializadas no schema remoto.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          detail={
            isPushEnabledOnThisDevice
              ? 'Service Worker /sw.js conectado'
              : permission === 'denied'
                ? 'Desbloqueie nas permissões do site'
                : 'Clique em Ativar notificações Push'
          }
          icon="🔔"
          label="Status neste navegador"
          value={loading ? '…' : permissionLabel}
        />
        <MetricCard
          detail="Navegadores vinculados à sua conta"
          icon="📱"
          label="Dispositivos ativos"
          value={
            loading
              ? '…'
              : String(subscriptions.filter((item) => item.is_active).length)
          }
        />
        <MetricCard
          detail="Janela de aviso para tutores"
          icon="⏱"
          label="Antecedência do lembrete"
          value={loading ? '…' : formatLeadTimeLabel(preferences.reminderLeadMinutes)}
        />
        <MetricCard
          detail="Eventos clínicos e da fila"
          icon="📬"
          label="Alertas não lidos"
          value={loading ? '…' : String(unreadCount)}
        />
      </div>

      {outboxSummary && (
        <Card
          description="Rastreamento da fila notification_outbox (migration #15) para e-mail transacional e Web Push."
          title="Fila Multicanal (Outbox)"
        >
          {outboxSummary.schemaReady ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
              <Badge variant="info">
                Na fila (E-mail/Worker): {outboxSummary.queued}
              </Badge>
              <Badge variant="success">Entregues: {outboxSummary.sent}</Badge>
              <Badge variant={outboxSummary.failed > 0 ? 'warning' : 'neutral'}>
                Falhas: {outboxSummary.failed}
              </Badge>
              <span className="text-slate-500">
                Disparos de e-mail aguardam worker transacional com provedor SMTP/Resend configurado.
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Tabela <code>notification_outbox</code> aguardando aplicação da migration #15 para histórico multicanal de e-mail e push.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          description="Configurações aplicáveis a tutores com consultas marcadas."
          title="Lembretes de Consultas do Tutor"
        >
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f6faff] p-4">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#0B68C2]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#153b50]">
                  Avisos de horário, confirmação e cancelamento
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Dispara lembrete automático antes da consulta e alerta assim que o veterinário confirmar ou atualizar o agendamento.
                </p>
              </div>
              <button
                aria-checked={preferences.notifyAppointments}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                  preferences.notifyAppointments ? 'bg-[#087a68]' : 'bg-slate-300'
                }`}
                disabled={busy || subscriptions.length === 0 || schemaMissing}
                onClick={() =>
                  void updatePreferences({
                    notifyAppointments: !preferences.notifyAppointments,
                  })
                }
                role="switch"
                type="button"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    preferences.notifyAppointments ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"
                htmlFor="lead-minutes"
              >
                <Clock className="h-3.5 w-3.5" />
                Antecedência padrão do lembrete
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {LEAD_TIME_OPTIONS.map((option) => {
                  const selected = preferences.reminderLeadMinutes === option.value;
                  return (
                    <button
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        selected
                          ? 'border-[#087a68] bg-[#e6f7f4] text-[#087a68]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      disabled={busy || subscriptions.length === 0 || schemaMissing}
                      key={option.value}
                      onClick={() =>
                        void updatePreferences({ reminderLeadMinutes: option.value })
                      }
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">
                {subscriptions.length === 0
                  ? 'Ative o Push acima para personalizar este aparelho.'
                  : 'Preferência sincronizada no Supabase.'}
              </span>
              <Button
                disabled={busy || schemaMissing || !authenticated}
                onClick={() => void sendTestPush('tutor')}
                type="button"
                variant="outline"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Testar alerta do tutor
              </Button>
            </div>
          </div>
        </Card>

        <Card
          description="Configurações aplicáveis a médicos-veterinários com fila ativa."
          title="Alertas da Fila Veterinária"
        >
          <div className="grid gap-4">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f6faff] p-4">
              <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-[#087a68]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#153b50]">
                  Aviso instantâneo de nova solicitação na fila
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Sempre que um tutor reservar uma teleconsulta ou atendimento presencial com você, o trigger SQL gera o alerta em tempo real e envia Push para seus dispositivos inscritos.
                </p>
              </div>
              <button
                aria-checked={preferences.notifyQueue}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                  preferences.notifyQueue ? 'bg-[#087a68]' : 'bg-slate-300'
                }`}
                disabled={busy || subscriptions.length === 0 || schemaMissing}
                onClick={() =>
                  void updatePreferences({
                    notifyQueue: !preferences.notifyQueue,
                  })
                }
                role="switch"
                type="button"
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    preferences.notifyQueue ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600">
              <p className="font-bold text-[#153b50]">Criptografia VAPID &amp; Segurança</p>
              <p className="mt-1">
                {vapidConfiguredFromEnv
                  ? 'Chaves VAPID fixas carregadas do servidor (.env) para entrega em segundo plano.'
                  : 'Modo de chave VAPID de sessão ativa. Para manter as mesmas chaves entre reinicializações em produção, defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no ambiente.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <Link
                className="text-xs font-bold text-[#0B68C2] hover:underline"
                href="/painel/veterinario"
              >
                Abrir fila veterinária →
              </Link>
              <Button
                disabled={busy || schemaMissing || !authenticated}
                onClick={() => void sendTestPush('veterinarian')}
                type="button"
                variant="outline"
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Testar alerta de fila vet
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card
        description="Navegadores e dispositivos inscritos para receber Push criptografado."
        title="Dispositivos Conectados"
      >
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            action={
              supported && permission !== 'denied' && authenticated && !schemaMissing ? (
                <Button
                  disabled={busy}
                  onClick={() => void enablePush()}
                  type="button"
                  variant="secondary"
                >
                  Ativar neste navegador
                </Button>
              ) : undefined
            }
            description="Ative o Push no navegador para receber lembretes de consultas e avisos da fila veterinária mesmo com a aba minimizada."
            title="Nenhum dispositivo inscrito"
          />
        ) : (
          <ul className="grid gap-3">
            {subscriptions.map((sub) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f6faff] p-3.5"
                key={sub.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#153b50]" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sub.is_active ? 'success' : 'neutral'}>
                        {sub.is_active ? 'Ativo' : 'Pausado'}
                      </Badge>
                      <Badge variant="info">Perfil {sub.role_hint}</Badge>
                      <span className="text-xs font-semibold tabular-nums text-slate-600">
                        Lembrete: {formatLeadTimeLabel(sub.reminder_lead_minutes)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">
                      {sub.user_agent || sub.endpoint}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] tabular-nums text-slate-500">
                  Atualizado em {formatDateTime(sub.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        description="Registro completo de alertas gerados por consultas agendadas, confirmações e fila veterinária."
        title="Histórico de Notificações"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'tutor', label: 'Consultas do Tutor' },
                { id: 'vet', label: 'Fila Veterinária' },
              ] as const
            ).map((tab) => (
              <button
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  filter === tab.id
                    ? 'bg-[#153b50] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Button
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            type="button"
            variant="outline"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Marcar todas como lidas
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState
            description="Quando houver lembretes de consultas marcadas ou novas solicitações na fila, eles aparecerão nesta lista."
            title="Nenhuma notificação registrada"
          />
        ) : (
          <ul className="grid gap-3">
            {filteredNotifications.map((item) => {
              const meta = getKindMeta(item.kind);
              return (
                <li
                  className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${
                    item.read_at
                      ? 'border-slate-200 bg-white'
                      : 'border-sky-200 bg-[#f6faff]'
                  }`}
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {!item.read_at && <Badge variant="info">Nova</Badge>}
                      {item.pushed_at && (
                        <span className="text-[11px] font-semibold text-emerald-700">
                          Push entregue
                        </span>
                      )}
                      <span className="text-xs tabular-nums text-slate-500">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 font-bold text-[#153b50]">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{item.body}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read_at && (
                      <Button
                        onClick={() => void markAsRead(item.id)}
                        type="button"
                        variant="outline"
                      >
                        Marcar lida
                      </Button>
                    )}
                    <Link
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#153b50] px-4 text-xs font-bold text-white hover:bg-[#0d2a3a]"
                      href={item.action_url || '/agendamento'}
                      onClick={() => {
                        if (!item.read_at) {
                          void markAsRead(item.id);
                        }
                      }}
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Abrir tela
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
