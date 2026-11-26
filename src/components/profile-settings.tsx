'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Camera,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { FacialBiometricsCapture } from '@/components/facial-biometrics-capture';
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
  consultarBiometriaFacial,
  revogarBiometriaFacial,
  type FacialBiometricsStatusResponse,
} from '@/services/biometrics.service';
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
  gerarCaminhoSeguroStorage,
  obterUrlPublicaStorage,
  uploadArquivoStorage,
} from '@/services/storage.service';
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
  const [vetAvatarPath, setVetAvatarPath] = useState('');
  const [uploadingVetAvatar, setUploadingVetAvatar] = useState(false);

  // Role application state
  const [reqRole, setReqRole] = useState<'veterinarian' | 'partner'>('veterinarian');
  const [reqOrgName, setReqOrgName] = useState('');
  const [reqDocumentId, setReqDocumentId] = useState('');
  const [reqRegion, setReqRegion] = useState('SP');
  const [reqSpecialty, setReqSpecialty] = useState('');
  const [reqCity, setReqCity] = useState('');
  const [reqState, setReqState] = useState('');
  const [reqAvatarPath, setReqAvatarPath] = useState('');
  const [uploadingReqAvatar, setUploadingReqAvatar] = useState(false);

  // Facial biometrics state
  const [biometricsStatus, setBiometricsStatus] =
    useState<FacialBiometricsStatusResponse | null>(null);
  const [biometricsCaptureMode, setBiometricsCaptureMode] = useState<
    'enroll' | 'verify' | null
  >(null);
  const [revokingBiometrics, setRevokingBiometrics] = useState(false);

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
      const [userProfile, orgsRes, petsRes, subsRes, paymentsRes, appsRes, bioRes] =
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
          consultarBiometriaFacial().catch(() => null),
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
        setVetAvatarPath(
          firstApprovedVet.avatar_path ?? userProfile?.avatar_path ?? '',
        );
      } else {
        setVetAvatarPath(userProfile?.avatar_path ?? '');
      }
      setApplications(appsRes.applications);
      setPetsCount(petsRes.pets.length);
      setActiveSubsCount(
        subsRes.subscriptions.filter((sub) => sub.status === 'active').length,
      );
      setPaymentsCount(paymentsRes.payments.length);
      setBiometricsStatus(bioRes);
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

  async function handleAvatarUpload(
    event: ChangeEvent<HTMLInputElement>,
    target: 'vet' | 'req',
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile?.id) return;

    setErrorMessage('');
    setNotice('');
    if (target === 'vet') {
      setUploadingVetAvatar(true);
    } else {
      setUploadingReqAvatar(true);
    }

    try {
      const storagePath = gerarCaminhoSeguroStorage(
        profile.id,
        `${target}-${file.name}`,
      );
      const { path } = await uploadArquivoStorage({
        bucket: 'vet-avatars',
        path: storagePath,
        file,
      });

      if (target === 'vet') {
        setVetAvatarPath(path);
        setNotice(
          'Foto enviada! Clique em "Atualizar vitrine profissional" para salvar no perfil público.',
        );
      } else {
        setReqAvatarPath(path);
        setNotice('Foto profissional anexada à solicitação de credenciamento.');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a foto profissional.',
      );
    } finally {
      if (target === 'vet') {
        setUploadingVetAvatar(false);
      } else {
        setUploadingReqAvatar(false);
      }
    }
  }

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
        avatar_path: vetAvatarPath.trim() || null,
      });
      setNotice('Configurações públicas e foto do consultório atualizadas.');
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
        avatar_path:
          reqRole === 'veterinarian' ? reqAvatarPath.trim() || null : null,
      });
      setApplications((current) => [application, ...current]);
      setReqOrgName('');
      setReqDocumentId('');
      setReqSpecialty('');
      setReqAvatarPath('');
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

  async function handleRevokeBiometrics() {
    setErrorMessage('');
    setNotice('');
    setRevokingBiometrics(true);
    try {
      await revogarBiometriaFacial();
      setBiometricsCaptureMode(null);
      setNotice('Biometria facial revogada. Você pode cadastrá-la novamente quando desejar.');
      await loadProfileData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível revogar a biometria facial.',
      );
    } finally {
      setRevokingBiometrics(false);
    }
  }

  const isApprovedVet =
    profile?.role === 'veterinarian' ||
    vetRecords.some((v) => v.status === 'approved');
  const vetAvatarPreviewUrl = obterUrlPublicaStorage('vet-avatars', vetAvatarPath);
  const reqAvatarPreviewUrl = obterUrlPublicaStorage('vet-avatars', reqAvatarPath);

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
        description="Gerencie seus dados de contato, foto profissional, biometria facial, credenciamento e configurações públicas na DrVet."
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
                description="Defina sua foto de perfil, honorário de consulta exibido na vitrine pública e disponibilidade em plantão."
                title="Configuração Pública do Consultório"
              >
                <form className="grid gap-4" onSubmit={handleVetPublicSave}>
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-[#f6faff] p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
                      {vetAvatarPreviewUrl ? (
                        <Image
                          alt="Foto profissional do médico-veterinário"
                          className="object-cover"
                          fill
                          referrerPolicy="no-referrer"
                          sizes="64px"
                          src={vetAvatarPreviewUrl}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-slate-400">
                          <UserRound className="h-7 w-7" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#153b50]">
                        Foto profissional na vitrine pública
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        JPG, PNG ou WEBP até 5 MB. Exibida nos cartões da Home e no agendamento.
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[#087a68] bg-white px-3.5 text-xs font-bold text-[#087a68] hover:bg-[#ebf5ff]">
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingVetAvatar
                            ? 'Enviando foto...'
                            : vetAvatarPath
                              ? 'Alterar foto'
                              : 'Enviar foto'}
                          <input
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            disabled={uploadingVetAvatar}
                            onChange={(event) => void handleAvatarUpload(event, 'vet')}
                            type="file"
                          />
                        </label>
                        {vetAvatarPath && (
                          <button
                            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => setVetAvatarPath('')}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover foto
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

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
                    <Button disabled={savingVet || uploadingVetAvatar} type="submit" variant="secondary">
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
                    <>
                      <div className="sm:col-span-2">
                        <Input
                          label="Especialidade principal"
                          name="reqSpecialty"
                          onChange={(e) => setReqSpecialty(e.target.value)}
                          placeholder="Ex.: Clínica Geral, Dermatologia, Medicina Felina"
                          value={reqSpecialty}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-[#f6faff] p-4 sm:col-span-2">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
                          {reqAvatarPreviewUrl ? (
                            <Image
                              alt="Pré-visualização da foto do veterinário"
                              className="object-cover"
                              fill
                              referrerPolicy="no-referrer"
                              sizes="56px"
                              src={reqAvatarPreviewUrl}
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-slate-400">
                              <Camera className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#153b50]">
                            Foto profissional do Médico-Veterinário (opcional)
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            Será exibida no catálogo público e nos agendamentos após aprovação.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[#087a68] bg-white px-3.5 text-xs font-bold text-[#087a68] hover:bg-[#ebf5ff]">
                              <Upload className="h-3.5 w-3.5" />
                              {uploadingReqAvatar
                                ? 'Enviando...'
                                : reqAvatarPath
                                  ? 'Trocar foto'
                                  : 'Selecionar foto'}
                              <input
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                disabled={uploadingReqAvatar}
                                onChange={(event) => void handleAvatarUpload(event, 'req')}
                                type="file"
                              />
                            </label>
                            {reqAvatarPath && (
                              <button
                                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                onClick={() => setReqAvatarPath('')}
                                type="button"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remover
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
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
                    <Button disabled={submittingApp || uploadingReqAvatar} type="submit" variant="primary">
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
              description="Confecção e validação facial com prova de vida protegida no banco de dados."
              title="Biometria Facial & Segurança"
            >
              {!biometricsStatus ? (
                <p className="text-sm text-slate-600">
                  Status biométrico indisponível no momento.
                </p>
              ) : !biometricsStatus.schemaReady ? (
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <Badge variant="warning">Aguardando migration #16</Badge>
                  </div>
                  <p className="text-xs leading-5 text-slate-600">
                    As tabelas biométricas ainda não foram aplicadas no banco remoto.
                    Execute a migration de foto veterinária e biometria facial no Supabase
                    para habilitar o cadastro pela câmera.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6faff] px-3.5 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#153b50]">
                      {biometricsStatus.enrolled ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                      )}
                      <span>
                        {biometricsStatus.enrolled
                          ? 'Biometria facial ativa'
                          : 'Biometria não cadastrada'}
                      </span>
                    </div>
                    <Badge variant={biometricsStatus.enrolled ? 'success' : 'warning'}>
                      {biometricsStatus.enrolled ? 'Ativa' : 'Pendente'}
                    </Badge>
                  </div>

                  {biometricsStatus.biometric && (
                    <div className="grid gap-1 text-xs text-slate-600">
                      <p>
                        <strong>Cadastrada em:</strong>{' '}
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(biometricsStatus.biometric.enrolled_at))}
                      </p>
                      <p>
                        <strong>Última validação:</strong>{' '}
                        {biometricsStatus.biometric.last_verified_at
                          ? new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(biometricsStatus.biometric.last_verified_at))
                          : 'Ainda não utilizada no login'}
                      </p>
                      <p>
                        <strong>Prova de vida inicial:</strong>{' '}
                        {Math.round(biometricsStatus.biometric.liveness_score * 100)}%
                      </p>
                    </div>
                  )}

                  {biometricsCaptureMode ? (
                    <FacialBiometricsCapture
                      cancelLabel="Fechar câmera"
                      mode={biometricsCaptureMode}
                      onCancel={() => setBiometricsCaptureMode(null)}
                      onCompleted={() => {
                        const modeUsed = biometricsCaptureMode;
                        setBiometricsCaptureMode(null);
                        setNotice(
                          modeUsed === 'enroll'
                            ? 'Biometria facial confeccionada e salva no banco de dados!'
                            : 'Biometria facial validada com sucesso!',
                        );
                        void loadProfileData();
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => setBiometricsCaptureMode('enroll')}
                        type="button"
                        variant="secondary"
                      >
                        {biometricsStatus.enrolled
                          ? 'Recadastrar face'
                          : 'Cadastrar biometria facial'}
                      </Button>
                      {biometricsStatus.enrolled && (
                        <>
                          <Button
                            onClick={() => setBiometricsCaptureMode('verify')}
                            type="button"
                            variant="outline"
                          >
                            Testar validação
                          </Button>
                          <Button
                            disabled={revokingBiometrics}
                            onClick={() => void handleRevokeBiometrics()}
                            type="button"
                            variant="outline"
                          >
                            {revokingBiometrics ? 'Revogando...' : 'Revogar'}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {biometricsStatus.recentLogs.length > 0 && (
                    <div className="grid gap-1.5 border-t border-slate-100 pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Últimas verificações ({biometricsStatus.recentLogs.length})
                      </p>
                      {biometricsStatus.recentLogs.slice(0, 3).map((log) => (
                        <div
                          className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs"
                          key={log.id}
                        >
                          <span className="text-slate-700">
                            {log.matched ? 'Aprovada' : 'Recusada'} ·{' '}
                            {typeof log.similarity_score === 'number'
                              ? `${Math.round(log.similarity_score * 100)}%`
                              : '—'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(log.created_at))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

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
