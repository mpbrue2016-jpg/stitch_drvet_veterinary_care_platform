'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
  Toast,
} from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabase';
import { listarIntegracoes, salvarIntegracao } from '@/services/admin.service';
import type {
  IntegrationConfig,
  IntegrationEnvironment,
  IntegrationProvider,
} from '@/types/entities';

const providerDetails: Record<
  IntegrationProvider,
  { name: string; category: string }
> = {
  asaas: { name: 'Asaas Pagamentos & Split D+0/D+1', category: 'Pagamentos' },
  mercado_pago: { name: 'Mercado Pago Checkout', category: 'Pagamentos' },
  livekit: { name: 'LiveKit Sala de Teleconsulta', category: 'Vídeo & WebRTC' },
  bling: { name: 'Bling ERP & Notas Fiscais', category: 'ERP Parceiro' },
  omie: { name: 'Omie ERP Financeiro', category: 'ERP Parceiro' },
};

export function IntegrationsAssistant() {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [dbHealth, setDbHealth] = useState<{
    status: string;
    latencyMs: number | null;
    realtimeOk: boolean;
    checkedAt: string | null;
  }>({
    status: 'Aguardando verificação',
    latencyMs: null,
    realtimeOk: false,
    checkedAt: null,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    provider: 'asaas' as IntegrationProvider,
    environment: 'sandbox' as IntegrationEnvironment,
    webhook_endpoint: '',
    active: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await listarIntegracoes();
      setIntegrations(result.integrations);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as integrações.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { integration } = await salvarIntegracao(form);
      setNotice(
        `Integração ${providerDetails[integration.provider].name} salva (${integration.last_status}).`,
      );
      setForm((prev) => ({ ...prev, webhook_endpoint: '' }));
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar integração.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnectivity() {
    setTestingHealth(true);
    setErrorMessage('');
    setNotice('');
    const started = performance.now();
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('subscription_plans')
        .select('id')
        .limit(1);
      if (error) throw error;
      const elapsed = Math.round(performance.now() - started);

      let realtimeOk = false;
      await new Promise<void>((resolve) => {
        const channel = supabase.channel(`health-check-${Date.now()}`);
        const timer = setTimeout(() => {
          void supabase.removeChannel(channel);
          resolve();
        }, 2000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            realtimeOk = true;
            clearTimeout(timer);
            void supabase.removeChannel(channel);
            resolve();
          }
        });
      });

      setDbHealth({
        status: '200 OK · PostgreSQL & RLS ativos',
        latencyMs: elapsed,
        realtimeOk,
        checkedAt: new Date().toISOString(),
      });
      setNotice(
        `Conexão validada em ${elapsed} ms${realtimeOk ? ' com Realtime CDC ativo' : ''}.`,
      );
    } catch (error) {
      setDbHealth({
        status: 'Falha na verificação',
        latencyMs: null,
        realtimeOk: false,
        checkedAt: new Date().toISOString(),
      });
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao testar conectividade com o Supabase.',
      );
    } finally {
      setTestingHealth(false);
    }
  }

  const activeCount = integrations.filter((item) => item.active).length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={testingHealth}
              onClick={() => void handleTestConnectivity()}
              type="button"
              variant="secondary"
            >
              {testingHealth
                ? 'Testando conexão...'
                : 'Testar PostgreSQL & Realtime'}
            </Button>
            <Link href="/admin">
              <Button variant="outline">Painel Master Admin</Button>
            </Link>
          </div>
        }
        description="Assistente de conexão segura para gateways financeiros (Asaas / Mercado Pago), salas LiveKit, ERP (Bling / Omie) e diagnóstico Supabase Realtime."
        title="Integrações & CDC Realtime"
      />

      {errorMessage && (
        <Toast
          message={errorMessage}
          onDismiss={() => setErrorMessage('')}
          variant="danger"
        />
      )}
      {notice && (
        <Toast
          message={notice}
          onDismiss={() => setNotice('')}
          variant="success"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          detail="Provedores ativos no banco"
          icon="⚡"
          label="Integrações ativas"
          value={loading ? '...' : String(activeCount)}
        />
        <MetricCard
          detail={dbHealth.status}
          icon="✓"
          label="PostgreSQL & RLS"
          value={
            dbHealth.latencyMs !== null ? `${dbHealth.latencyMs} ms` : 'Pronto'
          }
        />
        <MetricCard
          detail={
            dbHealth.checkedAt
              ? `Verificado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(dbHealth.checkedAt))}`
              : 'WebSocket CDC disponível'
          }
          icon="⇄"
          label="Supabase Realtime"
          value={dbHealth.realtimeOk ? 'Conectado' : 'Standby'}
        />
      </div>

      <Card
        description="Informe apenas URLs públicas de webhook e ambiente. Chaves secretas e tokens devem ficar exclusivamente nas variáveis de servidor / Edge Functions."
        title="Assistente de configuração de webhook"
      >
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={handleSave}
        >
          <Select
            label="Provedor"
            name="provider"
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                provider: e.target.value as IntegrationProvider,
              }))
            }
            value={form.provider}
          >
            {Object.entries(providerDetails).map(([key, item]) => (
              <option key={key} value={key}>
                {item.name}
              </option>
            ))}
          </Select>

          <Select
            label="Ambiente"
            name="environment"
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                environment: e.target.value as IntegrationEnvironment,
              }))
            }
            value={form.environment}
          >
            <option value="sandbox">Sandbox / Homologação</option>
            <option value="production">Produção</option>
          </Select>

          <Input
            label="URL do Webhook"
            maxLength={500}
            name="webhook_endpoint"
            onChange={(e) =>
              setForm((s) => ({ ...s, webhook_endpoint: e.target.value }))
            }
            placeholder="https://.../functions/v1/payment-webhook"
            required
            value={form.webhook_endpoint}
          />

          <Select
            label="Status"
            name="active"
            onChange={(e) =>
              setForm((s) => ({ ...s, active: e.target.value === 'true' }))
            }
            value={String(form.active)}
          >
            <option value="true">Ativo (200 OK)</option>
            <option value="false">Pausado</option>
          </Select>

          <div className="flex justify-end sm:col-span-2 lg:col-span-4">
            <Button disabled={saving} type="submit" variant="primary">
              {saving ? 'Salvando...' : 'Salvar e validar integração'}
            </Button>
          </div>
        </form>
      </Card>

      <Card
        description="Status persistido em integration_configs."
        title="Provedores configurados"
      >
        {loading ? (
          <div className="grid gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : integrations.length === 0 ? (
          <EmptyState
            description="Nenhuma integração foi configurada até o momento."
            title="Sem integrações registradas"
          />
        ) : (
          <div className="grid gap-3">
            {integrations.map((item) => {
              const info = providerDetails[item.provider];
              return (
                <article
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
                  key={item.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-[#153b50]">{info.name}</h3>
                      <Badge variant="info">{info.category}</Badge>
                      <Badge variant={item.active ? 'success' : 'warning'}>
                        {item.active ? item.last_status : 'Pausada'}
                      </Badge>
                      <Badge variant="neutral">
                        {item.environment === 'production'
                          ? 'Produção'
                          : 'Sandbox'}
                      </Badge>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-600">
                      Webhook: {item.webhook_endpoint}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.last_checked_at
                      ? `Último check: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.last_checked_at))}`
                      : 'Ainda não verificado'}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
