'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { atualizarStatusAgendamento, listarAgendamentos } from '@/services/appointments.service';
import { buscarPerfilAtual } from '@/services/auth.service';
import { listarDisponibilidade } from '@/services/availability.service';
import { buscarResumoFinanceiro } from '@/services/commissions.service';
import { listarOrganizacoesEVeterinarios } from '@/services/organizations.service';
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
  const [loading, setLoading] = useState(configured);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const [me, appts, avail, fin, orgs] = await Promise.all([
        buscarPerfilAtual(),
        listarAgendamentos(),
        listarDisponibilidade({ mine: true }).catch(() => ({ availability: [] })),
        buscarResumoFinanceiro().catch(() => null),
        listarOrganizacoesEVeterinarios().catch(() => ({
          organizations: [],
          professionals: [],
          currentUserId: '',
        })),
      ]);
      setProfile(me);
      setAppointments(appts.appointments);
      setAvailability(avail.availability);
      setFinance(fin);
      setVetProfiles(
        orgs.professionals.filter((item) => item.user_id === appts.currentUserId),
      );
    } catch (error) {
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
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted">
              Profissional logado
            </p>
            <p className="text-base font-extrabold text-brand-navy">{profile.display_name}</p>
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
            <Link
              className="text-xs font-bold text-brand-green hover:underline"
              href="/receitas"
            >
              Rascunhos ICP-Brasil →
            </Link>
          </div>
        </div>
      )}

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
