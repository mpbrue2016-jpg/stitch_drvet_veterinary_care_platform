'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, WifiOff } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import {
  filterCachedBasicRecords,
  formatCachedVitalsSummary,
  isLikelyOfflineError,
} from '@/lib/offline/vet-cache-helpers';
import {
  getCachedVetBasicRecords,
  saveVetBasicRecordsToCache,
} from '@/lib/offline/vet-indexeddb';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { listarProntuarios } from '@/services/clinical-records.service';
import type { ClinicalRecord } from '@/types/entities';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ClinicalRecordsIndex() {
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setOfflineNotice('');
    try {
      const supabase = createSupabaseBrowserClient();
      const [result, authRes] = await Promise.all([
        listarProntuarios(),
        supabase.auth.getUser().catch(() => ({ data: { user: null } })),
      ]);

      setRecords(result.clinicalRecords);

      const authUserId = authRes.data?.user?.id ?? '';
      if (authUserId) {
        const vetRecords = result.clinicalRecords.filter(
          (record) => record.veterinarian_id === authUserId,
        );
        if (vetRecords.length > 0) {
          void saveVetBasicRecordsToCache(authUserId, vetRecords).catch(() => null);
        }
      }
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const cached = await getCachedVetBasicRecords().catch(() => null);
        if (cached && cached.clinicalRecords.length > 0) {
          setRecords(cached.clinicalRecords);
          setOfflineNotice(
            cached.lastSyncedAt
              ? `Sem conexão com a internet. Exibindo prontuários básicos do cache local IndexedDB sincronizados em ${formatDate(cached.lastSyncedAt)}.`
              : 'Sem conexão com a internet. Exibindo prontuários básicos salvos localmente no IndexedDB.',
          );
          return;
        }
      }

      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar os prontuários.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRecords = useMemo(
    () => filterCachedBasicRecords(records, searchQuery),
    [records, searchQuery],
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <PageHeader
        title="Prontuários clínicos (SOAP)"
        description="Histórico de evoluções clínicas vinculadas aos atendimentos."
        action={
          <Link
            className="inline-flex min-h-11 items-center rounded-full bg-[#087a68] px-5 text-sm font-bold text-white"
            href="/agendamento"
          >
            Ver agendamentos
          </Link>
        }
      />

      {offlineNotice && (
        <div
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          role="status"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{offlineNotice}</span>
        </div>
      )}

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadRecords()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <Card
        title="Registros recentes"
        description="Abra um atendimento para editar rascunhos ou consultar registros finalizados e resumos básicos offline."
      >
        <div className="mb-4 flex justify-end">
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Filtrar prontuários básicos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Filtrar prontuários por paciente ou conteúdo SOAP"
              className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-[#153b50] placeholder:text-slate-400 focus:border-[#087a68] focus:outline-none"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar pet ou SOAP..."
              type="search"
              value={searchQuery}
            />
          </label>
        </div>
        {loading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            title={
              searchQuery
                ? 'Nenhum prontuário corresponde à busca'
                : 'Nenhum prontuário registrado'
            }
            description={
              searchQuery
                ? 'Ajuste o termo pesquisado para localizar outros prontuários.'
                : 'Os prontuários SOAP aparecerão aqui após o início dos atendimentos.'
            }
          />
        ) : (
          <ul className="grid gap-3">
            {filteredRecords.map((record) => {
              const isExpanded = expandedId === record.id;
              const vitalsSummary = formatCachedVitalsSummary(record.vitals);
              return (
                <li
                  className="rounded-2xl border border-slate-200 bg-[#f6faff] p-4"
                  key={record.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[#153b50]">
                          {record.pet
                            ? `${record.pet.name} · ${record.pet.species}`
                            : `Atendimento ${record.appointment_id}`}
                        </p>
                        <Badge variant={record.status === 'finalized' ? 'success' : 'warning'}>
                          {record.status === 'finalized' ? 'Finalizado' : 'Rascunho'}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {record.assessment || record.subjective || 'Sem descrição clínica.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 tabular-nums">
                        Atualizado em {formatDate(record.updated_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        aria-expanded={isExpanded}
                        className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-[#153b50] hover:bg-slate-50"
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        type="button"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" />
                            Ocultar resumo
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" />
                            Resumo básico
                          </>
                        )}
                      </button>
                      <Link
                        className="inline-flex min-h-10 items-center rounded-full border border-[#087a68] px-4 text-sm font-semibold text-[#087a68]"
                        href={`/prontuarios/${record.appointment_id}`}
                      >
                        {record.status === 'finalized' ? 'Visualizar SOAP' : 'Editar rascunho'}
                      </Link>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 grid gap-2.5 border-t border-slate-200 pt-3 text-xs text-slate-700 sm:grid-cols-2">
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
                      <div className="sm:col-span-2 border-t border-slate-200 pt-2 text-slate-600 tabular-nums">
                        <span className="font-semibold text-[#153b50]">Sinais vitais: </span>
                        {vitalsSummary.length > 0
                          ? vitalsSummary.join(' · ')
                          : 'Nenhum sinal vital registrado.'}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
