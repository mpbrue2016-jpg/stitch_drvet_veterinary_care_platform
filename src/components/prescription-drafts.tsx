'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Printer, ShieldCheck } from 'lucide-react';
import { QrCodeBox } from '@/components/qr-code-box';
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
import {
  computePrescriptionDigestHex,
  evaluateDigitalSignatureReadiness,
} from '@/lib/clinical/prescription-digest';
import { savePrescriptionDraftSchema } from '@/lib/validations';
import { listarAgendamentos } from '@/services/appointments.service';
import {
  emitirReceitaOficial,
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
  const [issuing, setIssuing] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [documentDigestSha256, setDocumentDigestSha256] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const signatureReadiness = useMemo(
    () => evaluateDigitalSignatureReadiness(),
    [],
  );

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
      const queryAppointmentId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('appointmentId') ?? ''
          : '';
      setAppointmentId((current) => {
        if (
          queryAppointmentId &&
          loadedAppointments.some(
            (appointment) =>
              appointment.id === queryAppointmentId &&
              isEligibleAppointment(appointment, loadedUserId),
          )
        ) {
          return queryAppointmentId;
        }
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
  const isIssued = selectedDraft?.status === 'issued';
  const savedItems = selectedDraft ? selectedDraft.items.map(normalizeItem) : [];
  const normalizedItems = items.map(normalizeItem);
  const hasUnsavedChanges = selectedDraft
    ? JSON.stringify(normalizedItems) !== JSON.stringify(savedItems)
    : normalizedItems.some((item) => Object.values(item).some(Boolean));

  const verificationUrl = useMemo(() => {
    if (!selectedDraft?.verification_code) return '';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/receitas/verificar?code=${encodeURIComponent(selectedDraft.verification_code)}`;
  }, [selectedDraft?.verification_code]);

  useEffect(() => {
    const draft = drafts.find((candidate) => candidate.appointment_id === appointmentId);
    const loadedItems = draft?.items ?? [];
    setItems(loadedItems.length > 0 ? loadedItems : [{ ...emptyItem }]);
  }, [appointmentId, drafts]);

  useEffect(() => {
    let active = true;
    if (
      !selectedDraft ||
      selectedDraft.status !== 'issued' ||
      !selectedDraft.verification_code ||
      !selectedDraft.issued_at
    ) {
      setDocumentDigestSha256(null);
      return;
    }

    void computePrescriptionDigestHex({
      prescriptionId: selectedDraft.id,
      appointmentId: selectedDraft.appointment_id,
      organizationId: selectedDraft.organization_id,
      petId: selectedDraft.pet_id,
      veterinarianId: selectedDraft.veterinarian_id,
      verificationCode: selectedDraft.verification_code,
      issuedAt: selectedDraft.issued_at,
      items: selectedDraft.items,
    })
      .then((digest) => {
        if (active) setDocumentDigestSha256(digest);
      })
      .catch(() => {
        if (active) setDocumentDigestSha256(null);
      });

    return () => {
      active = false;
    };
  }, [selectedDraft]);

  function updateItem(index: number, field: keyof PrescriptionItem, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function changeAppointment(nextAppointmentId: string) {
    if (hasUnsavedChanges) {
      setPendingSwitchId(nextAppointmentId);
      return;
    }
    setPendingSwitchId(null);
    setAppointmentId(nextAppointmentId);
    setNotice('');
  }

  function confirmAppointmentSwitch() {
    if (pendingSwitchId === null) return;
    setAppointmentId(pendingSwitchId);
    setPendingSwitchId(null);
    setNotice('');
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isIssued) return;
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
      setNotice('Rascunho salvo. Você já pode emitir a receita oficial com QR Code.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar o rascunho.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueOfficial() {
    if (!appointmentId || hasUnsavedChanges || !selectedDraft) return;
    setErrorMessage('');
    setNotice('');
    setIssuing(true);
    try {
      const { prescriptionDraft, documentDigestSha256: serverDigest } =
        await emitirReceitaOficial(appointmentId);
      if (serverDigest) {
        setDocumentDigestSha256(serverDigest);
      }
      setNotice(
        `Receita oficial emitida! Código de verificação ${prescriptionDraft.verification_code ?? ''} enviado ao tutor.`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao emitir a receita oficial.',
      );
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5">
      <div className="print:hidden">
        <PageHeader
          title="Receitas e prescrição digital"
          description="Elabore o rascunho clínico, emita a receita oficial com QR Code de autenticidade e gere a via impressa para farmácia ou tutor."
        />
      </div>

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 print:hidden"
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
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 print:hidden" role="status">
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
          description="Receitas só podem ser vinculadas a atendimentos confirmados já iniciados ou concluídos do veterinário responsável."
        />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Card
            className="print:hidden"
            title={isIssued ? 'Prescrição emitida (bloqueada para edição)' : 'Prescrição veterinária'}
            description="Preencha os itens conforme a conduta clínica. Após salvar o rascunho, clique em Emitir receita oficial."
          >
            <form className="grid gap-5" onSubmit={(event) => void saveDraft(event)}>
              <Select
                id="prescription-appointment"
                label="Atendimento e paciente"
                value={appointmentId}
                onChange={(event) => changeAppointment(event.target.value)}
                disabled={saving || issuing}
                required
              >
                <option value="">Selecione um atendimento</option>
                {eligibleAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.pet?.name ?? 'Paciente'} · {formatDate(appointment.starts_at)}
                  </option>
                ))}
              </Select>

              {pendingSwitchId !== null && (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                  role="alert"
                >
                  <span>Há alterações não salvas. Deseja descartá-las e trocar de atendimento?</span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setPendingSwitchId(null)}
                      type="button"
                      variant="outline"
                    >
                      Manter atual
                    </Button>
                    <Button
                      onClick={confirmAppointmentSwitch}
                      type="button"
                      variant="secondary"
                    >
                      Trocar atendimento
                    </Button>
                  </div>
                </div>
              )}

              <fieldset
                className="grid gap-5 disabled:opacity-70"
                disabled={saving || issuing || !appointmentId || isIssued}
              >
                <legend className="sr-only">Itens da receita</legend>
                {items.map((item, index) => (
                  <fieldset key={index} className="grid gap-4 rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 font-bold text-[#153b50]">
                      Item {index + 1}
                    </legend>
                    {items.length > 1 && !isIssued && (
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

                {!isIssued && (
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
                )}
              </fieldset>
            </form>
          </Card>

          <aside className="grid gap-5">
            <Card className="border-[#d4ebff] bg-[#f7fbff] print:border-0 print:bg-white print:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-[#153b50]">
                    {isIssued ? 'Receituário Médico-Veterinário Oficial' : 'Prévia do rascunho'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {selectedAppointment
                      ? `${selectedAppointment.pet?.name ?? 'Paciente'} · ${selectedAppointment.pet?.species ?? 'Espécie não informada'}`
                      : 'Selecione um atendimento'}
                  </p>
                </div>
                <Badge variant={isIssued ? 'success' : hasUnsavedChanges ? 'warning' : 'info'}>
                  {isIssued
                    ? 'Emitida oficialmente'
                    : hasUnsavedChanges
                      ? 'Alterações não salvas'
                      : selectedDraft
                        ? 'Rascunho salvo'
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
                      {index + 1}. {item.name || 'Medicamento não informado'}
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
                  {isIssued && selectedDraft.issued_at
                    ? `Emitida em: ${formatDate(selectedDraft.issued_at)}`
                    : `Última atualização: ${formatDate(selectedDraft.updated_at)}`}
                </p>
              )}

              {isIssued && selectedDraft?.verification_code && verificationUrl && (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Código verificável: {selectedDraft.verification_code}</span>
                  </div>
                  <QrCodeBox
                    compact
                    downloadName={`receita-${selectedDraft.verification_code}.png`}
                    size={150}
                    subtitle="Aponte a câmera para validar autenticidade"
                    value={verificationUrl}
                  />
                  {documentDigestSha256 && (
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        Integridade criptográfica ({signatureReadiness.canonicalHashAlgorithm})
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-[#153b50]">
                        {documentDigestSha256}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Manifesto {signatureReadiness.schemaVersion} pronto para assinatura remota PAdES (ICP-Brasil em nuvem) sem armazenamento de chave privada.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 print:hidden">
                    <Button
                      onClick={() => window.print()}
                      type="button"
                      variant="secondary"
                    >
                      <Printer className="mr-1.5 h-4 w-4" />
                      Imprimir / Salvar PDF
                    </Button>
                    <Link
                      className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
                      href={`/receitas/verificar?code=${encodeURIComponent(selectedDraft.verification_code)}`}
                    >
                      Abrir link de verificação
                    </Link>
                  </div>
                </div>
              )}
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/70 print:hidden">
              <h2 className="flex items-center gap-2 font-bold text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                Emissão oficial e verificação pública
              </h2>
              <p className="mt-2 text-xs leading-5 text-emerald-900/80">
                Ao emitir, a prescrição ganha código verificável via QR Code, manifesto SHA-256 imutável e visibilidade para o tutor. Provedores ICP-Brasil previstos para assinatura remota PAdES:{' '}
                {signatureReadiness.supportedCloudProviders
                  .map((provider) => provider.label)
                  .join(', ')}
                .
              </p>
              {!isIssued && (
                <div className="mt-4">
                  <Button
                    disabled={!selectedDraft || hasUnsavedChanges || issuing || saving}
                    onClick={() => void handleIssueOfficial()}
                    type="button"
                    variant="secondary"
                  >
                    {issuing ? 'Emitindo receita...' : 'Emitir receita oficial com QR Code'}
                  </Button>
                  {(!selectedDraft || hasUnsavedChanges) && (
                    <p className="mt-2 text-xs text-slate-600">
                      Salve as alterações do rascunho antes de emitir oficialmente.
                    </p>
                  )}
                </div>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
