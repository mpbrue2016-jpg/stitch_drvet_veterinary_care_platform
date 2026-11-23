'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Printer } from 'lucide-react';
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
import { getSupabaseClient } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listarAgendamentos } from '@/services/appointments.service';
import { buscarPerfilAtual } from '@/services/auth.service';
import {
  confirmarPagamentoBaixa,
  gerarCheckoutConsulta,
  listarPagamentosUsuario,
} from '@/services/subscriptions.service';
import type { UserRole } from '@/types/database';
import type {
  Appointment,
  PaymentMethod,
  PaymentOrder,
} from '@/types/entities';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const paymentStatusLabels: Record<PaymentOrder['status'], string> = {
  paid: 'Pago',
  pending: 'Pendente',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

const paymentStatusVariants: Record<
  PaymentOrder['status'],
  'success' | 'warning' | 'neutral' | 'danger'
> = {
  paid: 'success',
  pending: 'warning',
  refunded: 'neutral',
  cancelled: 'danger',
};

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
  const [userRole, setUserRole] = useState<UserRole>('tutor');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [couponCode, setCouponCode] = useState('');
  const [activePendingOrder, setActivePendingOrder] = useState<PaymentOrder | null>(null);
  const [copiedPixId, setCopiedPixId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [aptRes, payRes, profileRes] = await Promise.all([
        listarAgendamentos(),
        listarPagamentosUsuario(),
        buscarPerfilAtual().catch(() => null),
      ]);
      setAppointments(aptRes.appointments);
      setCurrentUserId(aptRes.currentUserId);
      setPayments(payRes.payments);
      if (profileRes?.role) setUserRole(profileRes.role);

      setActivePendingOrder((current) => {
        if (current) {
          const refreshed = payRes.payments.find((p) => p.id === current.id);
          if (refreshed && refreshed.status === 'pending') return refreshed;
          if (refreshed && refreshed.status === 'paid') return null;
        }
        return (
          payRes.payments.find((p) => p.status === 'pending' && Boolean(p.pix_payload)) ??
          null
        );
      });

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
      setSelectedAppointmentId((curr) =>
        curr && payableList.some((apt) => apt.id === curr)
          ? curr
          : requestedPayable?.id ?? payableList[0]?.id ?? '',
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

  useEffect(() => {
    if (!currentUserId || !isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`payment-orders-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_orders',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void loadData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadData]);

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
      const { payment } = await gerarCheckoutConsulta({
        appointmentId: selectedAppointmentId,
        method,
        couponCode,
      });
      setCouponCode('');
      if (payment.status === 'pending') {
        setActivePendingOrder(payment);
        setNotice(
          `Cobrança gerada (${payment.external_reference ?? payment.id.slice(0, 8)}). Conclua o pagamento e aguarde a confirmação.`,
        );
      } else {
        setNotice(
          `Pagamento confirmado (${payment.external_reference ?? payment.id.slice(0, 8)}).`,
        );
      }
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao gerar cobrança.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyPix(order: PaymentOrder) {
    if (!order.pix_payload || typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(order.pix_payload);
      setCopiedPixId(order.id);
      setNotice('Código PIX Copia e Cola copiado para a área de transferência.');
      setTimeout(() => setCopiedPixId(''), 2500);
    } catch {
      setNotice('Selecione e copie o código PIX manualmente abaixo.');
    }
  }

  async function handleSettleOrder(orderId: string) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { payment } = await confirmarPagamentoBaixa({ orderId });
      setNotice(
        `Recebimento confirmado para ${payment.external_reference ?? payment.id.slice(0, 8)}.`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar a baixa deste pagamento.',
      );
    } finally {
      setBusy(false);
    }
  }

  const canSettlePayments = userRole === 'admin';

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Checkout & Pagamentos"
        description="Geração segura de cobrança PIX ou cartão com desconto automático do Clube DrVet ou cupom parceiro."
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            {payments.some((p) => p.status === 'paid') && (
              <Button
                onClick={() => window.print()}
                type="button"
                variant="outline"
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Imprimir comprovantes
              </Button>
            )}
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
              href="/assinaturas"
            >
              Ver Clube DrVet
            </Link>
          </div>
        }
      />

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 print:hidden"
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
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 print:hidden"
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
          <div className="grid gap-5 print:hidden">
            <Card
              title="Pagar consulta agendada"
              description="Valor calculado conforme honorário do veterinário, Clube DrVet ativo ou cupom parceiro."
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
                    <option value="pix">Pix D+0 (QR Code instantâneo)</option>
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
                    {busy ? 'Gerando cobrança...' : 'Gerar cobrança de pagamento'}
                  </Button>
                </form>
              )}
            </Card>

            {activePendingOrder && activePendingOrder.status === 'pending' && (
              <Card
                title={`Pagamento aguardando confirmação (${brl.format(activePendingOrder.net_amount_cents / 100)})`}
                description="O status muda para Pago automaticamente via webhook assim que a liquidação bancária for confirmada."
              >
                <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                  {activePendingOrder.pix_payload && (
                    <QrCodeBox
                      compact
                      downloadName={`pix-${activePendingOrder.external_reference ?? activePendingOrder.id.slice(0, 8)}.png`}
                      size={168}
                      subtitle="Escaneie no app do seu banco"
                      title="PIX Copia e Cola"
                      value={activePendingOrder.pix_payload}
                    />
                  )}
                  <div className="grid gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Referência da cobrança
                      </p>
                      <p className="font-mono text-xs font-bold text-[#153b50]">
                        {activePendingOrder.external_reference ??
                          activePendingOrder.id}
                      </p>
                    </div>
                    {activePendingOrder.pix_payload && (
                      <>
                        <p className="break-all rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                          {activePendingOrder.pix_payload}
                        </p>
                        <Button
                          onClick={() => void handleCopyPix(activePendingOrder)}
                          type="button"
                          variant="outline"
                        >
                          {copiedPixId === activePendingOrder.id ? (
                            <>
                              <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" />
                              Código PIX copiado
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1.5 h-4 w-4" />
                              Copiar código PIX
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card
            title="Comprovantes e cobranças"
            description="Histórico financeiro de consultas, assinaturas e liquidações."
          >
            {payments.length === 0 ? (
              <EmptyState
                title="Sem comprovantes"
                description="Os pagamentos gerados e confirmados ficarão disponíveis aqui."
              />
            ) : (
              <ul className="grid gap-3">
                {payments.map((payment) => (
                  <li
                    className="grid gap-2 rounded-xl bg-[#f6faff] p-4"
                    key={payment.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                        <Badge variant={paymentStatusVariants[payment.status]}>
                          {paymentStatusLabels[payment.status]}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                      {payment.status === 'pending' && payment.pix_payload && (
                        <Button
                          className="min-h-8 px-3 text-xs"
                          onClick={() => setActivePendingOrder(payment)}
                          type="button"
                          variant="outline"
                        >
                          Ver QR Code PIX
                        </Button>
                      )}
                      {payment.status === 'pending' && canSettlePayments && (
                        <Button
                          className="min-h-8 px-3 text-xs"
                          disabled={busy}
                          onClick={() => void handleSettleOrder(payment.id)}
                          type="button"
                          variant="secondary"
                        >
                          Confirmar Recebimento (Baixa)
                        </Button>
                      )}
                      {payment.status === 'paid' && (
                        <Button
                          className="min-h-8 px-3 text-xs"
                          onClick={() => window.print()}
                          type="button"
                          variant="outline"
                        >
                          <Printer className="mr-1 h-3.5 w-3.5" />
                          Imprimir recibo
                        </Button>
                      )}
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
