'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { savePrescriptionDraftSchema } from '@/lib/validations';
import { listarAgendamentos } from '@/services/appointments.service';
import {
  listarRascunhosReceita,
  salvarRascunhoReceita,
} from '@/services/prescriptions.service';
import type {
  Appointment,
  PrescriptionDraft,
  PrescriptionItem,
} from '@/types/entities';

const emptyItem: PrescriptionItem = {
  name: '',
  presentation: '',
  dose: '',
  route: '',
  frequency: '',
  duration: '',
  quantity: '',
  instructions: '',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function normalizeItem(item: PrescriptionItem): PrescriptionItem {
  return {
    name: item.name.trim(),
    presentation: item.presentation.trim(),
    dose: item.dose.trim(),
    route: item.route.trim(),
    frequency: item.frequency.trim(),
    duration: item.duration.trim(),
    quantity: item.quantity.trim(),
    instructions: item.instructions.trim(),
  };
}

function isEligibleAppointment(appointment: Appointment, userId: string) {
  return (
    appointment.veterinarian_id === userId &&
    (appointment.status === 'confirmed' || appointment.status === 'completed') &&
    new Date(appointment.starts_at).getTime() <= Date.now()
  );
}

export function PrescriptionDrafts() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [drafts, setDrafts] = useState<PrescriptionDraft[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [items, setItems] = useState<PrescriptionItem[]>([{ ...emptyItem }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [appointmentsResult, draftsResult] = await Promise.all([
        listarAgendamentos(),
        listarRascunhosReceita(),
      ]);

      const loadedAppointments = appointmentsResult.appointments;
      const loadedUserId = appointmentsResult.currentUserId;
      const loadedDrafts = draftsResult.prescriptionDrafts;
      setAppointments(loadedAppointments);
      setCurrentUserId(loadedUserId);
      setDrafts(loadedDrafts);
      setAppointmentId((current) => {
        if (
          current &&
          loadedAppointments.some(
            (appointment) =>
              appointment.id === current &&
              isEligibleAppointment(appointment, loadedUserId),
          )
        ) {
          return current;
        }
        return (
          loadedDrafts.find((draft) =>
            loadedAppointments.some(
              (appointment) =>
                appointment.id === draft.appointment_id &&
                isEligibleAppointment(appointment, loadedUserId),
            ),
          )?.appointment_id ??
          loadedAppointments.find((appointment) =>
            isEligibleAppointment(appointment, loadedUserId),
          )?.id ??
          ''
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar receitas.',
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
      appointments.filter((appointment) =>
        isEligibleAppointment(appointment, currentUserId),
      ),
    [appointments, currentUserId],
  );

  const selectedDraft = drafts.find(
    (draft) => draft.appointment_id === appointmentId,
  );
  const selectedAppointment = eligibleAppointments.find(
    (appointment) => appointment.id === appointmentId,
  );
  const savedItems = selectedDraft ? selectedDraft.items.map(normalizeItem) : [];
  const normalizedItems = items.map(normalizeItem);
  const hasUnsavedChanges = selectedDraft
    ? JSON.stringify(normalizedItems) !== JSON.stringify(savedItems)
    : normalizedItems.some((item) => Object.values(item).some(Boolean));

  useEffect(() => {
    const draft = drafts.find((candidate) => candidate.appointment_id === appointmentId);
    const loadedItems = draft?.items ?? [];
    setItems(loadedItems.length > 0 ? loadedItems : [{ ...emptyItem }]);
  }, [appointmentId, drafts]);

  function updateItem(index: number, field: keyof PrescriptionItem, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function changeAppointment(nextAppointmentId: string) {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        'Há alterações não salvas. Deseja descartá-las e trocar de atendimento?',
      )
    ) {
      return;
    }
    setAppointmentId(nextAppointmentId);
    setNotice('');
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');

    const parsed = savePrescriptionDraftSchema.safeParse({
      appointment_id: appointmentId,
      items: normalizedItems,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Verifique os itens da prescrição.',
      );
      return;
    }

    setSaving(true);
    try {
      await salvarRascunhoReceita(parsed.data);
      setNotice('Rascunho salvo. Ele não foi assinado nem emitido.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar o rascunho.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <PageHeader
        title="Rascunhos de receita"
        description="Registre os itens definidos pelo veterinário responsável, vinculados ao atendimento."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Este módulo salva somente rascunhos clínicos. Não há catálogo ou sugestão
        de medicamentos, assinatura digital, emissão oficial, PDF ou envio ao tutor.
      </div>

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadData()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <Card>
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </Card>
      ) : errorMessage && eligibleAppointments.length === 0 ? null : eligibleAppointments.length === 0 ? (
        <EmptyState
          title="Nenhum atendimento elegível"
          description="Rascunhos só podem ser vinculados a atendimentos iniciados ou concluídos do veterinário responsável."
        />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card
            title="Prescrição em rascunho"
            description="Preencha manualmente conforme a avaliação clínica. O sistema não calcula nem recomenda dose."
          >
            <form className="grid gap-5" onSubmit={(event) => void saveDraft(event)}>
              <Select
                id="prescription-appointment"
                label="Atendimento e paciente"
                value={appointmentId}
                onChange={(event) => changeAppointment(event.target.value)}
                disabled={saving}
                required
              >
                <option value="">Selecione um atendimento</option>
                {eligibleAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.pet?.name ?? 'Paciente'} · {formatDate(appointment.starts_at)}
                  </option>
                ))}
              </Select>

              <fieldset
                className="grid gap-5 disabled:opacity-70"
                disabled={saving || !appointmentId}
              >
                <legend className="sr-only">Itens da receita</legend>
                {items.map((item, index) => (
                  <fieldset key={index} className="grid gap-4 rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 font-bold text-[#153b50]">
                      Item {index + 1}
                    </legend>
                    {items.length > 1 && (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setItems((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          Remover item
                        </Button>
                      </div>
                    )}
                    <Input
                      name={`prescription-${index}-name`}
                      label="Medicamento ou princípio ativo"
                      value={item.name}
                      onChange={(event) => updateItem(index, 'name', event.target.value)}
                      maxLength={160}
                      required
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        name={`prescription-${index}-presentation`}
                        label="Apresentação"
                        value={item.presentation}
                        onChange={(event) =>
                          updateItem(index, 'presentation', event.target.value)
                        }
                        maxLength={120}
                      />
                      <Input
                        name={`prescription-${index}-dose`}
                        label="Dose prescrita"
                        value={item.dose}
                        onChange={(event) => updateItem(index, 'dose', event.target.value)}
                        maxLength={250}
                      />
                      <Input
                        name={`prescription-${index}-route`}
                        label="Via"
                        value={item.route}
                        onChange={(event) => updateItem(index, 'route', event.target.value)}
                        maxLength={100}
                      />
                      <Input
                        name={`prescription-${index}-frequency`}
                        label="Frequência"
                        value={item.frequency}
                        onChange={(event) =>
                          updateItem(index, 'frequency', event.target.value)
                        }
                        maxLength={160}
                      />
                      <Input
                        name={`prescription-${index}-duration`}
                        label="Duração"
                        value={item.duration}
                        onChange={(event) =>
                          updateItem(index, 'duration', event.target.value)
                        }
                        maxLength={160}
                      />
                      <Input
                        name={`prescription-${index}-quantity`}
                        label="Quantidade"
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(index, 'quantity', event.target.value)
                        }
                        maxLength={120}
                      />
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-sm font-semibold text-[#153b50]">
                        Orientações específicas
                      </span>
                      <textarea
                        className="min-h-24 rounded-lg border border-slate-300 bg-white p-3 text-sm"
                        value={item.instructions}
                        onChange={(event) =>
                          updateItem(index, 'instructions', event.target.value)
                        }
                        maxLength={1000}
                      />
                    </label>
                  </fieldset>
                ))}

                <div className="flex flex-wrap justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={items.length >= 30}
                    onClick={() => setItems((current) => [...current, { ...emptyItem }])}
                  >
                    Adicionar item
                  </Button>
                  <Button type="submit" variant="secondary" disabled={saving || !appointmentId}>
                    {saving ? 'Salvando...' : selectedDraft ? 'Atualizar rascunho' : 'Salvar rascunho'}
                  </Button>
                </div>
              </fieldset>
            </form>
          </Card>

          <aside className="grid gap-5">
            <Card className="border-[#d4ebff] bg-[#f7fbff]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-[#153b50]">Prévia do rascunho</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {selectedAppointment
                      ? `${selectedAppointment.pet?.name ?? 'Paciente'} · ${selectedAppointment.pet?.species ?? 'Espécie não informada'}`
                      : 'Selecione um atendimento'}
                  </p>
                </div>
                <Badge variant={hasUnsavedChanges ? 'warning' : 'info'}>
                  {hasUnsavedChanges
                    ? 'Alterações não salvas'
                    : selectedDraft
                      ? 'Rascunho salvo · não assinado'
                      : 'Novo rascunho'}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <p className="font-semibold text-[#153b50]">
                      {item.name || 'Medicamento não informado'}
                    </p>
                    {[
                      item.presentation,
                      item.dose,
                      item.route,
                      item.frequency,
                      item.duration,
                      item.quantity,
                    ]
                      .filter(Boolean)
                      .map((value, valueIndex) => (
                        <p key={valueIndex} className="mt-1 text-sm text-slate-600">
                          {value}
                        </p>
                      ))}
                    {item.instructions && (
                      <p className="mt-2 text-sm text-slate-600">{item.instructions}</p>
                    )}
                  </div>
                ))}
              </div>
              {selectedDraft && (
                <p className="mt-3 text-xs text-slate-600">
                  Última atualização: {formatDate(selectedDraft.updated_at)}
                </p>
              )}
              <p className="mt-4 text-xs leading-5 text-amber-900">
                Esta visualização não é um documento emitido e não deve ser apresentada como receita válida.
              </p>
            </Card>
            <Card className="border-emerald-100 bg-emerald-50/60">
              <h2 className="font-bold text-emerald-900">Assinatura e emissão</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                Permanecem indisponíveis até integração e validação dos requisitos legais e de identidade profissional.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
