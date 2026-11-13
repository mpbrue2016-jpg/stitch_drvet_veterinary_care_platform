'use client';

import { useCallback, useEffect, useState } from 'react';

type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'veterinarian'
  | 'staff'
  | 'billing';
type Organization = {
  id: string;
  name: string;
  role: OrganizationRole;
};
type Professional = {
  organization_id: string;
  user_id: string;
  registration_number: string;
  registration_region: string;
  specialty: string | null;
  status: 'pending' | 'approved' | 'suspended';
};
type AvailabilitySlot = {
  id: string;
  organization_id: string;
  veterinarian_id: string;
  starts_at: string;
  ends_at: string;
  is_available: boolean;
  is_blocked: boolean;
  block_reason: string | null;
};
const localDateTimeMin = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60_000,
)
  .toISOString()
  .slice(0, 16);

export function ProfessionalSetup() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/organizations');
      const result: {
        organizations?: Organization[];
        professionals?: Professional[];
        currentUserId?: string;
        error?: string;
      } = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível carregar as organizações.');
      }

      const nextOrganizations = result.organizations ?? [];
      setOrganizations(nextOrganizations);
      setProfessionals(result.professionals ?? []);
      setCurrentUserId(result.currentUserId ?? '');
      if (
        !nextOrganizations.some((organization) => organization.id === organizationId)
      ) {
        setOrganizationId(nextOrganizations[0]?.id ?? '');
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar as organizações.',
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const loadAvailability = useCallback(async (targetOrganizationId: string) => {
    setAvailabilityLoading(true);
    try {
      const params = new URLSearchParams({
        mine: 'true',
        organization_id: targetOrganizationId,
      });
      const response = await fetch(`/api/availability?${params.toString()}`);
      const result: { availability?: AvailabilitySlot[]; error?: string } =
        await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível carregar os horários.');
      }
      setAvailabilitySlots(result.availability ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar os horários.',
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  async function submitJson(
    url: string,
    method: 'POST' | 'PATCH',
    body: Record<string, string>,
  ) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result: { error?: string } = await response.json();
    if (!response.ok) {
      throw new Error(result.error ?? 'Não foi possível salvar as alterações.');
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await action(formData);
      await loadOrganizations();
      setSuccessMessage('Alterações salvas.');
      form.reset();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar as alterações.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveProfessional(professional: Professional) {
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await submitJson('/api/organizations/veterinarians', 'PATCH', {
        organization_id: professional.organization_id,
        user_id: professional.user_id,
      });
      await loadOrganizations();
      setSuccessMessage('Profissional aprovado.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível aprovar o profissional.',
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedOrganization = organizations.find(
    (organization) => organization.id === organizationId,
  );
  const canManageTeam =
    selectedOrganization?.role === 'owner' || selectedOrganization?.role === 'admin';
  const selectedProfessional = professionals.find(
    (professional) =>
      professional.organization_id === organizationId &&
      professional.user_id === currentUserId,
  );
  const canManageAvailability =
    selectedOrganization?.role === 'veterinarian' &&
    selectedProfessional?.status === 'approved';

  useEffect(() => {
    if (canManageAvailability && organizationId) {
      void loadAvailability(organizationId);
    } else {
      setAvailabilitySlots([]);
    }
  }, [canManageAvailability, loadAvailability, organizationId]);

  async function setAvailabilityBlocked(
    slot: AvailabilitySlot,
    isBlocked: boolean,
  ) {
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slot.id,
          is_blocked: isBlocked,
          block_reason: isBlocked ? blockReason.trim() || null : null,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível atualizar o horário.');
      }
      setSuccessMessage(
        isBlocked ? 'Horário bloqueado.' : 'Horário liberado para agendamento.',
      );
      await loadAvailability(organizationId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível atualizar o horário.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          Configuração do backend
        </p>
        <h2 className="mt-2 text-xl font-bold text-[#153b50]">
          Organização e disponibilidade profissional
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Somente profissionais registrados pela organização e aprovados podem publicar
          horários para agendamento.
        </p>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          {successMessage}
        </p>
      )}

      {loading ? (
        <p className="py-6 text-sm text-slate-500">Carregando configurações...</p>
      ) : (
        <div className="mt-5 grid gap-5">
          {organizations.length > 0 && (
            <label className="grid max-w-xl gap-1.5 text-sm font-semibold text-slate-700">
              Organização ativa
              <select
                className="min-h-11 rounded-xl border border-slate-300 px-3"
                onChange={(event) => setOrganizationId(event.target.value)}
                value={organizationId}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name} · {organization.role}
                  </option>
                ))}
              </select>
            </label>
          )}

          {organizations.length === 0 && (
            <form
              className="grid max-w-xl gap-3 rounded-2xl bg-[#f6faff] p-4"
              onSubmit={(event) =>
                void handleSubmit(event, async (formData) => {
                  await submitJson('/api/organizations', 'POST', {
                    name: String(formData.get('name') ?? ''),
                  });
                })
              }
            >
              <h3 className="font-bold text-[#153b50]">Criar organização veterinária</h3>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Nome da organização
                <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={120} minLength={2} name="name" required />
              </label>
              <button className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60" disabled={busy} type="submit">
                Criar organização
              </button>
            </form>
          )}

          {selectedOrganization && canManageTeam && (
            <div className="grid gap-4">
              <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950">
                Para cadastrar um veterinário, ele precisa criar uma conta no DrVet primeiro.
                Informe o ID de usuário compartilhado pelo profissional; o acesso clínico
                permanece bloqueado até a aprovação.
              </p>
              <p className="break-all text-xs text-slate-500">
                Seu ID: <code>{currentUserId}</code>
              </p>
              <form
                className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
                onSubmit={(event) =>
                  void handleSubmit(event, async (formData) => {
                    await submitJson('/api/organizations/veterinarians', 'POST', {
                      organization_id: organizationId,
                      user_id: String(formData.get('userId') ?? ''),
                      registration_number: String(
                        formData.get('registrationNumber') ?? '',
                      ),
                      registration_region: String(
                        formData.get('registrationRegion') ?? '',
                      ).toUpperCase(),
                      specialty: String(formData.get('specialty') ?? ''),
                    });
                  })
                }
              >
                <h3 className="font-bold text-[#153b50] sm:col-span-2">
                  Registrar profissional para aprovação
                </h3>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  ID da conta do profissional
                  <input className="min-h-11 rounded-xl border border-slate-300 px-3" name="userId" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Registro profissional
                  <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={32} name="registrationNumber" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  UF do registro
                  <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={2} minLength={2} name="registrationRegion" required />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Especialidade (opcional)
                  <input className="min-h-11 rounded-xl border border-slate-300 px-3" maxLength={120} name="specialty" />
                </label>
                <button className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60 sm:col-span-2" disabled={busy} type="submit">
                  Registrar veterinário
                </button>
              </form>

              {professionals
                .filter(
                  (professional) =>
                    professional.organization_id === organizationId &&
                    professional.status === 'pending',
                )
                .map((professional) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3"
                    key={professional.user_id}
                  >
                    <p className="break-all text-sm text-amber-950">
                      Registro {professional.registration_region} {professional.registration_number}
                    </p>
                    <button
                      className="min-h-10 rounded-full bg-white px-4 text-sm font-bold text-[#087a68] disabled:opacity-60"
                      disabled={busy}
                      onClick={() => void approveProfessional(professional)}
                      type="button"
                    >
                      Aprovar
                    </button>
                  </div>
                ))}
            </div>
          )}

          {selectedOrganization && canManageAvailability && (
            <form
              className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
              onSubmit={(event) =>
                void handleSubmit(event, async (formData) => {
                  const startsAt = new Date(String(formData.get('startsAt'))).toISOString();
                  const endsAt = new Date(String(formData.get('endsAt'))).toISOString();
                  await submitJson('/api/availability', 'POST', {
                    organization_id: organizationId,
                    starts_at: startsAt,
                    ends_at: endsAt,
                  });
                  await loadAvailability(organizationId);
                })
              }
            >
              <h3 className="font-bold text-[#153b50] sm:col-span-2">
                Publicar horário de atendimento
              </h3>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Início
                <input className="min-h-11 rounded-xl border border-slate-300 px-3" min={localDateTimeMin} name="startsAt" required type="datetime-local" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Fim
                <input className="min-h-11 rounded-xl border border-slate-300 px-3" min={localDateTimeMin} name="endsAt" required type="datetime-local" />
              </label>
              <button className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60 sm:col-span-2" disabled={busy} type="submit">
                Publicar disponibilidade
              </button>
            </form>
          )}

          {selectedOrganization && canManageAvailability && (
            <section
              aria-labelledby="availability-heading"
              className="grid gap-3 rounded-2xl border border-slate-200 p-4"
            >
              <div>
                <h3
                  className="font-bold text-[#153b50]"
                  id="availability-heading"
                >
                  Horários publicados
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Bloqueie horários sem agendamento ou libere um bloqueio. Horários
                  reservados não podem ser bloqueados.
                </p>
              </div>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:max-w-xl">
                Motivo do bloqueio (opcional)
                <input
                  className="min-h-10 rounded-xl border border-slate-300 px-3 font-normal"
                  maxLength={300}
                  onChange={(event) => setBlockReason(event.target.value)}
                  value={blockReason}
                />
              </label>

              {availabilityLoading ? (
                <p className="py-4 text-sm text-slate-500">Carregando horários...</p>
              ) : availabilitySlots.length === 0 ? (
                <p className="rounded-xl bg-[#f6faff] p-4 text-sm text-slate-600">
                  Não há horários futuros publicados para esta organização.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {availabilitySlots.map((slot) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6faff] p-3"
                      key={slot.id}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#153b50]">
                          {new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(slot.starts_at))}
                          {' – '}
                          {new Intl.DateTimeFormat('pt-BR', {
                            timeStyle: 'short',
                          }).format(new Date(slot.ends_at))}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {slot.is_blocked
                            ? `Bloqueado${slot.block_reason ? `: ${slot.block_reason}` : ''}`
                            : slot.is_available
                              ? 'Disponível para agendamento'
                              : 'Reservado por um agendamento'}
                        </p>
                      </div>
                      {(slot.is_blocked || slot.is_available) && (
                        <button
                          className={`min-h-9 rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${
                            slot.is_blocked
                              ? 'border border-[#087a68] text-[#087a68]'
                              : 'border border-red-200 text-red-700'
                          }`}
                          disabled={busy}
                          onClick={() =>
                            void setAvailabilityBlocked(slot, !slot.is_blocked)
                          }
                          type="button"
                        >
                          {slot.is_blocked ? 'Liberar horário' : 'Bloquear horário'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
