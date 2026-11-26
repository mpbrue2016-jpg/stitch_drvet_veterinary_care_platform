'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { CalendarDays, Camera, Trash2, Upload, UserRound } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import {
  createAvailabilitySchema,
  createOrganizationSchema,
  registerVeterinarianSchema,
} from '@/lib/validations';
import {
  alternarBloqueioHorario,
  criarHorarioDisponivel,
  listarDisponibilidade,
} from '@/services/availability.service';
import {
  aprovarVeterinario,
  criarOrganizacao,
  listarOrganizacoesEVeterinarios,
  registrarVeterinario,
} from '@/services/organizations.service';
import {
  gerarCaminhoSeguroStorage,
  obterUrlPublicaStorage,
  uploadArquivoStorage,
} from '@/services/storage.service';
import type {
  AvailabilitySlot,
  Organization,
  VeterinarianProfile,
} from '@/types/entities';

const localDateTimeMin = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60_000,
)
  .toISOString()
  .slice(0, 16);

export function ProfessionalSetup() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [professionals, setProfessionals] = useState<VeterinarianProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [vetPhotoPath, setVetPhotoPath] = useState('');
  const [uploadingVetPhoto, setUploadingVetPhoto] = useState(false);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await listarOrganizacoesEVeterinarios();
      const nextOrganizations = result.organizations;
      setOrganizations(nextOrganizations);
      setProfessionals(result.professionals);
      setCurrentUserId(result.currentUserId);
      setOrganizationId((current) =>
        nextOrganizations.some((organization) => organization.id === current)
          ? current
          : nextOrganizations[0]?.id ?? '',
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar as organizações.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  const loadAvailability = useCallback(async (targetOrganizationId: string) => {
    setAvailabilityLoading(true);
    try {
      const result = await listarDisponibilidade({
        mine: true,
        organization_id: targetOrganizationId,
      });
      setAvailabilitySlots(result.availability);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao carregar os horários.',
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

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
      setVetPhotoPath('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar as alterações.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveProfessional(professional: VeterinarianProfile) {
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await aprovarVeterinario({
        organization_id: professional.organization_id,
        user_id: professional.user_id,
      });
      await loadOrganizations();
      setSuccessMessage('Profissional aprovado.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível aprovar o profissional.',
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
  const canManageAvailability = Boolean(
    selectedProfessional && selectedProfessional.status === 'approved',
  );

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
      await alternarBloqueioHorario({
        id: slot.id,
        is_blocked: isBlocked,
        block_reason: isBlocked ? blockReason.trim() || null : null,
      });
      setSuccessMessage(
        isBlocked ? 'Horário bloqueado.' : 'Horário liberado para agendamento.',
      );
      await loadAvailability(organizationId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drvet:availability-updated'));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível atualizar o horário.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVetPhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !organizationId) return;

    setErrorMessage('');
    setSuccessMessage('');
    setUploadingVetPhoto(true);
    try {
      const storagePath = gerarCaminhoSeguroStorage(organizationId, `vet-${file.name}`);
      const { path } = await uploadArquivoStorage({
        bucket: 'vet-avatars',
        path: storagePath,
        file,
      });
      setVetPhotoPath(path);
      setSuccessMessage('Foto profissional carregada e pronta para o cadastro.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a foto do veterinário.',
      );
    } finally {
      setUploadingVetPhoto(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#087a68]">
          Gestão clínica
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
        <div className="mt-5 grid gap-3" aria-busy="true">
          <Skeleton className="h-12 max-w-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
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
                  const parsed = createOrganizationSchema.safeParse({
                    name: String(formData.get('name') ?? ''),
                  });
                  if (!parsed.success) {
                    throw new Error(parsed.error.issues[0]?.message ?? 'Nome inválido.');
                  }
                  await criarOrganizacao(parsed.data.name);
                })
              }
            >
              <h3 className="font-bold text-[#153b50]">Criar organização veterinária</h3>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Nome da organização
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  maxLength={120}
                  minLength={2}
                  name="name"
                  required
                />
              </label>
              <button
                className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60"
                disabled={busy}
                type="submit"
              >
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
                    const parsed = registerVeterinarianSchema.safeParse({
                      organization_id: organizationId,
                      user_id: String(formData.get('userId') ?? ''),
                      registration_number: String(
                        formData.get('registrationNumber') ?? '',
                      ),
                      registration_region: String(
                        formData.get('registrationRegion') ?? '',
                      ),
                      specialty: String(formData.get('specialty') ?? ''),
                      avatar_path: vetPhotoPath.trim() || null,
                    });
                    if (!parsed.success) {
                      throw new Error(
                        parsed.error.issues[0]?.message ?? 'Dados do profissional inválidos.',
                      );
                    }
                    await registrarVeterinario(parsed.data);
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
                  <input
                    className="min-h-11 rounded-xl border border-slate-300 px-3"
                    maxLength={32}
                    name="registrationNumber"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  UF do registro
                  <input
                    className="min-h-11 rounded-xl border border-slate-300 px-3"
                    maxLength={2}
                    minLength={2}
                    name="registrationRegion"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Especialidade (opcional)
                  <input
                    className="min-h-11 rounded-xl border border-slate-300 px-3"
                    maxLength={120}
                    name="specialty"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-[#f6faff] p-3.5 sm:col-span-2">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
                    {(() => {
                      const previewUrl = obterUrlPublicaStorage('vet-avatars', vetPhotoPath);
                      return previewUrl ? (
                        <Image
                          alt="Foto profissional do veterinário"
                          className="object-cover"
                          fill
                          referrerPolicy="no-referrer"
                          sizes="56px"
                          src={previewUrl}
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-slate-400">
                          <Camera className="h-5 w-5" />
                        </span>
                      );
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#153b50]">
                      Foto profissional do veterinário (opcional)
                    </p>
                    <p className="text-xs text-slate-600">
                      JPG, PNG ou WEBP até 5 MB armazenada no bucket vet-avatars.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[#087a68] bg-white px-3.5 text-xs font-bold text-[#087a68] hover:bg-[#ebf5ff]">
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingVetPhoto
                          ? 'Enviando...'
                          : vetPhotoPath
                            ? 'Trocar foto'
                            : 'Enviar foto'}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={uploadingVetPhoto}
                          onChange={(event) => void handleVetPhotoUpload(event)}
                          type="file"
                        />
                      </label>
                      {vetPhotoPath && (
                        <button
                          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          onClick={() => setVetPhotoPath('')}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60 sm:col-span-2"
                  disabled={busy || uploadingVetPhoto}
                  type="submit"
                >
                  Registrar veterinário
                </button>
              </form>

              {professionals
                .filter((professional) => professional.organization_id === organizationId)
                .map((professional) => {
                  const photoUrl = obterUrlPublicaStorage(
                    'vet-avatars',
                    professional.avatar_path,
                  );
                  const isPending = professional.status === 'pending';
                  return (
                    <div
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 ${
                        isPending
                          ? 'bg-amber-50'
                          : 'border border-slate-200 bg-[#f6faff]'
                      }`}
                      key={professional.user_id}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                          {photoUrl ? (
                            <Image
                              alt={professional.display_name || 'Médico Veterinário'}
                              className="object-cover"
                              fill
                              referrerPolicy="no-referrer"
                              sizes="40px"
                              src={photoUrl}
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-slate-400">
                              <UserRound className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#153b50]">
                            {professional.display_name || 'Profissional'} · CRMV-
                            {professional.registration_region}{' '}
                            {professional.registration_number}
                          </p>
                          <p className="text-xs text-slate-600">
                            {isPending ? 'Pendente de aprovação' : 'Aprovado'} ·{' '}
                            {professional.avatar_path
                              ? 'Foto profissional cadastrada'
                              : 'Sem foto profissional'}{' '}
                            · Agenda individual separada
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!isPending && (
                          <Link
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-[#153b50] hover:bg-slate-50"
                            href={`/agendamento?vet=${professional.user_id}`}
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-[#087a68]" />
                            Horários deste vet
                          </Link>
                        )}
                        {isPending && (
                          <button
                            className="min-h-10 rounded-full bg-white px-4 text-sm font-bold text-[#087a68] disabled:opacity-60"
                            disabled={busy}
                            onClick={() => void approveProfessional(professional)}
                            type="button"
                          >
                            Aprovar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {selectedOrganization && canManageAvailability && (
            <form
              className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
              onSubmit={(event) =>
                void handleSubmit(event, async (formData) => {
                  const startsAtRaw = String(formData.get('startsAt') ?? '');
                  const endsAtRaw = String(formData.get('endsAt') ?? '');
                  const parsed = createAvailabilitySchema.safeParse({
                    organization_id: organizationId,
                    starts_at: startsAtRaw ? new Date(startsAtRaw).toISOString() : '',
                    ends_at: endsAtRaw ? new Date(endsAtRaw).toISOString() : '',
                  });
                  if (!parsed.success) {
                    throw new Error(
                      parsed.error.issues[0]?.message ?? 'Informe um intervalo válido.',
                    );
                  }
                  await criarHorarioDisponivel(parsed.data);
                  await loadAvailability(organizationId);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('drvet:availability-updated'));
                  }
                })
              }
            >
              <h3 className="font-bold text-[#153b50] sm:col-span-2">
                Publicar horário na sua agenda individual
              </h3>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Início
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  min={localDateTimeMin}
                  name="startsAt"
                  required
                  type="datetime-local"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                Fim
                <input
                  className="min-h-11 rounded-xl border border-slate-300 px-3"
                  min={localDateTimeMin}
                  name="endsAt"
                  required
                  type="datetime-local"
                />
              </label>
              <button
                className="min-h-11 rounded-full bg-[#087a68] px-4 font-bold text-white disabled:opacity-60 sm:col-span-2"
                disabled={busy}
                type="submit"
              >
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
                <h3 className="font-bold text-[#153b50]" id="availability-heading">
                  Horários publicados da sua agenda individual
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Estes horários pertencem exclusivamente a você nesta clínica. Bloqueie ou
                  libere janelas sem afetar os demais veterinários.
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
                <Skeleton className="h-24 w-full rounded-xl" />
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
