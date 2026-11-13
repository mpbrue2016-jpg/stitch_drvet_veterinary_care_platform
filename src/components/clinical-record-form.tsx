'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import type { ClinicalRecordStatus } from '@/types/database';

type ClinicalVitals = {
  weight_kg: number | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  respiratory_rate_rpm: number | null;
  mucous_membranes: string | null;
  capillary_refill_seconds: number | null;
};

type ClinicalRecord = {
  id: string;
  appointment_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  status: ClinicalRecordStatus;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

type ClinicalRecordFields = Pick<
  ClinicalRecord,
  'subjective' | 'objective' | 'assessment' | 'plan'
>;
type VitalFields = {
  weight_kg: string;
  temperature_c: string;
  heart_rate_bpm: string;
  respiratory_rate_rpm: string;
  mucous_membranes: string;
  capillary_refill_seconds: string;
};

const emptyVitals: VitalFields = {
  weight_kg: '',
  temperature_c: '',
  heart_rate_bpm: '',
  respiratory_rate_rpm: '',
  mucous_membranes: '',
  capillary_refill_seconds: '',
};

function toVitalFields(vitals: ClinicalVitals): VitalFields {
  return {
    weight_kg: vitals.weight_kg?.toString() ?? '',
    temperature_c: vitals.temperature_c?.toString() ?? '',
    heart_rate_bpm: vitals.heart_rate_bpm?.toString() ?? '',
    respiratory_rate_rpm: vitals.respiratory_rate_rpm?.toString() ?? '',
    mucous_membranes: vitals.mucous_membranes ?? '',
    capillary_refill_seconds: vitals.capillary_refill_seconds?.toString() ?? '',
  };
}

function optionalNumber(value: string) {
  return value.trim() === '' ? null : Number(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ClinicalRecordForm({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [fields, setFields] = useState<ClinicalRecordFields>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });
  const [vitals, setVitals] = useState<VitalFields>(emptyVitals);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(
        `/api/clinical-records?appointmentId=${encodeURIComponent(appointmentId)}`,
      );
      const result: {
        clinicalRecord?: ClinicalRecord | null;
        canEdit?: boolean;
        error?: string;
      } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível carregar o prontuário.');
      }

      const loadedRecord = result.clinicalRecord ?? null;
      setRecord(loadedRecord);
      setCanEdit(result.canEdit ?? false);
      if (loadedRecord) {
        setFields({
          subjective: loadedRecord.subjective,
          objective: loadedRecord.objective,
          assessment: loadedRecord.assessment,
          plan: loadedRecord.plan,
        });
        setVitals(toVitalFields(loadedRecord.vitals));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar o prontuário.',
      );
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    void loadRecord();
  }, [loadRecord]);

  function updateField(field: keyof ClinicalRecordFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  function updateVital(field: keyof VitalFields, value: string) {
    setVitals((current) => ({ ...current, [field]: value }));
  }

  async function save(status: ClinicalRecordStatus) {
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const response = await fetch('/api/clinical-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointmentId,
          ...fields,
          vitals: {
            weight_kg: optionalNumber(vitals.weight_kg),
            temperature_c: optionalNumber(vitals.temperature_c),
            heart_rate_bpm: optionalNumber(vitals.heart_rate_bpm),
            respiratory_rate_rpm: optionalNumber(vitals.respiratory_rate_rpm),
            mucous_membranes: vitals.mucous_membranes.trim() || null,
            capillary_refill_seconds: optionalNumber(
              vitals.capillary_refill_seconds,
            ),
          },
          status,
        }),
      });
      const result: {
        clinicalRecord?: ClinicalRecord;
        error?: string;
      } = await response.json();
      if (!response.ok || !result.clinicalRecord) {
        throw new Error(result.error ?? 'Não foi possível salvar o prontuário.');
      }

      setRecord(result.clinicalRecord);
      setCanEdit(result.clinicalRecord.status === 'draft');
      setNotice(
        status === 'finalized'
          ? 'Prontuário finalizado. O registro não pode mais ser alterado.'
          : 'Rascunho salvo.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar o prontuário.',
      );
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !canEdit || record?.status === 'finalized';

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Prontuário clínico"
        description="Registro SOAP vinculado ao atendimento e ao paciente."
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50]"
            href="/agendamento"
          >
            Voltar aos agendamentos
          </Link>
        }
      />

      {record?.status === 'finalized' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">
            Registro finalizado em {record.finalized_at ? formatDate(record.finalized_at) : '—'}
          </p>
          <Badge variant="success">Finalizado</Badge>
        </div>
      )}

      {errorMessage && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">
            Carregando prontuário...
          </p>
        </Card>
      ) : (
        <>
          {!canEdit && !record && (
            <Card>
              <p className="text-sm text-slate-600">
                Não há prontuário disponível para este atendimento.
              </p>
            </Card>
          )}

          {(canEdit || record) && (
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void save('draft');
              }}
            >
              <Card
                title="Evolução clínica — SOAP"
                description={
                  readOnly
                    ? 'Registro disponível somente para leitura.'
                    : 'Preencha a avaliação clínica do atendimento. O rascunho pode ser atualizado até a finalização.'
                }
              >
                <div className="grid gap-5">
                  {(
                    [
                      ['subjective', 'S — Subjetivo', 'Relato do responsável, queixa principal e histórico informado.'],
                      ['objective', 'O — Objetivo', 'Achados do exame e observações clínicas.'],
                      ['assessment', 'A — Avaliação', 'Avaliação profissional e hipóteses consideradas.'],
                      ['plan', 'P — Plano', 'Conduta, orientações e acompanhamento definido.'],
                    ] as const
                  ).map(([field, label, description]) => (
                    <label className="grid gap-1.5" key={field}>
                      <span className="text-sm font-semibold text-[#153b50]">{label}</span>
                      <span className="text-xs text-slate-500">{description}</span>
                      <textarea
                        className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#153b50] disabled:bg-slate-50"
                        disabled={readOnly || saving}
                        maxLength={10000}
                        onChange={(event) => updateField(field, event.target.value)}
                        value={fields[field]}
                      />
                    </label>
                  ))}
                </div>
              </Card>

              <Card
                title="Sinais vitais"
                description="Registre somente os valores aferidos durante o atendimento."
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ['weight_kg', 'Peso (kg)', '0.01'],
                      ['temperature_c', 'Temperatura (°C)', '0.1'],
                      ['heart_rate_bpm', 'Frequência cardíaca (bpm)', '1'],
                      ['respiratory_rate_rpm', 'Frequência respiratória (rpm)', '1'],
                      ['capillary_refill_seconds', 'Tempo de preenchimento capilar (s)', '0.1'],
                    ] as const
                  ).map(([field, label, step]) => (
                    <label className="grid gap-1.5" key={field}>
                      <span className="text-sm font-semibold text-[#153b50]">{label}</span>
                      <input
                        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
                        disabled={readOnly || saving}
                        min="0"
                        onChange={(event) => updateVital(field, event.target.value)}
                        step={step}
                        type="number"
                        value={vitals[field]}
                      />
                    </label>
                  ))}
                  <label className="grid gap-1.5">
                    <span className="text-sm font-semibold text-[#153b50]">
                      Mucosas
                    </span>
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
                      disabled={readOnly || saving}
                      maxLength={100}
                      onChange={(event) =>
                        updateVital('mucous_membranes', event.target.value)
                      }
                      value={vitals.mucous_membranes}
                    />
                  </label>
                </div>
              </Card>

              {!readOnly && (
                <div className="flex flex-wrap justify-end gap-3">
                  <Button disabled={saving} type="submit" variant="outline">
                    {saving ? 'Salvando...' : 'Salvar rascunho'}
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => void save('finalized')}
                    type="button"
                    variant="secondary"
                  >
                    {saving ? 'Salvando...' : 'Finalizar prontuário'}
                  </Button>
                </div>
              )}
              <p className="text-xs leading-5 text-slate-500">
                A finalização bloqueia novas alterações neste registro. Não representa
                assinatura digital nem emissão de receita ou atestado.
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
