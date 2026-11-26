'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Minus,
  Plus,
  Target,
  Video,
} from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import {
  buildDailyGoalSelectOptions,
  calculateDailyGoalProgress,
  clampDailyConsultationGoal,
  DEFAULT_DAILY_CONSULTATION_GOAL,
  getVetDailyGoalStorageKey,
  MAX_DAILY_CONSULTATION_GOAL,
  MIN_DAILY_CONSULTATION_GOAL,
  parseStoredDailyConsultationGoal,
  summarizeVetConsultations,
} from '@/lib/agenda/individual-digest';
import { getSupabaseClient } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { Appointment } from '@/types/entities';

export interface VetConsultationSummaryProps {
  appointments: Appointment[];
  inProgressAppointmentIds?: string[];
  veterinarianId?: string;
  initialDailyGoal?: number | null;
  loading?: boolean;
}

function formatTodayReferenceLabel(dateKey: string): string {
  if (!dateKey) return 'Hoje';
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return 'Hoje';
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function VetConsultationSummary({
  appointments,
  inProgressAppointmentIds = [],
  veterinarianId,
  initialDailyGoal = null,
  loading = false,
}: VetConsultationSummaryProps) {
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_CONSULTATION_GOAL);

  useEffect(() => {
    const storageKey = getVetDailyGoalStorageKey(veterinarianId);
    const fallback = clampDailyConsultationGoal(initialDailyGoal);
    try {
      const storedRaw = window.localStorage.getItem(storageKey);
      if (storedRaw) {
        setDailyGoal(parseStoredDailyConsultationGoal(storedRaw, fallback));
      } else {
        setDailyGoal(fallback);
        if (initialDailyGoal != null) {
          window.localStorage.setItem(storageKey, String(fallback));
        }
      }
    } catch {
      setDailyGoal(fallback);
    }
  }, [veterinarianId, initialDailyGoal]);

  function handleGoalChange(nextRawValue: number) {
    const nextGoal = clampDailyConsultationGoal(nextRawValue, dailyGoal);
    setDailyGoal(nextGoal);

    const storageKey = getVetDailyGoalStorageKey(veterinarianId);
    try {
      window.localStorage.setItem(storageKey, String(nextGoal));
    } catch {
      // Ignore storage quota or private mode restrictions silently.
    }

    if (isSupabaseConfigured() && veterinarianId) {
      void getSupabaseClient()
        .auth.updateUser({
          data: { daily_consultation_goal: nextGoal },
        })
        .catch(() => null);
    }
  }

  const summary = summarizeVetConsultations({
    appointments,
    inProgressAppointmentIds,
    veterinarianId,
  });

  const goalProgress = calculateDailyGoalProgress(summary.todayTotal, dailyGoal);
  const goalOptions = buildDailyGoalSelectOptions(dailyGoal);

  const stats = [
    {
      key: 'today',
      label: 'Consultas hoje',
      value: summary.todayTotal,
      detail:
        summary.todayTotal === 0
          ? 'Nenhuma consulta agendada hoje'
          : `${summary.todayWaiting} aguardando · ${summary.todayCompleted} finalizada(s) hoje`,
      icon: CalendarDays,
      iconTone: 'bg-[#EBF5FF] text-[#153B50]',
      valueTone: 'text-[#153B50]',
    },
    {
      key: 'waiting',
      label: 'Aguardando',
      value: summary.waiting,
      detail:
        summary.pendingConfirmation > 0
          ? `${summary.pendingConfirmation} pendente(s) de confirmação`
          : 'Confirmadas aguardando horário',
      icon: Clock3,
      iconTone: 'bg-amber-50 text-amber-700',
      valueTone: 'text-[#153B50]',
    },
    {
      key: 'in_progress',
      label: 'Em andamento',
      value: summary.inProgress,
      detail:
        summary.inProgress > 0
          ? 'Atendimento clínico em curso agora'
          : 'Nenhuma sala ativa no momento',
      icon: Video,
      iconTone: 'bg-emerald-50 text-[#087A68]',
      valueTone: summary.inProgress > 0 ? 'text-[#087A68]' : 'text-[#153B50]',
    },
    {
      key: 'completed',
      label: 'Finalizadas',
      value: summary.completed,
      detail:
        summary.todayCompleted > 0
          ? `${summary.todayCompleted} concluída(s) hoje`
          : 'Histórico total concluído',
      icon: CheckCircle2,
      iconTone: 'bg-slate-100 text-slate-700',
      valueTone: 'text-[#153B50]',
    },
  ] as const;

  const progressFillTone = goalProgress.reached
    ? 'bg-[#087A68]'
    : goalProgress.todayTotal > 0
      ? 'bg-[#153B50]'
      : 'bg-slate-300';

  return (
    <Card
      className="mb-6"
      description="Total de consultas previstas para hoje, distribuição atual da sua fila individual e acompanhamento da meta diária."
      title="Resumo de Consultas"
    >
      {loading ? (
        <div aria-label="Carregando resumo de consultas" className="grid gap-4">
          <div className="grid grid-cols-1 divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-[#F9FBFC] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {[0, 1, 2, 3].map((idx) => (
              <div className="p-4 sm:p-5" key={idx}>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-3 h-8 w-16" />
                <Skeleton className="mt-2 h-3.5 w-36" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-[#F9FBFC] p-4 sm:p-5">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div
            aria-label="Indicadores de consultas do veterinário"
            className="grid grid-cols-1 rounded-xl border border-slate-200 bg-[#F9FBFC] sm:grid-cols-2 lg:grid-cols-4"
          >
            {stats.map((item, idx) => {
              const Icon = item.icon;
              const borderClasses = [
                idx < 3 ? 'border-b lg:border-b-0' : '',
                idx === 0 || idx === 2 ? 'sm:border-r' : '',
                idx === 1 ? 'lg:border-r' : '',
                idx === 2 ? 'sm:border-b-0' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  className={`border-slate-200/80 p-4 sm:p-5 ${borderClasses}`}
                  key={item.key}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {item.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.iconTone}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p
                    className={`mt-3 text-3xl font-extrabold tracking-tight tabular-nums ${item.valueTone}`}
                  >
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
                </div>
              );
            })}
          </div>

          <div
            aria-label="Meta diária de consultas"
            className="rounded-xl border border-slate-200 bg-[#F9FBFC] p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    goalProgress.reached
                      ? 'bg-emerald-50 text-[#087A68]'
                      : 'bg-[#EBF5FF] text-[#153B50]'
                  }`}
                >
                  <Target className="h-4 w-4" />
                </span>
                <div>
                  <label
                    className="block text-sm font-bold text-[#153B50]"
                    htmlFor="vet-daily-goal-select"
                  >
                    Meta Diária de Consultas
                  </label>
                  <p className="text-xs text-slate-600 tabular-nums">
                    {goalProgress.todayTotal} de {goalProgress.goal} consulta
                    {goalProgress.goal === 1 ? '' : 's'} hoje ·{' '}
                    <span
                      className={`font-bold ${
                        goalProgress.reached ? 'text-[#087A68]' : 'text-[#153B50]'
                      }`}
                    >
                      {goalProgress.rawPercent}%
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  aria-label="Diminuir meta diária"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-[#153B50] transition-colors hover:bg-[#EBF5FF] disabled:pointer-events-none disabled:opacity-40"
                  disabled={dailyGoal <= MIN_DAILY_CONSULTATION_GOAL}
                  onClick={() => handleGoalChange(dailyGoal - 1)}
                  type="button"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <select
                  aria-label="Meta Diária de Consultas"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-bold text-[#153B50] tabular-nums focus:border-[#153B50] focus:outline-none"
                  id="vet-daily-goal-select"
                  onChange={(event) => handleGoalChange(Number(event.target.value))}
                  value={dailyGoal}
                >
                  {goalOptions.map((optionValue) => (
                    <option key={optionValue} value={optionValue}>
                      {optionValue} consulta{optionValue === 1 ? '' : 's'}/dia
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Aumentar meta diária"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-[#153B50] transition-colors hover:bg-[#EBF5FF] disabled:pointer-events-none disabled:opacity-40"
                  disabled={dailyGoal >= MAX_DAILY_CONSULTATION_GOAL}
                  onClick={() => handleGoalChange(dailyGoal + 1)}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              aria-label="Progresso em relação à meta diária de consultas"
              aria-valuemax={goalProgress.goal}
              aria-valuemin={0}
              aria-valuenow={goalProgress.todayTotal}
              aria-valuetext={`${goalProgress.todayTotal} de ${goalProgress.goal} consultas (${goalProgress.rawPercent}%)`}
              className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80"
              role="progressbar"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-out ${progressFillTone}`}
                style={{ width: `${goalProgress.percent}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 tabular-nums">
              <span>
                {goalProgress.reached
                  ? goalProgress.exceededBy > 0
                    ? `Meta diária superada em ${goalProgress.exceededBy} atendimento(s).`
                    : `Objetivo diário de ${goalProgress.goal} consulta(s) atingido.`
                  : `Faltam ${goalProgress.remaining} consulta(s) para atingir a meta de hoje.`}
              </span>
              <span
                className={`font-semibold ${
                  goalProgress.reached ? 'text-[#087A68]' : 'text-[#153B50]'
                }`}
              >
                {goalProgress.todayTotal}/{goalProgress.goal} no dia
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="tabular-nums">
          Referência de hoje: {formatTodayReferenceLabel(summary.referenceDateKey)}
        </span>
        <div className="flex flex-wrap items-center gap-4">
          {summary.inProgress > 0 && (
            <Link
              className="inline-flex items-center gap-1 font-bold text-[#087A68] hover:underline"
              href="/teleconsulta"
            >
              <span>Abrir sala em andamento</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <Link
            className="inline-flex items-center gap-1 font-bold text-[#153B50] hover:underline"
            href="/agenda"
          >
            <span>Ver agenda individual</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

