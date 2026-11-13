'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { createVaccinationSchema } from '@/lib/validations';
import { listarAgendamentos } from '@/services/appointments.service';
import { criarRegistroVacina, listarVacinas } from '@/services/vaccinations.service';
import type { Appointment, VaccinationRecord } from '@/types/entities';

type FormFields = {
  appointment_id: string;
  vaccine_name: string;
  administered_on: string;
  batch_number: string;
  manufacturer: string;
  next_due_on: string;
  notes: string;
};

const initialForm: FormFields = {
  appointment_id: '',
  vaccine_name: '',
  administered_on: '',
  batch_number: '',
  manufacturer: '',
  next_due_on: '',
  notes: '',
};

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day, 12),
  );
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function VaccinationWallet() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [fields, setFields] = useState<FormFields>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [appointmentsResult, vaccinationsResult] = await Promise.all([
        listarAgendamentos(),
        listarVacinas(),
      ]);

      setAppointments(appointmentsResult.appointments);
      setCurrentUserId(appointmentsResult.currentUserId);
      setVaccinations(vaccinationsResult.vaccinations);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar a carteira.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eligibleAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          appointment.veterinarian_id === currentUserId &&
          (appointment.status === 'completed' ||
            appointment.status === 'confirmed') &&
          new Date(appointment.ends_at).getTime() <= Date.now(),
      ),
    [appointments, currentUserId],
  );

  async function saveVaccination(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');

    const parsed = createVaccinationSchema.safeParse({
      appointment_id: fields.appointment_id,
      vaccine_name: fields.vaccine_name,
      administered_on: fields.administered_on,
      batch_number: fields.batch_number.trim() || null,
      manufacturer: fields.manufacturer.trim() || null,
      next_due_on: fields.next_due_on || null,
      notes: fields.notes.trim() || null,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Preencha corretamente os dados da vacinação.',
      );
      return;
    }

    setSaving(true);
    try {
      await criarRegistroVacina(parsed.data);
      setFields(initialForm);
      setNotice('Vacinação registrada na carteira do paciente.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao registrar a vacinação.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Carteira de vacinação"
        description="Histórico de vacinas vinculado ao paciente e ao atendimento veterinário."
      />

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button type="button" variant="outline" onClick={() => void loadData()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {notice && (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      {!loading && eligibleAppointments.length > 0 && (
        <Card
          title="Registrar vacinação"
          description="Disponível ao veterinário designado após o término do atendimento. O registro fica imutável depois de salvo."
        >
          <form className="grid gap-4" onSubmit={(event) => void saveVaccination(event)}>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#153b50]">
                Atendimento concluído
              </span>
              <select
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-[#153b50]"
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    appointment_id: event.target.value,
                  }))
                }
                required
                value={fields.appointment_id}
              >
                <option value="">Selecione paciente e atendimento</option>
                {eligibleAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.pet?.name ?? 'Paciente'} ·{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(appointment.starts_at))}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">Vacina</span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  maxLength={160}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      vaccine_name: event.target.value,
                    }))
                  }
                  required
                  value={fields.vaccine_name}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">
                  Data de aplicação
                </span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  max={localToday()}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      administered_on: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={fields.administered_on}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">
                  Próxima dose
                </span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  min={fields.administered_on || undefined}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      next_due_on: event.target.value,
                    }))
                  }
                  type="date"
                  value={fields.next_due_on}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">Fabricante</span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  maxLength={120}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      manufacturer: event.target.value,
                    }))
                  }
                  value={fields.manufacturer}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">
                  Lote (opcional)
                </span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  maxLength={80}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      batch_number: event.target.value,
                    }))
                  }
                  value={fields.batch_number}
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#153b50]">Observações</span>
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                maxLength={2000}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                value={fields.notes}
              />
            </label>
            <div className="flex justify-end">
              <Button disabled={saving} type="submit" variant="secondary">
                {saving ? 'Salvando...' : 'Registrar vacina'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Histórico de vacinação"
        description="Registros disponíveis de acordo com sua relação com o paciente."
      >
        {loading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : vaccinations.length === 0 ? (
          <EmptyState
            title="Nenhuma vacinação registrada"
            description="Os registros serão exibidos após serem salvos pelo veterinário responsável."
          />
        ) : (
          <ul className="grid gap-3">
            {vaccinations.map((vaccination) => (
              <li className="rounded-2xl bg-[#f6faff] p-4" key={vaccination.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#153b50]">
                      {vaccination.vaccine_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {vaccination.pet
                        ? `${vaccination.pet.name} · ${vaccination.pet.species}`
                        : 'Paciente'}
                      {' · Aplicada em '}
                      {localDate(vaccination.administered_on)}
                    </p>
                  </div>
                  {vaccination.next_due_on && (
                    <Badge variant="info">
                      Próxima dose: {localDate(vaccination.next_due_on)}
                    </Badge>
                  )}
                </div>
                {(vaccination.manufacturer || vaccination.batch_number) && (
                  <p className="mt-2 text-xs text-slate-600">
                    {[
                      vaccination.manufacturer,
                      vaccination.batch_number && `Lote ${vaccination.batch_number}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {vaccination.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                    {vaccination.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
