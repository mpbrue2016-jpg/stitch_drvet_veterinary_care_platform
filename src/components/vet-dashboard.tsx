'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, UserRound, WifiOff } from 'lucide-react';
import { FacialBiometricsCapture } from '@/components/facial-biometrics-capture';
import { VetAutoRemindersCard } from '@/components/vet-auto-reminders-card';
import { VetConsultationSummary } from '@/components/vet-consultation-summary';
import { VetOfflineCachePanel } from '@/components/vet-offline-cache-panel';
import {
  Badge,
  Button,
  Card,
  DemoNotice,
  EmptyState,
  MetricCard,
  PageHeader,
  Skeleton,
  Toast,
} from '@/components/ui';
import { PushInlineBanner } from '@/components/push-inline-banner';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { atualizarStatusAgendamento, listarAgendamentos } from '@/services/appointments.service';
import { buscarPerfilAtual } from '@/services/auth.service';
import {
  consultarBiometriaFacial,
  type FacialBiometricsStatusResponse,
} from '@/services/biometrics.service';
import { listarDisponibilidade } from '@/services/availability.service';
import { isLikelyOfflineError } from '@/lib/offline/vet-cache-helpers';
import {
  getVetOfflineCacheSnapshot,
  syncFullVetOfflineSnapshot,
} from '@/lib/offline/vet-indexeddb';
import { listarProntuarios } from '@/services/clinical-records.service';
import { buscarResumoFinanceiro } from '@/services/commissions.service';
import { listarOrganizacoesEVeterinarios } from '@/services/organizations.service';
import { registerPushServiceWorker } from '@/services/push.service';
import { obterUrlPublicaStorage } from '@/services/storage.service';
import { listarSessoesTeleconsulta } from '@/services/teleconsultations.service';
import type {
  Appointment,
  AppointmentStatus,
  AvailabilitySlot,
  CommissionSummary,
  UserProfile,
  VeterinarianProfile,
} from '@/types/entities';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statusBadges: Record<
  AppointmentStatus,
  { label: string; variant: 'warning' | 'success' | 'info' | 'neutral' }
> = {
  pending: { label: 'Aguardando confirmação', variant: 'warning' },
  confirmed: { label: 'Confirmada', variant: 'success' },
  completed: { label: 'Concluída', variant: 'info' },
  cancelled: { label: 'Cancelada', variant: 'neutral' },
};

