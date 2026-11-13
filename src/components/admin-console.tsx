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
  listarIntegracoes,
  listarUsuariosAdmin,
  salvarIntegracao,
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
      const [usersRes, orgsRes, intRes] = await Promise.all([
        listarUsuariosAdmin(),
        listarOrganizacoesEVeterinarios().catch(() => ({
          professionals: [] as VeterinarianProfile[],
        })),
        listarIntegracoes(),
      ]);
      setUsers(usersRes.users);
      setProfessionals(orgsRes.professionals);
      setIntegrations(intRes.integrations);
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

  async function handleSaveIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await salvarIntegracao(integrationForm);
      setIntegrationForm((curr) => ({ ...curr, webhook_endpoint: '' }));
      setNotice('Configuração de integração salva com status 200 OK.');
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar integração.',
      );
    } finally {
      setBusy(false);
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
              id: 'integracoes',
              label: `Integrações (${integrations.length})`,
              content: (
                <div className="grid gap-5">
                  <Card
                    title="Provedores conectados"
                    description="Metadados de webhooks e ambiente. Tokens secretos permanecem exclusivamente nos Secrets das Edge Functions."
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
                            <div className="flex items-center gap-2">
                              <Badge variant="info">{cfg.environment}</Badge>
                              <Badge
                                variant={cfg.active ? 'success' : 'warning'}
                              >
                                {cfg.active ? cfg.last_status : 'Inativo'}
                              </Badge>
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
          ]}
        />
      )}
    </div>
  );
}
