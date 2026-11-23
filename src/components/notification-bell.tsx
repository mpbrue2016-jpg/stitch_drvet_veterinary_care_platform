'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import type { PushNotificationItem } from '@/types/entities';

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function NotificationKindIcon({ kind }: { kind: PushNotificationItem['kind'] }) {
  if (kind === 'vet_queue_new') {
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6f7f4] text-[#087a68]">
        <Stethoscope className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ebf5ff] text-[#0B68C2]">
      <CalendarClock className="h-4 w-4" />
    </span>
  );
}

export function NotificationBell() {
  const {
    authenticated,
    busy,
    configured,
    enablePush,
    isPushEnabledOnThisDevice,
    markAllRead,
    markAsRead,
    notifications,
    permission,
    schemaMissing,
    supported,
    unreadCount,
  } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!configured || !authenticated) {
    return (
      <Link
        aria-label="Notificações Push"
        className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
        href="/notificacoes"
        title="Central de notificações Push"
      >
        <Bell className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Notificações (${unreadCount} não lidas)`}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-[#153b50] transition hover:bg-[#f0f8fb]"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        {isPushEnabledOnThisDevice ? (
          <BellRing className="h-4 w-4 text-[#087a68]" />
        ) : permission === 'denied' ? (
          <BellOff className="h-4 w-4 text-slate-400" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#0B68C2] px-1 text-[10px] font-bold tabular-nums text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          aria-label="Central rápida de notificações"
          className="fixed left-4 right-4 top-20 z-50 rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-96"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#153b50]">
                Alertas &amp; Notificações
              </p>
              <p className="text-[11px] text-slate-500">
                {isPushEnabledOnThisDevice
                  ? 'Web Push ativo neste dispositivo'
                  : supported
                    ? 'Ative o Push para avisos fora da aba'
                    : 'Notificações no painel'}
              </p>
            </div>
            {!isPushEnabledOnThisDevice && supported && permission !== 'denied' && (
              <button
                className="rounded-full bg-[#087a68] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#066355] disabled:opacity-60"
                disabled={busy || schemaMissing}
                onClick={() => void enablePush()}
                type="button"
              >
                {busy ? 'Ativando...' : 'Ativar Push'}
              </button>
            )}
          </div>

          {schemaMissing ? (
            <div className="p-4 text-xs text-amber-900">
              <p className="font-semibold">
                Estrutura de Push &amp; Alertas ainda não inicializada no Supabase.
              </p>
              <p className="mt-1 text-slate-600">
                As tabelas de notificações ainda não estão disponíveis no banco remoto.
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-[#153b50]">
                Tudo em dia por aqui
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Lembretes de consultas marcadas e novas solicitações da fila aparecem aqui.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {notifications.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <Link
                    className={`flex items-start gap-3 px-4 py-3 transition hover:bg-[#f6faff] ${
                      item.read_at ? 'bg-white' : 'bg-[#f6faff]'
                    }`}
                    href={item.action_url || '/notificacoes'}
                    onClick={() => {
                      if (!item.read_at) {
                        void markAsRead(item.id);
                      }
                      setOpen(false);
                    }}
                  >
                    <NotificationKindIcon kind={item.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-bold text-[#153b50]">
                          {item.title}
                        </p>
                        {!item.read_at && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[#0B68C2]" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                        {item.body}
                      </p>
                      <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-400">
                        {formatRelativeDate(item.created_at)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-[#f6faff] px-4 py-2.5 text-xs">
            <button
              className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#153b50] disabled:opacity-40"
              disabled={unreadCount === 0}
              onClick={() => void markAllRead()}
              type="button"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar lidas
            </button>
            <Link
              className="inline-flex items-center gap-1 font-bold text-[#0B68C2] hover:underline"
              href="/notificacoes"
              onClick={() => setOpen(false)}
            >
              Preferências &amp; histórico
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
