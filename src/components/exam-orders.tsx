'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

type Pet = { id: string; name: string; species: string };
type Appointment = {
  id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  starts_at: string;
  ends_at: string;
  pet_id: string;
  veterinarian_id: string;
  pet: Pet | null;
};
type ExamOrder = {
  id: string;
  appointment_id: string;
  pet_id: string;
  veterinarian_id: string;
  modality: 'laboratory' | 'imaging';
  exam_name: string;
  clinical_indication: string;
  instructions: string | null;
  status: 'requested' | 'resulted';
  result_summary: string | null;
  laboratory_name: string | null;
  performed_at: string | null;
  requested_at: string;
  resulted_at: string | null;
  pet: Pet | null;
};
type OrderFields = {
  appointment_id: string;
  modality: 'laboratory' | 'imaging';
  exam_name: string;
  clinical_indication: string;
  instructions: string;
};
type ResultFields = {
  result_summary: string;
  laboratory_name: string;
  performed_at: string;
};

const initialOrder: OrderFields = {
  appointment_id: '',
  modality: 'laboratory',
  exam_name: '',
  clinical_indication: '',
  instructions: '',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ExamOrders({ appointmentId }: { appointmentId: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [orderFields, setOrderFields] = useState<OrderFields>(initialOrder);
  const [resultFields, setResultFields] = useState<Record<string, ResultFields>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const ordersUrl = appointmentId
        ? `/api/exam-orders?appointmentId=${encodeURIComponent(appointmentId)}`
        : '/api/exam-orders';
      const [appointmentsResponse, ordersResponse] = await Promise.all([
        fetch('/api/appointments'),
        fetch(ordersUrl),
      ]);
      const appointmentsResult: {
        appointments?: Appointment[];
        currentUserId?: string;
        error?: string;
      } = await appointmentsResponse.json();
      const ordersResult: {
        examOrders?: ExamOrder[];
        error?: string;
      } = await ordersResponse.json();

      if (!appointmentsResponse.ok) {
        throw new Error(
          appointmentsResult.error ?? 'Não foi possível carregar os atendimentos.',
        );
      }
      if (!ordersResponse.ok) {
        throw new Error(
          ordersResult.error ?? 'Não foi possível carregar os exames.',
        );
      }

      const loadedAppointments = appointmentsResult.appointments ?? [];
      setAppointments(loadedAppointments);
      setCurrentUserId(appointmentsResult.currentUserId ?? '');
      const loadedOrders = ordersResult.examOrders ?? [];
      setOrders(loadedOrders);
      setResultFields((current) => {
        const next = { ...current };
        loadedOrders.forEach((order) => {
          next[order.id] ??= {
            result_summary: '',
            laboratory_name: '',
            performed_at: '',
          };
        });
        return next;
      });

      if (
        appointmentId &&
        loadedAppointments.some((appointment) => appointment.id === appointmentId)
      ) {
        setOrderFields((current) => ({ ...current, appointment_id: appointmentId }));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar solicitações de exames.',
      );
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eligibleAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          appointment.veterinarian_id === currentUserId &&
          (appointment.status === 'confirmed' ||
            appointment.status === 'completed') &&
          new Date(appointment.starts_at).getTime() <= Date.now(),
      ),
    [appointments, currentUserId],
  );

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const response = await fetch('/api/exam-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...orderFields,
          instructions: orderFields.instructions.trim() || null,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível solicitar o exame.');
      }
      setOrderFields((current) => ({
        ...initialOrder,
        appointment_id: current.appointment_id,
      }));
      setNotice('Solicitação registrada no histórico do paciente.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao solicitar o exame.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function recordResult(
    event: React.FormEvent<HTMLFormElement>,
    orderId: string,
  ) {
    event.preventDefault();
    const values = resultFields[orderId];
    if (!values) return;

    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const response = await fetch('/api/exam-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          result_summary: values.result_summary,
          laboratory_name: values.laboratory_name.trim() || null,
          performed_at: values.performed_at
            ? new Date(values.performed_at).toISOString()
            : null,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível registrar o resultado.');
      }
      setNotice('Resultado registrado e bloqueado para alterações.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao registrar o resultado.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Solicitação de exames"
        description="Pedidos e resultados ficam vinculados ao paciente e ao atendimento."
      />

      {errorMessage && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
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
          title="Novo pedido"
          description="Disponível ao veterinário designado a partir do início do atendimento."
        >
          <form className="grid gap-4" onSubmit={(event) => void createOrder(event)}>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#153b50]">
                Atendimento
              </span>
              <select
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                onChange={(event) =>
                  setOrderFields((current) => ({
                    ...current,
                    appointment_id: event.target.value,
                  }))
                }
                required
                value={orderFields.appointment_id}
              >
                <option value="">Selecione paciente e atendimento</option>
                {eligibleAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.pet?.name ?? 'Paciente'} ·{' '}
                    {formatDate(appointment.starts_at)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">
                  Tipo de exame
                </span>
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  onChange={(event) =>
                    setOrderFields((current) => ({
                      ...current,
                      modality: event.target.value as OrderFields['modality'],
                    }))
                  }
                  value={orderFields.modality}
                >
                  <option value="laboratory">Laboratorial</option>
                  <option value="imaging">Imagem</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[#153b50]">
                  Nome do exame
                </span>
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  maxLength={160}
                  onChange={(event) =>
                    setOrderFields((current) => ({
                      ...current,
                      exam_name: event.target.value,
                    }))
                  }
                  required
                  value={orderFields.exam_name}
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#153b50]">
                Indicação clínica
              </span>
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                maxLength={2000}
                onChange={(event) =>
                  setOrderFields((current) => ({
                    ...current,
                    clinical_indication: event.target.value,
                  }))
                }
                required
                value={orderFields.clinical_indication}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-[#153b50]">
                Instruções para coleta/realização
              </span>
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                maxLength={2000}
                onChange={(event) =>
                  setOrderFields((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
                value={orderFields.instructions}
              />
            </label>
            <div className="flex justify-end">
              <Button disabled={saving} type="submit" variant="secondary">
                {saving ? 'Salvando...' : 'Solicitar exame'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Pedidos e resultados"
        description="Resultados são adicionados uma vez e não podem ser alterados pela aplicação."
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Carregando exames...
          </p>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <p className="font-semibold text-[#153b50]">Nenhum exame encontrado</p>
            <p className="mt-2 text-sm text-slate-600">
              Os pedidos aparecerão após serem registrados para um atendimento.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4">
            {orders.map((order) => (
              <li className="rounded-2xl bg-[#f6faff] p-4" key={order.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#153b50]">{order.exam_name}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {order.pet
                        ? `${order.pet.name} · ${order.pet.species}`
                        : 'Paciente'}
                      {' · '}
                      {order.modality === 'laboratory'
                        ? 'Laboratorial'
                        : 'Imagem'}
                    </p>
                  </div>
                  <Badge variant={order.status === 'resulted' ? 'success' : 'warning'}>
                    {order.status === 'resulted' ? 'Resultado registrado' : 'Solicitado'}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold">Indicação: </span>
                  {order.clinical_indication}
                </p>
                {order.instructions && (
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold">Instruções: </span>
                    {order.instructions}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Solicitado em {formatDate(order.requested_at)}
                </p>

                {order.status === 'resulted' && order.result_summary && (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4">
                    <p className="text-sm font-bold text-[#153b50]">
                      Resultado ·{' '}
                      {order.resulted_at ? formatDate(order.resulted_at) : ''}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      {order.result_summary}
                    </p>
                    {order.laboratory_name && (
                      <p className="mt-2 text-xs text-slate-500">
                        Laboratório: {order.laboratory_name}
                      </p>
                    )}
                  </div>
                )}

                {order.status === 'requested' &&
                  order.veterinarian_id === currentUserId && (
                    <form
                      className="mt-4 grid gap-3 border-t border-slate-200 pt-4"
                      onSubmit={(event) => void recordResult(event, order.id)}
                    >
                      <label className="grid gap-1.5">
                        <span className="text-sm font-semibold text-[#153b50]">
                          Registrar resultado
                        </span>
                        <textarea
                          className="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          maxLength={10000}
                          onChange={(event) =>
                            setResultFields((current) => ({
                              ...current,
                              [order.id]: {
                                result_summary: event.target.value,
                                laboratory_name:
                                  current[order.id]?.laboratory_name ?? '',
                                performed_at:
                                  current[order.id]?.performed_at ?? '',
                              },
                            }))
                          }
                          required
                          value={resultFields[order.id]?.result_summary ?? ''}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5">
                          <span className="text-sm font-semibold text-[#153b50]">
                            Laboratório
                          </span>
                          <input
                            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                            maxLength={160}
                            onChange={(event) =>
                              setResultFields((current) => ({
                                ...current,
                                [order.id]: {
                                  result_summary:
                                    current[order.id]?.result_summary ?? '',
                                  laboratory_name: event.target.value,
                                  performed_at:
                                    current[order.id]?.performed_at ?? '',
                                },
                              }))
                            }
                            value={resultFields[order.id]?.laboratory_name ?? ''}
                          />
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-sm font-semibold text-[#153b50]">
                            Data da realização
                          </span>
                          <input
                            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                            max={new Date().toISOString().slice(0, 16)}
                            onChange={(event) =>
                              setResultFields((current) => ({
                                ...current,
                                [order.id]: {
                                  result_summary:
                                    current[order.id]?.result_summary ?? '',
                                  laboratory_name:
                                    current[order.id]?.laboratory_name ?? '',
                                  performed_at: event.target.value,
                                },
                              }))
                            }
                            type="datetime-local"
                            value={resultFields[order.id]?.performed_at ?? ''}
                          />
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <Button disabled={saving} type="submit" variant="outline">
                          {saving ? 'Salvando...' : 'Salvar resultado'}
                        </Button>
                      </div>
                    </form>
                  )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs leading-5 text-slate-500">
        Resultados são registros informativos associados ao pedido; anexos e integração
        com laboratórios ainda não estão habilitados.
      </p>
    </div>
  );
}
