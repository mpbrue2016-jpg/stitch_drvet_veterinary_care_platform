'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
} from '@/components/ui';
import { listarPets } from '@/services/pets.service';
import {
  assinarPlanoParaPet,
  atualizarStatusAssinatura,
  listarAssinaturasPet,
  listarPagamentosUsuario,
  listarPlanosClube,
} from '@/services/subscriptions.service';
import type {
  PaymentMethod,
  PaymentOrder,
  Pet,
  PetSubscription,
  PetSubscriptionStatus,
  SubscriptionPlan,
} from '@/types/entities';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const subStatusLabel: Record<PetSubscriptionStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

const subStatusVariant: Record<
  PetSubscriptionStatus,
  'success' | 'warning' | 'neutral'
> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'neutral',
};

const paymentStatusVariant: Record<
  PaymentOrder['status'],
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  paid: 'success',
  pending: 'warning',
  refunded: 'neutral',
  cancelled: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function SubscriptionsClub() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [subscriptions, setSubscriptions] = useState<PetSubscription[]>([]);
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [plansRes, petsRes, subsRes, paymentsRes] = await Promise.all([
        listarPlanosClube(),
        listarPets(),
        listarAssinaturasPet(),
        listarPagamentosUsuario(),
      ]);
      setPlans(plansRes.plans);
      setPets(petsRes.pets);
      setSubscriptions(subsRes.subscriptions);
      setPayments(paymentsRes.payments);
      setSelectedPetId((current) =>
        petsRes.pets.some((p) => p.id === current)
          ? current
          : petsRes.pets[0]?.id ?? '',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar o Clube DrVet.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSubscribe(planId: string) {
    if (!selectedPetId) {
      setErrorMessage('Cadastre ou selecione um pet antes de assinar.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await assinarPlanoParaPet({
        planId,
        petId: selectedPetId,
        method: paymentMethod,
      });
      setNotice('Assinatura ativada no Clube DrVet e comprovante registrado.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a assinatura.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeStatus(
    subscriptionId: string,
    status: PetSubscriptionStatus,
  ) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await atualizarStatusAssinatura({ subscriptionId, status });
      setNotice('Status da assinatura atualizado.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao atualizar a assinatura.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Clube DrVet — Assinaturas Preventivas"
        description="Planos mensais de prevenção com descontos em teleconsultas, farmácias parceiras e comprovantes de pagamento."
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
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <Tabs
          label="Seções do Clube DrVet e comprovantes"
          tabs={[
            {
              id: 'planos',
              label: `Planos e assinaturas (${subscriptions.length})`,
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Configurar adesão"
                    description="Escolha o pet e a forma de pagamento para ativar um plano."
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select
                        id="club-pet"
                        label="Pet beneficiado"
                        onChange={(event) => setSelectedPetId(event.target.value)}
                        value={selectedPetId}
                      >
                        <option value="">Selecione um pet</option>
                        {pets.map((pet) => (
                          <option key={pet.id} value={pet.id}>
                            {pet.name} · {pet.species}
                          </option>
                        ))}
                      </Select>
                      <Select
                        id="club-method"
                        label="Forma de pagamento"
                        onChange={(event) =>
                          setPaymentMethod(event.target.value as PaymentMethod)
                        }
                        value={paymentMethod}
                      >
                        <option value="pix">Pix imediato</option>
                        <option value="credit_card">Cartão de crédito</option>
                        <option value="voucher">Voucher parceiro</option>
                      </Select>
                    </div>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    {plans.map((plan) => (
                      <Card
                        description={plan.description}
                        key={plan.id}
                        title={plan.name}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-2xl font-extrabold text-[#006b57]">
                            {brl.format(plan.price_cents / 100)}
                            <span className="text-xs font-medium text-slate-500">
                              /{plan.interval === 'annual' ? 'ano' : 'mês'}
                            </span>
                          </p>
                          <Badge variant="success">
                            {plan.discount_percent}% OFF
                          </Badge>
                        </div>
                        <ul className="mt-4 grid gap-1.5 text-sm text-slate-700">
                          {plan.benefits.map((benefit) => (
                            <li key={benefit}>✓ {benefit}</li>
                          ))}
                        </ul>
                        <div className="mt-5">
                          <Button
                            className="w-full"
                            disabled={busy || !selectedPetId}
                            onClick={() => void handleSubscribe(plan.id)}
                            type="button"
                            variant="secondary"
                          >
                            {busy ? 'Processando...' : 'Assinar para o pet selecionado'}
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Card
                    title="Minhas assinaturas"
                    description="Gerencie planos ativos, pausas ou cancelamentos."
                  >
                    {subscriptions.length === 0 ? (
                      <EmptyState
                        title="Nenhuma assinatura cadastrada"
                        description="Selecione um pet e ative um dos planos acima."
                      />
                    ) : (
                      <ul className="grid gap-3">
                        {subscriptions.map((sub) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                            key={sub.id}
                          >
                            <div>
                              <p className="font-bold text-[#153b50]">
                                {sub.plan_name ?? 'Plano Clube DrVet'} ·{' '}
                                {sub.pet_name ?? 'Pet'}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Desconto: {sub.discount_percent}% · Próxima renovação:{' '}
                                {formatDate(sub.next_billing_at)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={subStatusVariant[sub.status]}>
                                {subStatusLabel[sub.status]}
                              </Badge>
                              {sub.status === 'active' && (
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    void handleChangeStatus(sub.id, 'paused')
                                  }
                                  type="button"
                                  variant="outline"
                                >
                                  Pausar
                                </Button>
                              )}
                              {sub.status === 'paused' && (
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    void handleChangeStatus(sub.id, 'active')
                                  }
                                  type="button"
                                  variant="secondary"
                                >
                                  Reativar
                                </Button>
                              )}
                              {sub.status !== 'cancelled' && (
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    void handleChangeStatus(sub.id, 'cancelled')
                                  }
                                  type="button"
                                  variant="danger"
                                >
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              ),
            },
            {
              id: 'pagamentos',
              label: `Comprovantes (${payments.length})`,
              content: (
                <Card
                  title="Histórico de pagamentos e comprovantes"
                  description="Registros financeiros vinculados à sua conta."
                >
                  {payments.length === 0 ? (
                    <EmptyState
                      title="Nenhum pagamento registrado"
                      description="Seus comprovantes de assinatura e consultas aparecerão aqui."
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
                              Ref.: {payment.external_reference ?? payment.id.slice(0, 8)} ·{' '}
                              {payment.method.toUpperCase()} ·{' '}
                              {formatDate(payment.paid_at ?? payment.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[#006b57]">
                              {brl.format(payment.net_amount_cents / 100)}
                            </span>
                            <Badge variant={paymentStatusVariant[payment.status]}>
                              {payment.status === 'paid'
                                ? 'Pago'
                                : payment.status === 'pending'
                                  ? 'Pendente'
                                  : payment.status === 'refunded'
                                    ? 'Estornado'
                                    : 'Cancelado'}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
