'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
  Toast,
} from '@/components/ui';
import { updateProfileSchema } from '@/lib/validations';
import {
  atualizarPerfilAtual,
  buscarPerfilAtual,
} from '@/services/auth.service';
import {
  enviarSolicitacaoPerfil,
  listarMinhasSolicitacoesPerfil,
} from '@/services/operations.service';
import {
  atualizarMeuPerfilVeterinario,
  listarOrganizacoesEVeterinarios,
} from '@/services/organizations.service';
import { listarPets } from '@/services/pets.service';
import {
  listarAssinaturasPet,
  listarPagamentosUsuario,
} from '@/services/subscriptions.service';
import type { UserRole } from '@/types/database';
import type {
  Organization,
  RoleApplication,
  UserProfile,
  VeterinarianProfile,
} from '@/types/entities';

const roleLabels: Record<UserRole, string> = {
  tutor: 'Tutor',
  veterinarian: 'Médico-Veterinário',
  partner: 'Parceiro B2B',
  admin: 'Admin Master',
};

const orgRoleLabels: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  veterinarian: 'Veterinário',
  staff: 'Equipe',
  billing: 'Financeiro',
};

const vetStatusBadge: Record<
  VeterinarianProfile['status'],
  { label: string; variant: 'success' | 'warning' | 'danger' }
> = {
  approved: { label: 'CRMV Aprovado', variant: 'success' },
  pending: { label: 'Aguardando Aprovação', variant: 'warning' },
  suspended: { label: 'Suspenso', variant: 'danger' },
};

const appStatusBadge: Record<
  RoleApplication['status'],
  { label: string; variant: 'success' | 'warning' | 'danger' }
