import { getSupabaseClient } from '@/lib/supabase';
import type {
  PaymentMethod,
  PaymentOrder,
  PetSubscription,
  PetSubscriptionStatus,
  SubscriptionPlan,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export async function listarPlanosClube(): Promise<{
  plans: SubscriptionPlan[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('subscription_plans')
      .select(
        'id, slug, name, description, price_cents, interval, discount_percent, benefits, active',
      )
      .eq('active', true)
      .order('price_cents', { ascending: true });

    if (error) throw error;

    return {
      plans: (data ?? []).map((plan) => ({
        ...plan,
        benefits: Array.isArray(plan.benefits)
          ? plan.benefits.map((item) => String(item))
          : [],
      })),
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar os planos do Clube DrVet.',
    );
  }
}

export async function listarAssinaturasPet(): Promise<{
  subscriptions: PetSubscription[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pet_subscriptions')
      .select(
        'id, plan_id, pet_id, owner_id, status, discount_percent, started_at, next_billing_at, cancelled_at',
      )
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = data ?? [];
    const planIds = Array.from(new Set(rows.map((r) => r.plan_id)));
    const petIds = Array.from(new Set(rows.map((r) => r.pet_id)));

    const [{ data: plans }, { data: pets }] = await Promise.all([
      planIds.length > 0
        ? supabase.from('subscription_plans').select('id, name').in('id', planIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      petIds.length > 0
        ? supabase.from('pets').select('id, name').in('id', petIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const planNames = new Map((plans ?? []).map((p) => [p.id, p.name]));
    const petNames = new Map((pets ?? []).map((p) => [p.id, p.name]));

    return {
      subscriptions: rows.map((row) => ({
        ...row,
        plan_name: planNames.get(row.plan_id),
        pet_name: petNames.get(row.pet_id),
      })),
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar suas assinaturas ativas.',
    );
  }
}

export async function assinarPlanoParaPet(input: {
  planId: string;
  petId: string;
  method: PaymentMethod;
}): Promise<{ subscription: PetSubscription }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('subscribe_pet_to_plan', {
      target_plan: input.planId,
      target_pet: input.petId,
      target_method: input.method,
    });
    if (error) throw error;
    return { subscription: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível concluir a assinatura do Clube DrVet.',
    );
  }
}

export async function atualizarStatusAssinatura(input: {
  subscriptionId: string;
  status: PetSubscriptionStatus;
}): Promise<{ subscription: PetSubscription }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pet_subscriptions')
      .update({
        status: input.status,
        cancelled_at:
          input.status === 'cancelled' ? new Date().toISOString() : null,
      })
      .eq('id', input.subscriptionId)
      .select(
        'id, plan_id, pet_id, owner_id, status, discount_percent, started_at, next_billing_at, cancelled_at',
      )
      .single();

    if (error) throw error;
    return { subscription: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar o status da assinatura.',
    );
  }
}

export async function listarPagamentosUsuario(): Promise<{
  payments: PaymentOrder[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('payment_orders')
      .select(
        'id, user_id, appointment_id, kind, description, amount_cents, discount_cents, net_amount_cents, method, status, external_reference, paid_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return { payments: data ?? [] };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar os comprovantes de pagamento.',
    );
  }
}

export async function pagarConsulta(input: {
  appointmentId: string;
  method: PaymentMethod;
  couponCode?: string | null;
}): Promise<{ payment: PaymentOrder }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc(
      'create_teleconsultation_payment',
      {
        target_appointment: input.appointmentId,
        target_method: input.method,
        target_coupon: input.couponCode?.trim() || null,
      },
    );
    if (error) throw error;
    return { payment: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar o pagamento da consulta.',
    );
  }
}
