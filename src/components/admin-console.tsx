'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
} from '@/components/ui';
import {
  atualizarRoleUsuarioAdmin,
  avaliarSolicitacaoPerfil,
  buscarProntidaoMvpAdmin,
  listarIntegracoes,
  listarSolicitacoesPerfil,
  listarUsuariosAdmin,
  salvarIntegracao,
  testarIntegracao,
  type AdminMvpReadinessPayload,
} from '@/services/admin.service';
import {
  aprovarVeterinario,
  listarOrganizacoesEVeterinarios,
} from '@/services/organizations.service';
import type { UserRole } from '@/types/database';
import type {
  IntegrationConfig,
  IntegrationEnvironment,
  IntegrationProvider,
  RoleApplication,
  UserProfile,
  VeterinarianProfile,
} from '@/types/entities';

const roleLabels: Record<UserRole, string> = {
  tutor: 'Tutor',
  veterinarian: 'Veterinário',
  partner: 'Parceiro B2B',
  admin: 'Admin Master',
};

const providerLabels: Record<IntegrationProvider, string> = {
  asaas: 'Asaas Pagamentos & Split',
  mercado_pago: 'Mercado Pago Checkout',
  livekit: 'LiveKit Teleconsulta',
  bling: 'Bling ERP',
  omie: 'Omie ERP',
};