export function VetDashboard() {
  const configured = isSupabaseConfigured();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [finance, setFinance] = useState<CommissionSummary | null>(null);
  const [vetProfiles, setVetProfiles] = useState<VeterinarianProfile[]>([]);
  const [biometricsStatus, setBiometricsStatus] =
    useState<FacialBiometricsStatusResponse | null>(null);
  const [inProgressAppointmentIds, setInProgressAppointmentIds] = useState<string[]>([]);
  const [initialDailyGoal, setInitialDailyGoal] = useState<number | null>(null);
  const [showBiometricEnroll, setShowBiometricEnroll] = useState(false);
  const [loading, setLoading] = useState(configured);
  const [busyId, setBusyId] = useState('');
  const [offlineVetId, setOfflineVetId] = useState('');
  const [offlineModeNotice, setOfflineModeNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void registerPushServiceWorker().catch(() => null);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    setOfflineModeNotice('');
    try {
      const supabase = createSupabaseBrowserClient();
      const [me, appts, avail, fin, orgs, bio, tele, authUserRes, recordsRes] =
        await Promise.all([
          buscarPerfilAtual(),
          listarAgendamentos({ mine: true }),
          listarDisponibilidade({ mine: true }).catch(() => ({ availability: [] })),
          buscarResumoFinanceiro().catch(() => null),
          listarOrganizacoesEVeterinarios().catch(() => ({
            organizations: [],
            professionals: [],
            currentUserId: '',
          })),
          consultarBiometriaFacial().catch(() => null),
          listarSessoesTeleconsulta().catch(() => ({ sessions: [], currentUserId: '' })),
          supabase.auth.getUser().catch(() => ({ data: { user: null } })),
          listarProntuarios().catch(() => ({ clinicalRecords: [] })),
        ]);
      setProfile(me);
      setAppointments(appts.appointments);
      setAvailability(avail.availability);
      setFinance(fin);
      setVetProfiles(
        orgs.professionals.filter((item) => item.user_id === appts.currentUserId),
      );
      setBiometricsStatus(bio);
      const metadataGoal = Number(
        authUserRes.data?.user?.user_metadata?.daily_consultation_goal,
      );
      setInitialDailyGoal(
        Number.isFinite(metadataGoal) && metadataGoal > 0 ? metadataGoal : null,
      );
      setInProgressAppointmentIds(
        tele.sessions
          .filter(
            (session) =>
              session.status === 'in_progress' &&
              (!appts.currentUserId || session.veterinarian_id === appts.currentUserId),
          )
          .map((session) => session.appointment_id),
      );

      const vetIdForCache = appts.currentUserId || me?.id || '';
      if (vetIdForCache) {
        const vetRecords = recordsRes.clinicalRecords.filter(
          (record) => record.veterinarian_id === vetIdForCache,
        );
        void syncFullVetOfflineSnapshot({
          veterinarianId: vetIdForCache,
          veterinarianName: me?.display_name ?? null,
          appointments: appts.appointments,
          clinicalRecords: vetRecords,
        }).catch(() => null);
      }
    } catch (error) {
      if (isLikelyOfflineError(error)) {
        const snapshot = await getVetOfflineCacheSnapshot().catch(() => null);
        if (snapshot && (snapshot.appointments.length > 0 || snapshot.records.length > 0)) {
          setAppointments(snapshot.appointments);
          setOfflineVetId(snapshot.veterinarianId ?? '');
          setOfflineModeNotice(
            snapshot.meta?.last_synced_at
              ? `Modo offline ativo: exibindo dados locais do IndexedDB sincronizados em ${formatDateTime(snapshot.meta.last_synced_at)}.`
              : 'Modo offline ativo: exibindo agendamentos e prontuários básicos salvos localmente no IndexedDB.',
          );
          return;
        }
      }
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar o painel clínico.',
      );
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const currentVetId = profile?.id || offlineVetId;

  useEffect(() => {
    if (!configured || !currentVetId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`vet-queue-live-${currentVetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `veterinarian_id=eq.${currentVetId}`,
        },
        () => {
          void loadDashboard();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teleconsultation_sessions',
          filter: `veterinarian_id=eq.${currentVetId}`,
        },
        () => {
          void loadDashboard();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, currentVetId, loadDashboard]);

  async function handleStatusTransition(
    id: string,
    status: Extract<AppointmentStatus, 'confirmed' | 'cancelled' | 'completed'>,
  ) {
    setBusyId(id);
    setErrorMessage('');
    try {
      const { appointment } = await atualizarStatusAgendamento(id, status);
      setAppointments((current) =>
        current.map((item) => (item.id === id ? appointment : item)),
      );
      setNotice('Status do atendimento atualizado com sucesso.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível alterar o agendamento.',
      );
    } finally {
      setBusyId('');
    }
  }

  const activeQueue = appointments.filter(
    (item) => item.status === 'pending' || item.status === 'confirmed',
  );
  const completedCount = appointments.filter((item) => item.status === 'completed').length;
  const openSlotsCount = availability.filter(
    (slot) => slot.is_available && !slot.is_blocked,
  ).length;
  const primaryVet = vetProfiles[0];
  const vetAvatarUrl = obterUrlPublicaStorage(
    'vet-avatars',
    primaryVet?.avatar_path ?? profile?.avatar_path,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-green px-4 text-sm font-bold text-white hover:bg-[#0f8a72]"
              href="/teleconsulta"
            >
              Abrir sala de teleconsulta
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-brand-ink hover:bg-brand-ice"
              href="/agenda"
            >
              Gerenciar agenda
            </Link>
          </div>
        }
        description="Cockpit operacional do médico-veterinário com fila de teleconsultas, horários publicados, prontuários SOAP e repasses."
        title="Painel do Médico Veterinário"
      />

      {!configured && <DemoNotice />}
      <PushInlineBanner audience="veterinarian" />
      {offlineModeNotice && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          role="status"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{offlineModeNotice}</span>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Toast message={notice} onDismiss={() => setNotice('')} variant="success" />
        </div>
      )}
      {errorMessage && (
        <div className="mb-4">
          <Toast message={errorMessage} onDismiss={() => setErrorMessage('')} variant="danger" />
        </div>
      )}

      {profile && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-[#dff0ff]">
              {vetAvatarUrl ? (
                <Image
                  alt={profile.display_name}
                  className="object-cover"
                  fill
                  referrerPolicy="no-referrer"
                  sizes="48px"
                  src={vetAvatarUrl}
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-[#087a68]">
                  <UserRound className="h-5 w-5" />
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-muted">
                Profissional logado
              </p>
              <p className="text-base font-extrabold text-brand-navy">{profile.display_name}</p>
              {!vetAvatarUrl && (
                <Link
                  className="text-xs font-semibold text-brand-green hover:underline"
                  href="/perfil"
                >
                  Adicionar foto profissional →
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {primaryVet ? (
              <Badge variant={primaryVet.status === 'approved' ? 'success' : 'warning'}>
                CRMV-{primaryVet.registration_region} {primaryVet.registration_number} ·{' '}
                {primaryVet.status === 'approved' ? 'Credenciado' : 'Em aprovação'}
              </Badge>
            ) : (
              <Badge variant="info">Perfil {profile.role}</Badge>
            )}
            {biometricsStatus?.schemaReady && (
              <Badge variant={biometricsStatus.enrolled ? 'success' : 'warning'}>
                <span className="inline-flex items-center gap-1">
                  {biometricsStatus.enrolled ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  )}
                  {biometricsStatus.enrolled
                    ? 'Biometria facial ativa'
                    : 'Biometria facial pendente'}
                </span>
              </Badge>
            )}
            <Link
              className="text-xs font-bold text-brand-green hover:underline"
              href="/receitas"
            >
              Rascunhos ICP-Brasil →
            </Link>
          </div>
        </div>
      )}

      {biometricsStatus?.schemaReady &&
        biometricsStatus.isVeterinarian &&
        !biometricsStatus.enrolled && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-amber-950">
                  Biometria facial não identificada no banco de dados
                </p>
                <p className="mt-1 text-xs text-amber-900">
                  Faça a confecção da sua biometria facial pela câmera agora para proteger
                  os próximos logins e registros clínicos.
                </p>
              </div>
              {!showBiometricEnroll && (
                <Button
                  onClick={() => setShowBiometricEnroll(true)}
                  type="button"
                  variant="secondary"
                >
                  Cadastrar biometria facial agora
                </Button>
              )}
            </div>

            {showBiometricEnroll && (
              <div className="mt-4">
                <FacialBiometricsCapture
                  cancelLabel="Fechar"
                  mode="enroll"
                  onCancel={() => setShowBiometricEnroll(false)}
                  onCompleted={() => {
                    setShowBiometricEnroll(false);
                    setNotice(
                      'Biometria facial cadastrada e vinculada ao seu perfil veterinário!',
                    );
                    void loadDashboard();
                  }}
                />
              </div>
            )}
          </div>
        )}

      <VetConsultationSummary
        appointments={appointments}
        inProgressAppointmentIds={inProgressAppointmentIds}
        initialDailyGoal={initialDailyGoal}
        loading={loading}
        veterinarianId={currentVetId || undefined}
      />

      <div className="mb-6">
        <VetAutoRemindersCard
          appointments={appointments}
          veterinarianEmail={profile?.email ?? null}
          veterinarianPhone={profile?.phone ?? null}
        />
      </div>

      <div className="mb-6">
        <VetOfflineCachePanel
          appointments={appointments}
          loadingParent={loading}
          onSyncTrigger={loadDashboard}
          veterinarianId={currentVetId || undefined}
          veterinarianName={profile?.display_name ?? null}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          detail="Consultas pendentes ou confirmadas"
          icon="🩺"
          label="Fila de atendimentos"
          value={loading ? '…' : String(activeQueue.length)}
        />
        <MetricCard
          detail="Consultas finalizadas registradas"
          icon="✓"
          label="Concluídas"
          value={loading ? '…' : String(completedCount)}
        />
        <MetricCard
          detail="Horários futuros disponíveis para tutores"
          icon="▦"
          label="Janelas publicadas"
          value={loading ? '…' : String(openSlotsCount)}
        />
        <MetricCard
          detail={finance ? finance.period_label : 'Sem conta de repasse'}
          icon="R$"
          label="Disponível para saque"
          value={loading ? '…' : finance ? formatCurrency(finance.available_cents) : 'R$ 0,00'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            description="Confirme solicitações pendentes, inicie a sala de vídeo ou abra o prontuário SOAP."
            title="Próximos atendimentos"
          >
            {loading ? (
              <div className="grid gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : activeQueue.length === 0 ? (
              <EmptyState
                action={
                  <Link
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white"
                    href="/agenda"
                  >
                    Publicar horários na agenda
                  </Link>
                }
                description="Nenhum atendimento pendente ou confirmado no momento."
                title="Fila clínica livre"
              />
            ) : (
              <div className="grid gap-3">
                {activeQueue.map((item) => {
                  const badge = statusBadges[item.status];
                  return (
                    <div
                      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-[#F9FBFC] p-4 sm:flex-row sm:items-center"
                      key={item.id}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-brand-navy">
                            {item.pet?.name ?? 'Paciente'}
                          </span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <Badge variant="neutral">
                            {item.kind === 'teleconsultation' ? 'Teleconsulta' : 'Presencial'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {formatDateTime(item.starts_at)} ·{' '}
                          {item.reason || 'Sem observação clínica prévia'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.status === 'pending' && (
                          <Button
                            disabled={busyId === item.id}
                            onClick={() => void handleStatusTransition(item.id, 'confirmed')}
                            type="button"
                            variant="secondary"
                          >
                            Confirmar
                          </Button>
                        )}
                        <Link
                          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-navy px-3 text-xs font-bold text-white hover:bg-[#0d2a3a]"
                          href={`/prontuarios/${item.id}`}
                        >
                          Prontuário SOAP
                        </Link>
                        {item.kind === 'teleconsultation' && item.status === 'confirmed' && (
                          <Link
                            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                            href={`/teleconsulta?appointmentId=${item.id}`}
                          >
                            Entrar no vídeo
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card description="Atalhos operacionais e clínicos" title="Ações rápidas do veterinário">
          <div className="grid gap-2.5">
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/prontuarios"
            >
              <span>Todos os prontuários SOAP</span>
              <span>→</span>
            </Link>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/exames"
            >
              <span>Solicitar exames</span>
              <span>→</span>
            </Link>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/carteira/vacinas"
            >
              <span>Registrar vacinação</span>
              <span>→</span>
            </Link>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/comissoes"
            >
              <span>Extrato de honorários &amp; PIX</span>
              <span>→</span>
            </Link>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/agenda"
            >
              <span>Minha agenda &amp; comunicados individuais</span>
              <span>→</span>
            </Link>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F5F8FA] px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-ice"
              href="/painel"
            >
              <span>Exportar CSV / OFX e Termos</span>
              <span>→</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
