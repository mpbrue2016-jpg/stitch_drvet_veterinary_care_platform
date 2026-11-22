'use client';

import Link from 'next/link';
import { BellRing, CalendarClock, ChevronRight, Stethoscope } from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';

export function PushInlineBanner({
  audience,
}: {
  audience: 'tutor' | 'veterinarian';
}) {
  const {
    authenticated,
    busy,
    configured,
    enablePush,
    isPushEnabledOnThisDevice,
    loading,
    permission,
    preferences,
    schemaMissing,
    supported,
  } = usePushNotifications();

  if (!configured || !authenticated || loading) {
    return null;
  }

  const isVet = audience === 'veterinarian';

  if (schemaMissing) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <div className="flex items-center gap-2.5">
          <BellRing className="h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Alertas Push pendentes de schema:</strong> aplique a Migration 12 em{' '}
            <code className="font-mono">/setup-supabase</code> para habilitar lembretes e avisos de fila.
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 font-bold text-amber-950 hover:underline"
          href="/setup-supabase"
        >
          Aplicar SQL
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  if (isPushEnabledOnThisDevice) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-[#effcf8] px-4 py-3 text-xs text-[#153b50]">
        <div className="flex items-center gap-2.5">
          {isVet ? (
            <Stethoscope className="h-4 w-4 shrink-0 text-[#087a68]" />
          ) : (
            <CalendarClock className="h-4 w-4 shrink-0 text-[#087a68]" />
          )}
          <p>
            <strong>Push ativo:</strong>{' '}
            {isVet
              ? preferences.notifyQueue
                ? 'você receberá alertas instantâneos quando uma nova solicitação entrar na fila.'
                : 'alertas da fila veterinária estão pausados nas preferências.'
              : preferences.notifyAppointments
                ? `lembretes programados com ${preferences.reminderLeadMinutes} minutos de antecedência.`
                : 'lembretes de horário de consulta estão pausados.'}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 font-bold text-[#087a68] hover:underline"
          href="/notificacoes"
        >
          Configurar
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-[#ebf5ff] px-4 py-3 text-xs text-[#153b50]">
      <div className="flex items-center gap-2.5">
        <BellRing className="h-4 w-4 shrink-0 text-[#0B68C2]" />
        <p>
          {permission === 'denied' ? (
            <>
              <strong>Notificações bloqueadas no navegador:</strong> libere a permissão do site para{' '}
              {isVet
                ? 'receber alertas de novos atendimentos na fila.'
                : 'não perder o horário das suas consultas.'}
            </>
          ) : (
            <>
              <strong>
                {isVet
                  ? 'Alertas em tempo real da fila clínica:'
                  : 'Lembretes de consulta por Push:'}
              </strong>{' '}
              {isVet
                ? 'ative as notificações para ser avisado imediatamente quando tutores solicitarem atendimento.'
                : 'receba um aviso automático antes do horário marcado com o veterinário.'}
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {supported && permission !== 'denied' && (
          <button
            className="inline-flex min-h-8 items-center rounded-full bg-[#0B68C2] px-3.5 text-xs font-bold text-white transition hover:bg-[#0955a0] disabled:opacity-60"
            disabled={busy}
            onClick={() => void enablePush()}
            type="button"
          >
            {busy ? 'Ativando...' : 'Ativar alertas Push'}
          </button>
        )}
        <Link
          className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-[#153b50] hover:bg-slate-50"
          href="/notificacoes"
        >
          Preferências
        </Link>
      </div>
    </div>
  );
}
