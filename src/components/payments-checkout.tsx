'use client';

import Link from 'next/link';
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
import { listarAgendamentos } from '@/services/appointments.service';
import {
  listarPagamentosUsuario,
  pagarConsulta,
} from '@/services/subscriptions.service';
import type {
  Appointment,
  PaymentMethod,
  PaymentOrder,
} from '@/types/entities';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PaymentsCheckout() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [aptRes, payRes] = await Promise.all([
        listarAgendamentos(),
        listarPagamentosUsuario(),
      ]);
      setAppointments(aptRes.appointments);
      setCurrentUserId(aptRes.currentUserId);
      setPayments(payRes.payments);

      const urlParams =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      const requestedAptId = urlParams?.get('appointmentId') ?? '';
      const requestedCoupon = urlParams?.get('cupom') ?? '';
      if (requestedCoupon) {
        setCouponCode((curr) => curr || requestedCoupon.trim().toUpperCase().slice(0, 24));
      }

      const paidIds = new Set(
        payRes.payments
          .filter((p) => p.status === 'paid' && p.appointment_id)
          .map((p) => p.appointment_id),
      );
      const payableList = aptRes.appointments.filter(
        (apt) =>
          apt.tutor_id === aptRes.currentUserId &&
          apt.status !== 'cancelled' &&
          !paidIds.has(apt.id),
      );
      const requestedPayable = requestedAptId
        ? payableList.find((apt) => apt.id === requestedAptId)
        : undefined;
      setSelectedAppointmentId(
        (curr) => curr || requestedPayable?.id || payableList[0]?.id || '',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar pagamentos e checkout.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const paidAppointmentIds = useMemo(
    () =>
      new Set(
        payments
          .filter((p) => p.status === 'paid' && p.appointment_id)
          .map((p) => p.appointment_id),
      ),
    [payments],
  );

  const payableAppointments = useMemo(
    () =>
      appointments.filter(
        (apt) =>
          apt.tutor_id === currentUserId &&
          apt.status !== 'cancelled' &&
          !paidAppointmentIds.has(apt.id),
      ),
    [appointments, currentUserId, paidAppointmentIds],
  );

  async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointmentId) return;
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { payment } = await pagarConsulta({
        appointmentId: selectedAppointmentId,
        method,
        couponCode,
      });
      setCouponCode('');
      setNotice(
        `Pagamento confirmado (${payment.external_reference ?? payment.id.slice(0, 8)}).`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao concluir pagamento.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Checkout & Pagamentos"
        description="Pagamento seguro de consultas com aplicação automática de desconto Clube DrVet ou cupom de parceiro."
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
            href="/assinaturas"
          >
            Ver Clube DrVet
          </Link>
        }
      />

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button onClick={() => void loadData()} type="button" variant="outline">
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

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card
            title="Pagar consulta agendada"
            description="Valor base R$ 180,00 com desconto automático do Clube DrVet ou cupom parceiro (ex.: DRVET15)."
          >
            {payableAppointments.length === 0 ? (
              <EmptyState
                title="Nenhuma consulta pendente de pagamento"
                description="Suas consultas em aberto ou já quitadas aparecerão na lista de comprovantes."
              />
            ) : (
              <form
                className="grid gap-4"
                onSubmit={(event) => void handleCheckout(event)}
              >
                <Select
                  id="pay-apt"
                  label="Consulta"
                  onChange={(event) =>
                    setSelectedAppointmentId(event.target.value)
                  }
                  value={selectedAppointmentId}
                >
                  {payableAppointments.map((apt) => (
                    <option key={apt.id} value={apt.id}>
                      {apt.pet?.name ?? 'Pet'} · {formatDate(apt.starts_at)}
                    </option>
                  ))}
                </Select>
                <Select
                  id="pay-method"
                  label="Forma de pagamento"
                  onChange={(event) =>
                    setMethod(event.target.value as PaymentMethod)
                  }
                  value={method}
                >
                  <option value="pix">Pix D+0 (aprovação imediata)</option>
                  <option value="credit_card">Cartão de crédito</option>
                  <option value="voucher">Voucher / Crédito Parceiro</option>
                </Select>
                <Input
                  id="pay-coupon"
                  label="Cupom de parceiro (opcional)"
                  maxLength={24}
                  onChange={(event) =>
                    setCouponCode(event.target.value.toUpperCase())
                  }
                  placeholder="Ex.: DRVET15"
                  value={couponCode}
                />
                <Button
                  disabled={busy || !selectedAppointmentId}
                  type="submit"
                  variant="secondary"
                >
                  {busy ? 'Confirmando...' : 'Confirmar pagamento'}
                </Button>
              </form>
            )}
          </Card>

          <Card
            title="Comprovantes emitidos"
            description="Histórico de consultas, assinaturas e dispensações."
          >
            {payments.length === 0 ? (
              <EmptyState
                title="Sem comprovantes"
                description="Os pagamentos confirmados ficarão disponíveis aqui."
              />
            ) : (
              <ul className="grid gap-3">
                {payments.map((payment) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                    key={payment.id}
                  >
                    <div>
                      <p className="font-bold text-[#153b50]">
                        {payment.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {payment.external_reference ?? payment.id.slice(0, 8)} ·{' '}
                        {payment.method.toUpperCase()} ·{' '}
                        {formatDate(payment.paid_at ?? payment.created_at)}
                      </p>
                      {payment.discount_cents > 0 && (
                        <p className="mt-1 text-xs font-semibold text-[#006b57]">
                          Desconto aplicado:{' '}
                          {brl.format(payment.discount_cents / 100)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#153b50]">
                        {brl.format(payment.net_amount_cents / 100)}
                      </span>
                      <Badge
                        variant={
                          payment.status === 'paid' ? 'success' : 'warning'
                        }
                      >
                        {payment.status === 'paid' ? 'Pago' : payment.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
