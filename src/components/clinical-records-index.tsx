'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await listarProntuarios();
      setRecords(result.clinicalRecords);
    } catch (error) {
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

      <Card title="Registros recentes" description="Abra um atendimento para editar rascunhos ou consultar registros finalizados.">
        {loading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            title="Nenhum prontuário registrado"
            description="Os prontuários SOAP aparecerão aqui após o início dos atendimentos."
          />
        ) : (
          <ul className="grid gap-3">
            {records.map((record) => (
              <li
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#f6faff] p-4"
                key={record.id}
              >
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
                  <p className="mt-1 text-xs text-slate-500">
                    Atualizado em {formatDate(record.updated_at)}
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-10 items-center rounded-full border border-[#087a68] px-4 text-sm font-semibold text-[#087a68]"
                  href={`/prontuarios/${record.appointment_id}`}
                >
                  {record.status === 'finalized' ? 'Visualizar SOAP' : 'Editar rascunho'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