> = {
  approved: { label: 'Aprovada', variant: 'success' },
  pending: { label: 'Em análise', variant: 'warning' },
  rejected: { label: 'Recusada', variant: 'danger' },
};

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [vetRecords, setVetRecords] = useState<VeterinarianProfile[]>([]);
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [petsCount, setPetsCount] = useState(0);
  const [activeSubsCount, setActiveSubsCount] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  // Public vet settings state
  const [feeBrl, setFeeBrl] = useState('180.00');
  const [vetBio, setVetBio] = useState('');
  const [isOnlineNow, setIsOnlineNow] = useState(false);

  // Role application state
  const [reqRole, setReqRole] = useState<'veterinarian' | 'partner'>('veterinarian');
  const [reqOrgName, setReqOrgName] = useState('');
  const [reqDocumentId, setReqDocumentId] = useState('');
  const [reqRegion, setReqRegion] = useState('SP');
  const [reqSpecialty, setReqSpecialty] = useState('');
  const [reqCity, setReqCity] = useState('');
  const [reqState, setReqState] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingVet, setSavingVet] = useState(false);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [userProfile, orgsRes, petsRes, subsRes, paymentsRes, appsRes] =
        await Promise.all([
          buscarPerfilAtual(),
          listarOrganizacoesEVeterinarios().catch(() => ({
            organizations: [] as Organization[],
            professionals: [] as VeterinarianProfile[],
            currentUserId: '',
          })),
          listarPets().catch(() => ({ pets: [] })),
          listarAssinaturasPet().catch(() => ({ subscriptions: [] })),
          listarPagamentosUsuario().catch(() => ({ payments: [] })),
          listarMinhasSolicitacoesPerfil().catch(() => ({
            applications: [] as RoleApplication[],
          })),
        ]);

      setProfile(userProfile);
      setDisplayName(userProfile?.display_name ?? '');
      setPhone(userProfile?.phone ?? '');
      setOrganizations(orgsRes.organizations);
      const myVets = orgsRes.professionals.filter(
        (item) => item.user_id === userProfile?.id,
      );
      setVetRecords(myVets);
      const firstApprovedVet = myVets.find((v) => v.status === 'approved') ?? myVets[0];
      if (firstApprovedVet) {
        setFeeBrl(
          ((firstApprovedVet.consultation_fee_cents ?? 18000) / 100).toFixed(2),
        );
        setVetBio(firstApprovedVet.bio ?? '');
        setIsOnlineNow(Boolean(firstApprovedVet.is_online_now));
      }
      setApplications(appsRes.applications);
      setPetsCount(petsRes.pets.length);
      setActiveSubsCount(
        subsRes.subscriptions.filter((sub) => sub.status === 'active').length,
      );
      setPaymentsCount(paymentsRes.payments.length);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os dados do seu perfil.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');

    const parsed = updateProfileSchema.safeParse({
      display_name: displayName,
      phone: phone || null,
    });
    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Confira os dados informados.',
      );
      return;
    }

    setSaving(true);
    try {
      const updated = await atualizarPerfilAtual({
        display_name: parsed.data.display_name,
        phone: parsed.data.phone ?? null,
      });
      setProfile(updated);
      setDisplayName(updated.display_name);
      setPhone(updated.phone ?? '');
      setNotice('Dados da sua conta atualizados com segurança no Supabase.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar seu perfil.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleVetPublicSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');
    const numericFee = Number(feeBrl.replace(',', '.'));
    if (!Number.isFinite(numericFee) || numericFee < 20) {
      setErrorMessage('Informe um valor de consulta válido (mínimo R$ 20,00).');
      return;
    }

    setSavingVet(true);
    try {
      await atualizarMeuPerfilVeterinario({
        consultation_fee_cents: Math.round(numericFee * 100),
        bio: vetBio.trim() || null,
        is_online_now: isOnlineNow,
      });
      setNotice('Configurações públicas do consultório atualizadas.');
      await loadProfileData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Erro ao atualizar configurações profissionais.',
      );
    } finally {
      setSavingVet(false);
    }
  }

  async function handleRoleApplicationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');
    if (reqOrgName.trim().length < 2 || reqDocumentId.trim().length < 4) {
      setErrorMessage('Preencha o nome da clínica/loja e o número do CRMV ou CNPJ.');
      return;
    }

    setSubmittingApp(true);
    try {
      const { application } = await enviarSolicitacaoPerfil({
        requested_role: reqRole,
        organization_name: reqOrgName,
        document_id: reqDocumentId,
        registration_region: reqRole === 'veterinarian' ? reqRegion : null,
        specialty: reqRole === 'veterinarian' ? reqSpecialty : null,
        city: reqCity || null,
        state: reqState || null,
      });
      setApplications((current) => [application, ...current]);
      setReqOrgName('');
      setReqDocumentId('');
      setReqSpecialty('');
      setNotice(
        'Solicitação de credenciamento enviada! O administrador analisará seus dados em breve.',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar sua solicitação de credenciamento.',
      );
    } finally {
      setSubmittingApp(false);
    }
  }

  const isApprovedVet =
    profile?.role === 'veterinarian' ||
    vetRecords.some((v) => v.status === 'approved');

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/pets">
              <Button variant="outline">Meus Pets</Button>
            </Link>
            <Link href="/senha/nova">
              <Button variant="primary">Alterar senha</Button>
            </Link>
          </div>
        }
        description="Gerencie seus dados de contato, credenciamento profissional, valor público de consulta e atalhos da sua conta DrVet."
        title="Meu Perfil"
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
          detail="Cadastrados na conta"
          icon="♡"
          label="Meus Pets"
          value={loading ? '...' : String(petsCount)}
        />
        <MetricCard
          detail="Assinaturas ativas"
          icon="★"
          label="Clube DrVet"
          value={loading ? '...' : String(activeSubsCount)}
        />
        <MetricCard
          detail="Transações registradas"
          icon="R$"
          label="Comprovantes"
          value={loading ? '...' : String(paymentsCount)}
        />
      </div>

      {loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="grid gap-6 lg:col-span-7">
            <Card
              description="Seu nome e telefone aparecem nos agendamentos e contatos clínicos autorizados."
              title="Dados cadastrais"
            >
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <Input
                  label="Nome completo"
                  maxLength={120}
                  name="display_name"
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  value={displayName}
                />
                <Input
                  disabled
                  label="E-mail da conta"
                  name="email"
                  value={profile?.email ?? 'Não informado'}
                />
                <Input
                  label="Telefone / WhatsApp"
                  maxLength={32}
                  name="phone"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  value={phone}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span>Perfil de acesso:</span>
                    <Badge variant="info">
                      {roleLabels[profile?.role ?? 'tutor']}
                    </Badge>
                  </div>
                  <Button disabled={saving} type="submit" variant="secondary">
                    {saving ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </div>
              </form>
            </Card>

            {isApprovedVet && (
              <Card
                description="Defina seu honorário de consulta exibido na vitrine pública e disponibilidade em plantão."
                title="Configuração Pública do Consultório"
              >
                <form className="grid gap-4" onSubmit={handleVetPublicSave}>
                  <Input
                    label="Valor da teleconsulta (R$)"
                    name="feeBrl"
                    onChange={(e) => setFeeBrl(e.target.value)}
                    placeholder="180.00"
                    required
                    value={feeBrl}
                  />
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    Mini-bio profissional
                    <textarea
                      className="min-h-20 rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal"
                      maxLength={500}
                      onChange={(e) => setVetBio(e.target.value)}
                      placeholder="Especialização, experiência clínica e áreas de foco."
                      value={vetBio}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#153b50]">
                    <input
                      checked={isOnlineNow}
                      onChange={(e) => setIsOnlineNow(e.target.checked)}
                      type="checkbox"
                    />
                    Estou disponível no plantão online agora
                  </label>
                  <div className="flex justify-end">
                    <Button disabled={savingVet} type="submit" variant="secondary">
                      {savingVet ? 'Salvando...' : 'Atualizar vitrine profissional'}
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {profile?.role === 'tutor' && (
              <Card
                description="É médico-veterinário ou possui Pet Shop / Farmácia? Solicite seu credenciamento para análise do administrador."
                title="Solicitar Credenciamento Profissional ou Parceiro B2B"
              >
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={handleRoleApplicationSubmit}
                >
                  <Select
                    label="Tipo de credenciamento"
                    name="reqRole"
                    onChange={(e) =>
                      setReqRole(e.target.value as 'veterinarian' | 'partner')
                    }
                    value={reqRole}
                  >
                    <option value="veterinarian">Médico-Veterinário (CRMV)</option>
                    <option value="partner">Parceiro B2B (Pet Shop / Farmácia)</option>
                  </Select>
                  <Input
                    label={
                      reqRole === 'veterinarian'
                        ? 'Nome da clínica / consultório'
                        : 'Nome fantasia da loja'
                    }
                    name="reqOrgName"
                    onChange={(e) => setReqOrgName(e.target.value)}
                    placeholder={
                      reqRole === 'veterinarian'
                        ? 'Ex.: Consultório Vet Central'
                        : 'Ex.: Pet Shop Amigos'
                    }
                    required
                    value={reqOrgName}
                  />
                  <Input
                    label={reqRole === 'veterinarian' ? 'Número CRMV' : 'CNPJ'}
                    name="reqDocumentId"
                    onChange={(e) => setReqDocumentId(e.target.value)}
                    placeholder={
                      reqRole === 'veterinarian' ? 'Ex.: 42189' : 'Ex.: 00.000.000/0001-00'
                    }
                    required
                    value={reqDocumentId}
                  />
                  {reqRole === 'veterinarian' ? (
                    <Input
                      label="UF do CRMV"
                      maxLength={2}
                      name="reqRegion"
                      onChange={(e) => setReqRegion(e.target.value.toUpperCase())}
                      placeholder="SP"
                      required
                      value={reqRegion}
                    />
                  ) : (
                    <Input
                      label="Cidade"
                      name="reqCity"
                      onChange={(e) => setReqCity(e.target.value)}
                      placeholder="São Paulo"
                      value={reqCity}
                    />
                  )}
                  {reqRole === 'veterinarian' && (
                    <div className="sm:col-span-2">
                      <Input
                        label="Especialidade principal"
                        name="reqSpecialty"
                        onChange={(e) => setReqSpecialty(e.target.value)}
                        placeholder="Ex.: Clínica Geral, Dermatologia, Medicina Felina"
                        value={reqSpecialty}
                      />
                    </div>
                  )}
                  {reqRole === 'partner' && (
                    <Input
                      label="UF"
                      maxLength={2}
                      name="reqState"
                      onChange={(e) => setReqState(e.target.value.toUpperCase())}
                      placeholder="SP"
                      value={reqState}
                    />
                  )}
                  <div className="flex justify-end sm:col-span-2">
                    <Button disabled={submittingApp} type="submit" variant="primary">
                      {submittingApp
                        ? 'Enviando...'
                        : 'Enviar solicitação de credenciamento'}
                    </Button>
                  </div>
                </form>

                {applications.length > 0 && (
                  <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Minhas solicitações ({applications.length})
                    </p>
                    {applications.map((app) => {
                      const st = appStatusBadge[app.status];
                      return (
                        <div
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-xs"
                          key={app.id}
                        >
                          <div>
                            <p className="font-bold text-[#153b50]">
                              {app.organization_name} ({app.document_id}
                              {app.registration_region ? `-${app.registration_region}` : ''})
                            </p>
                            {app.reviewer_notes && (
                              <p className="mt-0.5 text-slate-600">
                                Parecer: {app.reviewer_notes}
                              </p>
                            )}
                          </div>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          <div className="grid content-start gap-6 lg:col-span-5">
            <Card
              description="Organizações e registro CRMV vinculados à sua conta."
              title="Vínculos e credenciamento"
            >
              {organizations.length === 0 && vetRecords.length === 0 ? (
                <p className="text-sm text-slate-600">
                  Sua conta opera atualmente como <strong>Tutor</strong> sem vínculos organizacionais B2B ou CRMV.
                </p>
              ) : (
                <div className="grid gap-3">
                  {organizations.map((org) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#ebf5ff] px-3.5 py-2.5 text-sm"
                      key={org.id}
                    >
                      <span className="font-semibold text-[#153b50]">
                        {org.name}
                      </span>
                      <Badge variant="info">
                        {orgRoleLabels[org.role] ?? org.role}
                      </Badge>
                    </div>
                  ))}
                  {vetRecords.map((vet) => {
                    const badge = vetStatusBadge[vet.status];
                    return (
                      <div
                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                        key={`${vet.organization_id}-${vet.user_id}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#153b50]">
                            CRMV-{vet.registration_region} {vet.registration_number}
                          </span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        {vet.specialty && (
                          <p className="mt-1 text-xs text-slate-600">
                            Especialidade: {vet.specialty}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              description="Acesse rapidamente os módulos ligados à sua conta."
              title="Atalhos da conta"
            >
              <div className="grid gap-2 text-sm font-semibold">
                <Link
                  className="flex items-center justify-between rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-[#153b50] hover:bg-[#ebf5ff]"
                  href="/pets"
                >
                  <span>Meus Pets e fotos</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  className="flex items-center justify-between rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-[#153b50] hover:bg-[#ebf5ff]"
                  href="/agendamento"
                >
                  <span>Minhas consultas</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  className="flex items-center justify-between rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-[#153b50] hover:bg-[#ebf5ff]"
                  href="/assinaturas"
                >
                  <span>Clube DrVet</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  className="flex items-center justify-between rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-[#153b50] hover:bg-[#ebf5ff]"
                  href="/pagamentos"
                >
                  <span>Pagamentos e comprovantes</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