export function AdminConsole() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [professionals, setProfessionals] = useState<VeterinarianProfile[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [mvpReadiness, setMvpReadiness] =
    useState<AdminMvpReadinessPayload | null>(null);
  const [testingId, setTestingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const [integrationForm, setIntegrationForm] = useState({
    provider: 'asaas' as IntegrationProvider,
    environment: 'sandbox' as IntegrationEnvironment,
    webhook_endpoint: '',
    active: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [usersRes, orgsRes, intRes, appsRes, readinessRes] =
        await Promise.all([
          listarUsuariosAdmin(),
          listarOrganizacoesEVeterinarios().catch(() => ({
            professionals: [] as VeterinarianProfile[],
          })),
          listarIntegracoes(),
          listarSolicitacoesPerfil().catch(() => ({
            applications: [] as RoleApplication[],
          })),
          buscarProntidaoMvpAdmin().catch(() => null),
        ]);
      setUsers(usersRes.users);
      setProfessionals(orgsRes.professionals);
      setIntegrations(intRes.integrations);
      setApplications(appsRes.applications);
      setMvpReadiness(readinessRes);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar o painel administrativo.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRoleChange(userId: string, nextRole: UserRole) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await atualizarRoleUsuarioAdmin({ userId, role: nextRole });
      setNotice('Permissão RBAC atualizada com sucesso.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao atualizar permissão.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveVet(organizationId: string, userId: string) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await aprovarVeterinario({
        organization_id: organizationId,
        user_id: userId,
      });
      setNotice('Credenciamento veterinário aprovado.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao aprovar profissional.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewApplication(applicationId: string, approve: boolean) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await avaliarSolicitacaoPerfil({
        applicationId,
        approve,
        notes: approve ? 'Credenciamento aprovado pelo Admin Master' : 'Documentação recusada',
      });
      setNotice(
        approve
          ? 'Solicitação aprovada! Perfil RBAC e organização vinculados.'
          : 'Solicitação marcada como recusada.',
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao avaliar solicitação de credenciamento.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { integration } = await salvarIntegracao(integrationForm);
      setIntegrationForm((curr) => ({ ...curr, webhook_endpoint: '' }));
      setNotice(
        `Configuração salva (${integration.last_status}). Use "Testar HTTP" abaixo para validar conectividade real.`,
      );
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar integração.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleProbeIntegration(integrationId: string) {
    setTestingId(integrationId);
    setErrorMessage('');
    setNotice('');
    try {
      const { integration, reachable } = await testarIntegracao(integrationId);
      setIntegrations((current) =>
        current.map((item) => (item.id === integration.id ? integration : item)),
      );
      setNotice(
        reachable
          ? `Endpoint respondeu: ${integration.last_status}.`
          : `Teste concluído sem alcance: ${integration.last_status}.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Falha ao testar endpoint HTTP.',
      );
    } finally {
      setTestingId('');
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        action={
          <Link href="/admin/integracoes">
            <Button variant="outline">Assistente de Integrações &amp; CDC</Button>
          </Link>
        }
        title="Painel Master Admin & Integrações"
        description="Governança RBAC de usuários, aprovação de veterinários e endpoints de webhooks (Asaas, Mercado Pago, LiveKit e ERPs)."
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
        <div className="grid gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <Tabs
          label="Módulos administrativos"
          tabs={[
            {
              id: 'rbac',
              label: `Usuários & RBAC (${users.length})`,
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Usuários da plataforma"
                    description="Defina o perfil global de acesso (Tutor, Veterinário, Parceiro ou Admin)."
                  >
                    {users.length === 0 ? (
                      <EmptyState
                        title="Nenhum usuário listado"
                        description="Os perfis registrados no Supabase Auth aparecerão aqui."
                      />
                    ) : (
                      <ul className="grid gap-3">
                        {users.map((user) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                            key={user.id}
                          >
                            <div>
                              <p className="font-bold text-[#153b50]">
                                {user.display_name || user.email || 'Usuário'}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {user.email ?? user.id}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  user.role === 'admin' ? 'success' : 'info'
                                }
                              >
                                {roleLabels[user.role]}
                              </Badge>
                              <select
                                aria-label={`Alterar perfil de ${user.display_name || user.email}`}
                                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-[#153b50]"
                                disabled={busy}
                                onChange={(event) =>
                                  void handleRoleChange(
                                    user.id,
                                    event.target.value as UserRole,
                                  )
                                }
                                value={user.role}
                              >
                                <option value="tutor">Tutor</option>
                                <option value="veterinarian">Veterinário</option>
                                <option value="partner">Parceiro B2B</option>
                                <option value="admin">Admin Master</option>
                              </select>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  {professionals.length > 0 && (
                    <Card
                      title="Credenciamento veterinário (CRMV)"
                      description="Aprove ou acompanhe os profissionais vinculados às clínicas."
                    >
                      <ul className="grid gap-3">
                        {professionals.map((vet) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                            key={`${vet.organization_id}-${vet.user_id}`}
                          >
                            <div>
                              <p className="font-bold text-[#153b50]">
                                {vet.display_name ?? vet.user_id} · CRMV-
                                {vet.registration_region}{' '}
                                {vet.registration_number}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {vet.specialty ?? 'Clínica Geral'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  vet.status === 'approved'
                                    ? 'success'
                                    : 'warning'
                                }
                              >
                                {vet.status === 'approved'
                                  ? 'Aprovado'
                                  : 'Pendente'}
                              </Badge>
                              {vet.status !== 'approved' && (
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() =>
                                    void handleApproveVet(
                                      vet.organization_id,
                                      vet.user_id,
                                    )
                                  }
                                  type="button"
                                  variant="secondary"
                                >
                                  Aprovar CRMV
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              ),
            },
            {
              id: 'credenciamentos',
              label: `Solicitações (${applications.filter((a) => a.status === 'pending').length})`,
              content: (
                <Card
                  title="Fila de credenciamento (Veterinários & Parceiros B2B)"
                  description="Analise solicitações enviadas em Meu Perfil. Ao aprovar, o perfil RBAC e a organização são criados transacionalmente."
                >
                  {applications.length === 0 ? (
                    <EmptyState
                      title="Nenhuma solicitação registrada"
                      description="Pedidos de credenciamento CRMV ou Pet Shop aparecerão aqui."
                    />
                  ) : (
                    <ul className="grid gap-3">
                      {applications.map((app) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                          key={app.id}
                        >
                          <div>
                            <p className="font-bold text-[#153b50]">
                              {app.organization_name} ·{' '}
                              {app.requested_role === 'veterinarian'
                                ? 'Médico-Veterinário'
                                : 'Parceiro B2B'}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              Doc: {app.document_id}
                              {app.registration_region ? `-${app.registration_region}` : ''}
                              {app.specialty ? ` · ${app.specialty}` : ''}
                              {app.city ? ` · ${app.city}/${app.state ?? ''}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                app.status === 'approved'
                                  ? 'success'
                                  : app.status === 'pending'
                                    ? 'warning'
                                    : 'danger'
                              }
                            >
                              {app.status === 'approved'
                                ? 'Aprovado'
                                : app.status === 'pending'
                                  ? 'Pendente'
                                  : 'Recusado'}
                            </Badge>
                            {app.status === 'pending' && (
                              <>
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() => void handleReviewApplication(app.id, true)}
                                  type="button"
                                  variant="secondary"
                                >
                                  Aprovar
                                </Button>
                                <Button
                                  className="min-h-9 px-3 text-xs"
                                  disabled={busy}
                                  onClick={() => void handleReviewApplication(app.id, false)}
                                  type="button"
                                  variant="danger"
                                >
                                  Recusar
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ),
            },
            {
              id: 'integracoes',
              label: `Integrações (${integrations.length})`,
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Provedores conectados"
                    description="Metadados de webhooks e ambiente. Teste endpoints reais com bloqueio SSRF no servidor."
                  >
                    {integrations.length === 0 ? (
                      <EmptyState
                        title="Nenhuma integração configurada"
                        description="Cadastre o endpoint de webhook abaixo para ativar Asaas, Mercado Pago, LiveKit ou ERP."
                      />
                    ) : (
                      <ul className="grid gap-3">
                        {integrations.map((cfg) => (
                          <li
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-4"
                            key={cfg.id}
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-[#153b50]">
                                {providerLabels[cfg.provider]}
                              </p>
                              <p className="mt-1 truncate font-mono text-xs text-slate-600">
                                {cfg.webhook_endpoint}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="info">{cfg.environment}</Badge>
                              <Badge
                                variant={
                                  !cfg.active
                                    ? 'warning'
                                    : cfg.last_status.startsWith('2') ||
                                        cfg.last_status.startsWith('3') ||
                                        cfg.last_status === '200 OK'
                                      ? 'success'
                                      : 'neutral'
                                }
                              >
                                {cfg.active ? cfg.last_status : 'Inativo'}
                              </Badge>
                              <Button
                                className="min-h-8 px-3 text-xs"
                                disabled={testingId === cfg.id}
                                onClick={() => void handleProbeIntegration(cfg.id)}
                                type="button"
                                variant="outline"
                              >
                                {testingId === cfg.id ? 'Testando...' : 'Testar HTTP'}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card
                    title="Configurar endpoint de integração"
                    description="Atualize a URL de webhook sem expor chaves privadas no navegador."
                  >
                    <form
                      className="grid gap-4 sm:grid-cols-2"
                      onSubmit={(event) => void handleSaveIntegration(event)}
                    >
                      <Select
                        id="int-provider"
                        label="Provedor"
                        onChange={(event) =>
                          setIntegrationForm((curr) => ({
                            ...curr,
                            provider: event.target.value as IntegrationProvider,
                          }))
                        }
                        value={integrationForm.provider}
                      >
                        <option value="asaas">Asaas Pagamentos</option>
                        <option value="mercado_pago">Mercado Pago</option>
                        <option value="livekit">LiveKit Vídeo</option>
                        <option value="bling">Bling ERP</option>
                        <option value="omie">Omie ERP</option>
                      </Select>
                      <Select
                        id="int-env"
                        label="Ambiente"
                        onChange={(event) =>
                          setIntegrationForm((curr) => ({
                            ...curr,
                            environment: event.target
                              .value as IntegrationEnvironment,
                          }))
                        }
                        value={integrationForm.environment}
                      >
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Produção</option>
                      </Select>
                      <div className="sm:col-span-2">
                        <Input
                          id="int-url"
                          label="URL do Webhook / Endpoint"
                          onChange={(event) =>
                            setIntegrationForm((curr) => ({
                              ...curr,
                              webhook_endpoint: event.target.value,
                            }))
                          }
                          placeholder="https://seu-projeto.supabase.co/functions/v1/payment-webhook"
                          required
                          type="url"
                          value={integrationForm.webhook_endpoint}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#153b50]">
                        <input
                          checked={integrationForm.active}
                          onChange={(event) =>
                            setIntegrationForm((curr) => ({
                              ...curr,
                              active: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        Integração ativa
                      </label>
                      <div className="flex justify-end">
                        <Button disabled={busy} type="submit" variant="secondary">
                          {busy ? 'Salvando...' : 'Salvar configuração'}
                        </Button>
                      </div>
                    </form>
                  </Card>
                </div>
              ),
            },
            {
              id: 'prontidao-mvp',
              label: 'Prontidão MVP & Auditoria',
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Prontidão de Gateways e Canais (Servidor)"
                    description="Verificação segura de variáveis e políticas no servidor, sem expor chaves ou tokens."
                  >
                    {!mvpReadiness ? (
                      <EmptyState
                        title="Diagnóstico indisponível"
                        description="Confirme o acesso administrativo para consultar a prontidão do ambiente."
                      />
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {mvpReadiness.gateways.map((gateway) => (
                          <div
                            className="rounded-xl border border-slate-200 bg-[#f6faff] p-4"
                            key={gateway.provider}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold text-[#153b50]">
                                {gateway.provider === 'mercado_pago'
                                  ? 'Mercado Pago'
                                  : 'Asaas Pagamentos'}
                              </p>
                              <Badge
                                variant={
                                  gateway.configured &&
                                  gateway.webhookVerificationReady
                                    ? 'success'
                                    : 'warning'
                                }
                              >
                                {gateway.configured &&
                                gateway.webhookVerificationReady
                                  ? 'Pronto no servidor'
                                  : 'Credenciais pendentes'}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Webhook HMAC/Anti-replay:{' '}
                              {gateway.webhookVerificationReady
                                ? 'Configurado'
                                : 'Pendente'}
                            </p>
                            {gateway.missingEnvVars.length > 0 && (
                              <p className="mt-2 font-mono text-[11px] text-slate-500">
                                Faltam: {gateway.missingEnvVars.join(', ')}
                              </p>
                            )}
                          </div>
                        ))}

                        <div className="rounded-xl border border-slate-200 bg-[#f6faff] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-[#153b50]">
                              Teleconsulta &amp; Gravação LGPD
                            </p>
                            <Badge
                              variant={
                                mvpReadiness.channels.recordingBucketProvisioned
                                  ? 'success'
                                  : 'neutral'
                              }
                            >
                              {mvpReadiness.channels.recordingBucketProvisioned
                                ? 'Bucket ativo'
                                : 'Gravação desativada'}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            Política{' '}
                            {mvpReadiness.channels.recordingPolicy.policyVersion} ·
                            Consentimento bilateral obrigatório · Retenção{' '}
                            {mvpReadiness.channels.recordingPolicy.retentionDays}{' '}
                            dias.
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-[#f6faff] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-[#153b50]">
                              Web Push &amp; Outbox
                            </p>
                            <Badge
                              variant={
                                mvpReadiness.channels.webPushConfigured
                                  ? 'success'
                                  : 'warning'
                              }
                            >
                              {mvpReadiness.channels.webPushConfigured
                                ? 'VAPID ativo'
                                : 'VAPID pendente'}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            Itens na fila outbox:{' '}
                            {mvpReadiness.telemetry.outboxSchemaReady
                              ? mvpReadiness.telemetry.outboxItems.length
                              : 'Aguardando migration #15'}
                          </p>
                        </div>

                        {mvpReadiness.channels.digitalSignature && (
                          <div className="rounded-xl border border-slate-200 bg-[#f6faff] p-4 sm:col-span-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-bold text-[#153b50]">
                                Receita Digital &amp; Assinatura ICP-Brasil
                              </p>
                              <Badge
                                variant={
                                  mvpReadiness.channels.digitalSignature.icpBrasilActive
                                    ? 'success'
                                    : 'info'
                                }
                              >
                                {mvpReadiness.channels.digitalSignature.icpBrasilActive
                                  ? 'ICP-Brasil ativo'
                                  : 'QR + SHA-256 ativo (AC externa pendente)'}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">
                              Manifesto{' '}
                              {mvpReadiness.channels.digitalSignature.schemaVersion} (
                              {mvpReadiness.channels.digitalSignature.canonicalHashAlgorithm}
                              ) ativo sem armazenamento de chave privada na aplicação.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  <Card
                    title="Eventos de Webhook e Trilha de Auditoria"
                    description="Registros recentes de audit_logs (migration #14) e webhook_events (migration #15)."
                  >
                    {!mvpReadiness ? (
                      <EmptyState
                        title="Sem dados carregados"
                        description="Atualize o painel para consultar os logs persistentes."
                      />
                    ) : !mvpReadiness.telemetry.auditSchemaReady &&
                      !mvpReadiness.telemetry.webhookSchemaReady ? (
                      <EmptyState
                        title="Tabelas de auditoria aguardando migrations #14 e #15"
                        description="Aplique as migrations pendentes conforme supabase/README_MIGRATIONS.md para ativar audit_logs e webhook_events."
                      />
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h3 className="mb-2 text-sm font-bold text-[#153b50]">
                            Últimos eventos de auditoria ({mvpReadiness.telemetry.auditLogs.length})
                          </h3>
                          {mvpReadiness.telemetry.auditLogs.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              Nenhum evento persistido em audit_logs ainda.
                            </p>
                          ) : (
                            <ul className="grid gap-2">
                              {mvpReadiness.telemetry.auditLogs.map((entry) => (
                                <li
                                  className="rounded-xl bg-[#f6faff] p-3 text-xs"
                                  key={entry.id}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-[#153b50]">
                                      {entry.event}
                                    </span>
                                    <Badge
                                      variant={
                                        entry.outcome === 'allowed'
                                          ? 'success'
                                          : entry.outcome === 'denied'
                                            ? 'danger'
                                            : 'warning'
                                      }
                                    >
                                      {entry.outcome}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-slate-600">
                                    {entry.resource} · {entry.action}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <h3 className="mb-2 text-sm font-bold text-[#153b50]">
                            Webhooks idempotentes ({mvpReadiness.telemetry.webhookEvents.length})
                          </h3>
                          {mvpReadiness.telemetry.webhookEvents.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              Nenhum evento de webhook registrado ainda.
                            </p>
                          ) : (
                            <ul className="grid gap-2">
                              {mvpReadiness.telemetry.webhookEvents.map((wh) => (
                                <li
                                  className="rounded-xl bg-[#f6faff] p-3 text-xs"
                                  key={wh.id}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-[#153b50]">
                                      {wh.provider} · {wh.event_type}
                                    </span>
                                    <Badge
                                      variant={
                                        wh.status === 'processed'
                                          ? 'success'
                                          : 'warning'
                                      }
                                    >
                                      {wh.status}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 font-mono text-slate-600">
                                    ID: {wh.event_id}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
