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
  Skeleton,
  Toast,
} from '@/components/ui';
import { updateProfileSchema } from '@/lib/validations';
import {
  atualizarPerfilAtual,
  buscarPerfilAtual,
} from '@/services/auth.service';
import { listarOrganizacoesEVeterinarios } from '@/services/organizations.service';
import { listarPets } from '@/services/pets.service';
import {
  listarAssinaturasPet,
  listarPagamentosUsuario,
} from '@/services/subscriptions.service';
import type { UserRole } from '@/types/database';
import type {
  Organization,
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

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [vetRecords, setVetRecords] = useState<VeterinarianProfile[]>([]);
  const [petsCount, setPetsCount] = useState(0);
  const [activeSubsCount, setActiveSubsCount] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [userProfile, orgsRes, petsRes, subsRes, paymentsRes] =
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
        ]);

      setProfile(userProfile);
      setDisplayName(userProfile?.display_name ?? '');
      setPhone(userProfile?.phone ?? '');
      setOrganizations(orgsRes.organizations);
      setVetRecords(
        orgsRes.professionals.filter(
          (item) => item.user_id === userProfile?.id,
        ),
      );
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
        description="Gerencie seus dados de contato, nível de acesso RBAC, vínculo profissional e atalhos da sua conta DrVet."
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
          <Card
            className="lg:col-span-7"
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

          <div className="grid gap-6 lg:col-span-5">
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
