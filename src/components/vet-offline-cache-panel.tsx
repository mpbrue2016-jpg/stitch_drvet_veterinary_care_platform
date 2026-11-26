'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { useOnlineStatus } from '@/lib/offline/use-online-status';
import {
  filterCachedAppointments,
  filterCachedBasicRecords,
  formatCachedVitalsSummary,
  type CachedVetBasicRecord,
  type VetOfflineCacheMeta,
} from '@/lib/offline/vet-cache-helpers';
import {
  clearVetOfflineCache,
  getVetOfflineCacheSnapshot,
  syncFullVetOfflineSnapshot,
} from '@/lib/offline/vet-indexeddb';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listarAgendamentos } from '@/services/appointments.service';
import { listarProntuarios } from '@/services/clinical-records.service';
import type { Appointment } from '@/types/entities';

export interface VetOfflineCachePanelProps {
  veterinarianId?: string;
  veterinarianName?: string | null;
  appointments?: Appointment[];
  loadingParent?: boolean;
  onSyncTrigger?: () => Promise<void> | void;
}

const statusLabels: Record<Appointment['status'], string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Ainda não sincronizado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Ainda não sincronizado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

export function VetOfflineCachePanel({
  veterinarianId,
  veterinarianName = null,
  appointments: liveAppointments,
  loadingParent = false,
  onSyncTrigger,
}: VetOfflineCachePanelProps) {
  const configured = isSupabaseConfigured();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<'appointments' | 'records'>('appointments');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [loadingCache, setLoadingCache] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [supported, setSupported] = useState(true);
  const [meta, setMeta] = useState<VetOfflineCacheMeta | null>(null);
  const [cachedAppointments, setCachedAppointments] = useState<Appointment[]>([]);
  const [cachedRecords, setCachedRecords] = useState<CachedVetBasicRecord[]>([]);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadSnapshot = useCallback(async () => {
    setLoadingCache(true);
    try {
      const snapshot = await getVetOfflineCacheSnapshot(veterinarianId);
      setSupported(snapshot.supported);
      setMeta(snapshot.meta);
      setCachedAppointments(snapshot.appointments);
      setCachedRecords(snapshot.records);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível ler o cache offline local.',
      );
    } finally {
      setLoadingCache(false);
    }
  }, [veterinarianId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot, liveAppointments?.length]);

  const handleManualSync = async () => {
    if (!configured || !isOnline) {
      setErrorMessage(
        'Conecte-se à internet para atualizar o cache local com o servidor.',
      );
      return;
    }

    setSyncing(true);
    setErrorMessage('');
    setNotice('');
    try {
      const [apptsRes, recordsRes] = await Promise.all([
        listarAgendamentos({ mine: true }),
        listarProntuarios().catch(() => ({ clinicalRecords: [] })),
      ]);

      const resolvedVetId = veterinarianId?.trim() || apptsRes.currentUserId;
      if (!resolvedVetId) {
        throw new Error('Identificação do veterinário não encontrada para sincronizar.');
      }

      const vetRecords = recordsRes.clinicalRecords.filter(
        (record) => record.veterinarian_id === resolvedVetId,
      );

      await syncFullVetOfflineSnapshot({
        veterinarianId: resolvedVetId,
        veterinarianName,
        appointments: apptsRes.appointments,
        clinicalRecords: vetRecords,
      });

      if (onSyncTrigger) {
        await onSyncTrigger();
      }
      await loadSnapshot();
      setNotice(
        `Cache atualizado no IndexedDB: ${apptsRes.appointments.length} agendamentos e ${vetRecords.length} prontuários básicos.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível sincronizar os dados para acesso offline.',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    setErrorMessage('');
    setNotice('');
    try {
      await clearVetOfflineCache(veterinarianId);
      setExpandedRecordId(null);
      await loadSnapshot();
      setNotice('Cache local IndexedDB limpo neste dispositivo.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível limpar o cache local.',
      );
    } finally {
      setClearing(false);
    }
  };

  const filteredAppointments = useMemo(
    () => filterCachedAppointments(cachedAppointments, { q: searchQuery }),
    [cachedAppointments, searchQuery],
  );

  const filteredRecords = useMemo(
    () => filterCachedBasicRecords(cachedRecords, searchQuery),
    [cachedRecords, searchQuery],
  );

  const displayAppointmentsCount = meta?.appointments_count ?? cachedAppointments.length;
  const displayRecordsCount = meta?.records_count ?? cachedRecords.length;

  return (
    <Card
      description="Armazena no IndexedDB do navegador seus agendamentos recentes e resumos SOAP básicos para consulta mesmo sem internet."
      title="Cache local offline (IndexedDB)"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={!isOnline || !configured || syncing || loadingParent}
            onClick={() => void handleManualSync()}
            type="button"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">
              {syncing ? 'Sincronizando...' : 'Sincronizar cache'}
            </span>
          </Button>
          <Button
            disabled={
              clearing ||
              syncing ||
              (cachedAppointments.length === 0 && cachedRecords.length === 0)
            }
            onClick={() => void handleClearCache()}
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
            <span className="whitespace-nowrap">Limpar cache</span>
          </Button>
        </div>
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            isOnline
              ? 'border-slate-200 bg-[#F9FBFC] text-[#153b50]'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
          role="status"
        >
          <div className="flex items-center gap-2.5">
            {isOnline ? (
              <Wifi className="h-4 w-4 shrink-0 text-[#087a68]" />
            ) : (
              <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
            )}
            <span className="font-semibold">
              {isOnline
                ? 'Conexão ativa — cache sincronizado automaticamente ao abrir o painel'
                : 'Sem conexão com a internet — modo de leitura offline via IndexedDB ativo'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
            <span className="inline-flex items-center gap-1 font-medium text-[#153b50]">
              <Database className="h-3.5 w-3.5 text-[#087a68]" />
              {displayAppointmentsCount} agendamentos
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#153b50]">
              {displayRecordsCount} prontuários básicos
            </span>
            <span aria-hidden="true">·</span>
            <span>Última sincronização: {formatDateTime(meta?.last_synced_at)}</span>
          </div>
        </div>

        {!supported && (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            Este navegador ou janela privada bloqueou o armazenamento IndexedDB. Utilize uma janela padrão para manter cópia offline.
          </p>
        )}

        {errorMessage && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        {notice && (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            {notice}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-label="Alternar tipo de dado em cache"
            className="inline-flex items-center gap-1 self-start rounded-lg bg-slate-100 p-1"
            role="tablist"
          >
            <button
              aria-selected={activeTab === 'appointments'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'appointments'
                  ? 'bg-white text-[#153b50] shadow-sm'
                  : 'text-slate-600 hover:text-[#153b50]'
              }`}
              onClick={() => setActiveTab('appointments')}
              role="tab"
              type="button"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span className="tabular-nums">
                Agendamentos ({filteredAppointments.length})
              </span>
            </button>
            <button
              aria-selected={activeTab === 'records'}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'records'
                  ? 'bg-white text-[#153b50] shadow-sm'
                  : 'text-slate-600 hover:text-[#153b50]'
              }`}
              onClick={() => setActiveTab('records')}
              role="tab"
              type="button"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="tabular-nums">
                Prontuários básicos ({filteredRecords.length})
              </span>
            </button>
          </div>

          <label className="relative w-full sm:max-w-xs">
            <span className="sr-only">Buscar no cache offline</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Buscar no cache offline por pet, motivo ou avaliação SOAP"
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-[#153b50] placeholder:text-slate-400 focus:border-[#087a68] focus:outline-none"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar pet, motivo ou SOAP..."
              type="search"
              value={searchQuery}
            />
          </label>
        </div>

        {loadingCache ? (
          <div className="grid gap-2.5" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : activeTab === 'appointments' ? (
          filteredAppointments.length === 0 ? (
            <EmptyState
              description={
                searchQuery
                  ? 'Nenhum agendamento salvo localmente corresponde à busca.'
                  : 'Clique em Sincronizar cache enquanto estiver conectado para salvar seus agendamentos neste aparelho.'
              }
              title="Sem agendamentos no cache local"
            />
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {filteredAppointments.slice(0, 12).map((appointment) => (
                <li
                  className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                  key={appointment.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-bold text-[#153b50]">
                        {appointment.pet
                          ? `${appointment.pet.name} · ${appointment.pet.species}`
                          : 'Paciente'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-xs font-medium text-slate-600 tabular-nums">
                        {formatDateTime(appointment.starts_at)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-xs font-medium text-slate-600">
                        {appointment.kind === 'teleconsultation'
                          ? 'Teleconsulta'
                          : 'Presencial'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          appointment.status === 'confirmed'
                            ? 'text-emerald-700'
                            : appointment.status === 'pending'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {statusLabels[appointment.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">
                      {appointment.reason || 'Sem observação clínica prévia'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-[#F9FBFC] px-3 text-xs font-semibold text-[#153b50] hover:bg-slate-100 whitespace-nowrap shrink-0"
                      href={`/prontuarios/${appointment.id}`}
                    >
                      Prontuário
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            description={
              searchQuery
                ? 'Nenhum prontuário básico salvo localmente corresponde à busca.'
                : 'Os resumos SOAP dos atendimentos serão armazenados automaticamente no IndexedDB quando sincronizados.'
            }
            title="Sem prontuários básicos no cache local"
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {filteredRecords.slice(0, 12).map((record) => {
              const isExpanded = expandedRecordId === record.id;
              const vitalsItems = formatCachedVitalsSummary(record.vitals);

              return (
                <li className="px-4 py-3" key={record.id}>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-bold text-[#153b50]">
                          {record.pet
                            ? `${record.pet.name} · ${record.pet.species}`
                            : `Atendimento ${record.appointment_id}`}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            record.status === 'finalized'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {record.status === 'finalized' ? 'Finalizado' : 'Rascunho'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          Atualizado em {formatDateTime(record.updated_at)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                        {record.assessment ||
                          record.subjective ||
                          'Sem resumo clínico registrado.'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        aria-expanded={isExpanded}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-[#F9FBFC] px-3 text-xs font-semibold text-[#153b50] hover:bg-slate-100 whitespace-nowrap shrink-0"
                        onClick={() =>
                          setExpandedRecordId(isExpanded ? null : record.id)
                        }
                        type="button"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            Ocultar SOAP
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            Ler SOAP offline
                          </>
                        )}
                      </button>
                      <Link
                        className="inline-flex min-h-9 items-center rounded-lg border border-[#087a68] px-3 text-xs font-semibold text-[#087a68] hover:bg-emerald-50 whitespace-nowrap shrink-0"
                        href={`/prontuarios/${record.appointment_id}`}
                      >
                        Abrir ficha
                      </Link>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs text-slate-700">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div>
                          <p className="font-semibold text-[#153b50]">S — Subjetivo</p>
                          <p className="mt-0.5 whitespace-pre-line text-slate-600">
                            {record.subjective || 'Não informado'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-[#153b50]">O — Objetivo</p>
                          <p className="mt-0.5 whitespace-pre-line text-slate-600">
                            {record.objective || 'Não informado'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-[#153b50]">A — Avaliação</p>
                          <p className="mt-0.5 whitespace-pre-line text-slate-600">
                            {record.assessment || 'Não informado'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold text-[#153b50]">P — Plano</p>
                          <p className="mt-0.5 whitespace-pre-line text-slate-600">
                            {record.plan || 'Não informado'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-slate-600 tabular-nums">
                        <span className="font-semibold text-[#153b50]">
                          Sinais vitais:
                        </span>
                        {vitalsItems.length > 0 ? (
                          vitalsItems.map((item, idx) => (
                            <span className="inline-flex items-center gap-2" key={item}>
                              {idx > 0 && (
                                <span aria-hidden="true" className="text-slate-300">
                                  ·
                                </span>
                              )}
                              <span>{item}</span>
                            </span>
                          ))
                        ) : (
                          <span>Sem sinais vitais registrados.</span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
