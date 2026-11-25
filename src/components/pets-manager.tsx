'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  PaginationControls,
  Select,
  Skeleton,
  Textarea,
  Toast,
} from '@/components/ui';
import { sanitizeNextPath } from '@/lib/auth/guards';
import type { PaginationMeta } from '@/lib/pagination';
import { createPetSchema } from '@/lib/validations';
import {
  atualizarPet,
  criarPet,
  excluirPet,
  listarPets,
} from '@/services/pets.service';
import {
  excluirArquivoStorage,
  gerarCaminhoSeguroStorage,
  listarArquivosStorage,
  obterUrlAssinadaStorage,
  uploadArquivoStorage,
} from '@/services/storage.service';
import { listarAssinaturasPet } from '@/services/subscriptions.service';
import { listarVacinas } from '@/services/vaccinations.service';
import type { Pet, PetSubscription, VaccinationRecord } from '@/types/entities';

interface PetAvatarInfo {
  path: string;
  url: string;
}

const sexLabels: Record<'female' | 'male' | 'unknown', string> = {
  female: 'Fêmea',
  male: 'Macho',
  unknown: 'Não informado',
};

const WEIGHT_PREFIX = 'Peso aproximado: ';
const AGE_PREFIX = 'Idade estimada: ';

function extractPetMetaFromNotes(rawNotes: string | null) {
  if (!rawNotes) {
    return { weightKg: '', estimatedAge: '', cleanNotes: '' };
  }
  const lines = rawNotes.split('\n');
  let weightKg = '';
  let estimatedAge = '';
  const remaining: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(WEIGHT_PREFIX)) {
      weightKg = trimmed
        .slice(WEIGHT_PREFIX.length)
        .replace(/\s*kg$/i, '')
        .trim();
    } else if (trimmed.startsWith(AGE_PREFIX)) {
      estimatedAge = trimmed.slice(AGE_PREFIX.length).trim();
    } else {
      remaining.push(line);
    }
  }

  return {
    weightKg,
    estimatedAge,
    cleanNotes: remaining.join('\n').trim(),
  };
}

function composePetNotes(input: {
  weightKg: string;
  estimatedAge: string;
  birthDate: string;
  cleanNotes: string;
}): string | null {
  const headerLines: string[] = [];
  const normalizedWeight = input.weightKg.trim().replace(',', '.');
  if (normalizedWeight) {
    headerLines.push(`${WEIGHT_PREFIX}${normalizedWeight} kg`);
  }
  if (!input.birthDate.trim() && input.estimatedAge.trim()) {
    headerLines.push(`${AGE_PREFIX}${input.estimatedAge.trim()}`);
  }

  const parts: string[] = [];
  if (headerLines.length > 0) parts.push(headerLines.join('\n'));
  if (input.cleanNotes.trim()) parts.push(input.cleanNotes.trim());
  const combined = parts.join('\n').trim();
  return combined || null;
}

function formatDate(value: string | null) {
  if (!value) return 'Não informada';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(parsed);
}

export function PetsManager({
  initialCreateMode = false,
}: {
  initialCreateMode?: boolean;
}) {
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [subscriptions, setSubscriptions] = useState<PetSubscription[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const [avatars, setAvatars] = useState<Record<string, PetAvatarInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPetId, setUploadingPetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(initialCreateMode);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [redirectNext, setRedirectNext] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<'default' | 'book'>('default');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [totalRegisteredPets, setTotalRegisteredPets] = useState<number | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    species: 'Cachorro',
    breed: '',
    birth_date: '',
    estimatedAge: '',
    weightKg: '',
    sex: 'unknown' as 'female' | 'male' | 'unknown',
    notes: '',
  });
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const createdName = params.get('created');
    if (createdName && !initialCreateMode) {
      setNotice(`Pet ${createdName} cadastrado com sucesso!`);
    }
    const nextParam = params.get('next');
    if (nextParam) {
      setRedirectNext(sanitizeNextPath(nextParam, '/pets'));
    }
  }, [initialCreateMode]);

  const loadPetsData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [petsRes, subsRes, vacsRes] = await Promise.all([
        listarPets({
          page,
          limit: 8,
          q: searchQuery || undefined,
        }),
        listarAssinaturasPet().catch(() => ({
          subscriptions: [] as PetSubscription[],
        })),
        listarVacinas({ limit: 200 }).catch(() => ({
          vaccinations: [] as VaccinationRecord[],
        })),
      ]);

      setPets(petsRes.pets);
      setPagination(petsRes.pagination ?? null);
      if (!searchQuery.trim()) {
        setTotalRegisteredPets(petsRes.pagination?.total ?? petsRes.pets.length);
      }
      setSubscriptions(subsRes.subscriptions);
      setVaccinations(vacsRes.vaccinations);

      const avatarEntries = await Promise.all(
        petsRes.pets.map(async (pet) => {
          try {
            const files = await listarArquivosStorage(
              'pet-avatars',
              `${pet.owner_id}/${pet.id}`,
            );
            const latest = files[0];
            if (!latest) return null;
            const url = await obterUrlAssinadaStorage(
              'pet-avatars',
              latest.fullPath,
              600,
            );
            return [pet.id, { path: latest.fullPath, url }] as const;
          } catch {
            return null;
          }
        }),
      );

      const nextAvatars: Record<string, PetAvatarInfo> = {};
      avatarEntries.forEach((entry) => {
        if (entry) nextAvatars[entry[0]] = entry[1];
      });
      setAvatars(nextAvatars);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os dados dos seus pets.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    void loadPetsData();
  }, [loadPetsData]);

  function resetForm() {
    setFormState({
      name: '',
      species: 'Cachorro',
      breed: '',
      birth_date: '',
      estimatedAge: '',
      weightKg: '',
      sex: 'unknown',
      notes: '',
    });
    setPendingPhoto(null);
    setEditingPetId(null);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
    setNotice('');
    setErrorMessage('');
  }

  function startEdit(pet: Pet) {
    const meta = extractPetMetaFromNotes(pet.notes);
    setEditingPetId(pet.id);
    setFormState({
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? '',
      birth_date: pet.birth_date ?? '',
      estimatedAge: meta.estimatedAge,
      weightKg: meta.weightKg,
      sex: pet.sex ?? 'unknown',
      notes: meta.cleanNotes,
    });
    setPendingPhoto(null);
    setShowForm(true);
    setNotice('');
    setErrorMessage('');
  }

  async function handleSavePet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setNotice('');

    if (formState.weightKg.trim()) {
      const numericWeight = Number(formState.weightKg.trim().replace(',', '.'));
      if (Number.isNaN(numericWeight) || numericWeight <= 0 || numericWeight > 500) {
        setErrorMessage('Informe um peso válido em kg (entre 0,1 e 500 kg).');
        return;
      }
    }

    const composedNotes = composePetNotes({
      weightKg: formState.weightKg,
      estimatedAge: formState.estimatedAge,
      birthDate: formState.birth_date,
      cleanNotes: formState.notes,
    });

    const parsed = createPetSchema.safeParse({
      name: formState.name,
      species: formState.species,
      breed: formState.breed || null,
      birth_date: formState.birth_date || null,
      sex: formState.sex,
      notes: composedNotes,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ?? 'Confira os dados informados para o pet.',
      );
      return;
    }

    setSaving(true);
    try {
      let savedPet: Pet;
      if (editingPetId) {
        const result = await atualizarPet({
          id: editingPetId,
          name: parsed.data.name,
          species: parsed.data.species,
          breed: parsed.data.breed ?? null,
          birth_date: parsed.data.birth_date ?? null,
          sex: parsed.data.sex ?? 'unknown',
          notes: parsed.data.notes ?? null,
        });
        savedPet = result.pet;
      } else {
        const result = await criarPet({
          name: parsed.data.name,
          species: parsed.data.species,
          breed: parsed.data.breed ?? null,
          birth_date: parsed.data.birth_date ?? null,
          sex: parsed.data.sex ?? 'unknown',
          notes: parsed.data.notes ?? null,
        });
        savedPet = result.pet;
      }

      if (pendingPhoto) {
        const path = gerarCaminhoSeguroStorage(
          `${savedPet.owner_id}/${savedPet.id}`,
          pendingPhoto.name,
        );
        await uploadArquivoStorage({
          bucket: 'pet-avatars',
          path,
          file: pendingPhoto,
        });
      }

      if (!editingPetId && submitAction === 'book') {
        router.push(`/agendamento/edit?petId=${encodeURIComponent(savedPet.id)}`);
        router.refresh();
        return;
      }

      if (initialCreateMode && !editingPetId) {
        const destination =
          redirectNext ?? `/pets?created=${encodeURIComponent(savedPet.name)}`;
        router.push(destination);
        router.refresh();
        return;
      }

      setNotice(
        editingPetId
          ? `Ficha de ${savedPet.name} atualizada no Supabase.`
          : `Pet ${savedPet.name} cadastrado com sucesso!`,
      );
      resetForm();
      setShowForm(false);
      await loadPetsData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao salvar dados do pet.',
      );
    } finally {
      setSaving(false);
      setSubmitAction('default');
    }
  }

  async function handleAvatarUpload(
    pet: Pet,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadingPetId(pet.id);
    setErrorMessage('');
    setNotice('');
    try {
      const path = gerarCaminhoSeguroStorage(
        `${pet.owner_id}/${pet.id}`,
        file.name,
      );
      await uploadArquivoStorage({
        bucket: 'pet-avatars',
        path,
        file,
      });
      const url = await obterUrlAssinadaStorage('pet-avatars', path, 600);
      setAvatars((current) => ({
        ...current,
        [pet.id]: { path, url },
      }));
      setNotice(`Foto de ${pet.name} atualizada com segurança.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao enviar foto do pet.',
      );
    } finally {
      setUploadingPetId(null);
    }
  }

  async function handleAvatarRemove(pet: Pet) {
    const current = avatars[pet.id];
    if (!current) return;
    setUploadingPetId(pet.id);
    setErrorMessage('');
    setNotice('');
    try {
      await excluirArquivoStorage('pet-avatars', [current.path]);
      setAvatars((prev) => {
        const next = { ...prev };
        delete next[pet.id];
        return next;
      });
      setNotice(`Foto de ${pet.name} removida do armazenamento.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao remover a foto.',
      );
    } finally {
      setUploadingPetId(null);
    }
  }

  async function handleDeletePet(pet: Pet) {
    setSaving(true);
    setErrorMessage('');
    setNotice('');
    try {
      await excluirPet(pet.id);
      setConfirmDeleteId(null);
      setNotice(`Cadastro de ${pet.name} removido.`);
      await loadPetsData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir este pet (ele pode possuir consultas vinculadas).',
      );
    } finally {
      setSaving(false);
    }
  }

  const activeSubsCount = subscriptions.filter((s) => s.status === 'active').length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            {initialCreateMode ? (
              <Link href="/pets">
                <Button variant="outline">← Voltar para Meus Pets</Button>
              </Link>
            ) : (
              <>
                <Link href="/agendamento/edit">
                  <Button variant="outline">Nova teleconsulta</Button>
                </Link>
                <Button onClick={startCreate} type="button" variant="secondary">
                  + Cadastrar novo pet
                </Button>
              </>
            )}
          </div>
        }
        description="Gerencie a ficha completa dos seus pets, foto de perfil protegida no Supabase Storage, vacinas e cobertura do Clube DrVet."
        title={initialCreateMode ? 'Cadastrar Novo Pet' : 'Meus Pets'}
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

      {!initialCreateMode && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              detail="Cadastrados na sua conta"
              icon="♡"
              label="Pets registrados"
              value={
                loading
                  ? '...'
                  : String(totalRegisteredPets ?? pagination?.total ?? pets.length)
              }
            />
            <MetricCard
              detail="Proteção preventiva ativa"
              icon="★"
              label="Clube DrVet ativo"
              value={loading ? '...' : String(activeSubsCount)}
            />
            <MetricCard
              detail="Doses aplicadas registradas"
              icon="✓"
              label="Carteira vacinal"
              value={loading ? '...' : String(vaccinations.length)}
            />
          </div>

          <form
            aria-label="Buscar pets"
            className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearchQuery(searchInput.trim());
            }}
          >
            <div className="min-w-[220px] flex-1">
              <Input
                label="Buscar pet por nome, espécie, raça ou observação"
                name="pets-search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Ex.: Pipoca, Gato, Golden..."
                value={searchInput}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                Buscar
              </Button>
              {(searchQuery || searchInput) && (
                <Button
                  onClick={() => {
                    setSearchInput('');
                    setSearchQuery('');
                    setPage(1);
                  }}
                  type="button"
                  variant="outline"
                >
                  Limpar
                </Button>
              )}
            </div>
          </form>
        </>
      )}

      {showForm && (
        <Card
          description="Preencha identificação, peso, idade ou nascimento, dados clínicos básicos e foto opcional no bucket privado pet-avatars."
          title={editingPetId ? 'Editar ficha do pet' : 'Novo cadastro de pet'}
        >
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSavePet}>
            <Input
              label="Nome do pet *"
              maxLength={100}
              name="name"
              onChange={(e) =>
                setFormState((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="Ex.: Pipoca"
              required
              value={formState.name}
            />
            <Select
              label="Espécie *"
              name="species"
              onChange={(e) =>
                setFormState((s) => ({ ...s, species: e.target.value }))
              }
              value={formState.species}
            >
              <option value="Cachorro">Cachorro</option>
              <option value="Gato">Gato</option>
              <option value="Ave">Ave</option>
              <option value="Roedor">Roedor</option>
              <option value="Outro">Outro</option>
            </Select>
            <Input
              label="Raça (opcional)"
              maxLength={100}
              name="breed"
              onChange={(e) =>
                setFormState((s) => ({ ...s, breed: e.target.value }))
              }
              placeholder="Ex.: Golden Retriever, SRD, Siamês"
              value={formState.breed}
            />
            <Select
              label="Sexo"
              name="sex"
              onChange={(e) =>
                setFormState((s) => ({
                  ...s,
                  sex: e.target.value as 'female' | 'male' | 'unknown',
                }))
              }
              value={formState.sex}
            >
              <option value="female">Fêmea</option>
              <option value="male">Macho</option>
              <option value="unknown">Não informado</option>
            </Select>
            <Input
              label="Data de nascimento (opcional)"
              name="birth_date"
              onChange={(e) =>
                setFormState((s) => ({ ...s, birth_date: e.target.value }))
              }
              type="date"
              value={formState.birth_date}
            />
            <Input
              disabled={Boolean(formState.birth_date)}
              label="Ou idade aproximada (se não souber a data)"
              maxLength={60}
              name="estimatedAge"
              onChange={(e) =>
                setFormState((s) => ({ ...s, estimatedAge: e.target.value }))
              }
              placeholder="Ex.: 3 anos e 6 meses"
              value={formState.estimatedAge}
            />
            <Input
              inputMode="decimal"
              label="Peso aproximado em kg (opcional)"
              maxLength={12}
              name="weightKg"
              onChange={(e) =>
                setFormState((s) => ({ ...s, weightKg: e.target.value }))
              }
              placeholder="Ex.: 12.5"
              value={formState.weightKg}
            />
            <div className="grid gap-1.5">
              <label
                className="text-sm font-semibold text-brand-ink"
                htmlFor="pet-photo-upload"
              >
                Foto do pet (JPG, PNG ou WEBP · até 5 MB)
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-brand-ink file:mr-3 file:rounded-full file:border-0 file:bg-[#dff0ff] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#006b57]"
                id="pet-photo-upload"
                onChange={(e) => setPendingPhoto(e.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Observações clínicas e alergias (opcional)"
                maxLength={1800}
                name="notes"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, notes: e.target.value }))
                }
                placeholder="Ex.: Alergia alimentar a frango, usa medicação contínua, histórico prévio..."
                value={formState.notes}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
              <Button
                onClick={() => {
                  if (initialCreateMode) {
                    router.push(redirectNext ?? '/pets');
                    return;
                  }
                  resetForm();
                  setShowForm(false);
                }}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              {!editingPetId && (
                <Button
                  disabled={saving}
                  onClick={() => setSubmitAction('book')}
                  type="submit"
                  variant="primary"
                >
                  {saving && submitAction === 'book'
                    ? 'Salvando...'
                    : 'Cadastrar e agendar consulta'}
                </Button>
              )}
              <Button
                disabled={saving}
                onClick={() => setSubmitAction('default')}
                type="submit"
                variant="secondary"
              >
                {saving && submitAction === 'default'
                  ? 'Salvando...'
                  : editingPetId
                    ? 'Salvar alterações'
                    : 'Concluir cadastro do pet'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!initialCreateMode && (
        <>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-52" />
              <Skeleton className="h-52" />
            </div>
          ) : pets.length === 0 ? (
            <EmptyState
              action={
                searchQuery ? (
                  <Button
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                      setPage(1);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Limpar busca
                  </Button>
                ) : (
                  <Button onClick={startCreate} type="button" variant="secondary">
                    Cadastrar meu primeiro pet
                  </Button>
                )
              }
              description={
                searchQuery
                  ? 'Nenhum pet corresponde ao termo pesquisado.'
                  : 'Cadastre seu cão, gato ou outro animal para agendar teleconsultas, acompanhar vacinas e assinar o Clube DrVet.'
              }
              title={
                searchQuery
                  ? 'Nenhum pet encontrado na busca'
                  : 'Nenhum pet cadastrado ainda'
              }
            />
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
              {pets.map((pet) => {
                const avatar = avatars[pet.id];
                const activeSub = subscriptions.find(
                  (sub) => sub.pet_id === pet.id && sub.status === 'active',
                );
                const petVacCount = vaccinations.filter(
                  (vac) => vac.pet_id === pet.id,
                ).length;
                const isUploading = uploadingPetId === pet.id;
                const meta = extractPetMetaFromNotes(pet.notes);

                return (
                  <article
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-card"
                    key={pet.id}
                  >
                    <div className="flex items-start gap-4">
                      {avatar ? (
                        <Image
                          alt={pet.name}
                          className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-[#dff7f0]"
                          height={64}
                          referrerPolicy="no-referrer"
                          src={avatar.url}
                          width={64}
                        />
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#ebf5ff] text-2xl font-bold text-[#006b57]">
                          {pet.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-extrabold text-[#153b50]">
                            {pet.name}
                          </h2>
                          {activeSub && (
                            <Badge variant="success">
                              Clube {activeSub.plan_name ?? 'Ativo'} ({activeSub.discount_percent}% OFF)
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {pet.species}
                          {pet.breed ? ` · ${pet.breed}` : ''} ·{' '}
                          {sexLabels[pet.sex ?? 'unknown']}
                          {meta.weightKg ? ` · ${meta.weightKg} kg` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {pet.birth_date
                            ? `Nascimento: ${formatDate(pet.birth_date)}`
                            : meta.estimatedAge
                              ? `Idade estimada: ${meta.estimatedAge}`
                              : 'Nascimento: Não informado'}{' '}
                          · Vacinas registradas: <strong>{petVacCount}</strong>
                        </p>
                      </div>
                    </div>

                    {meta.cleanNotes && (
                      <p className="rounded-xl bg-[#f6faff] px-3.5 py-2.5 text-xs leading-5 text-slate-700">
                        {meta.cleanNotes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#153b50] hover:bg-[#ebf5ff]">
                        {isUploading
                          ? 'Enviando foto...'
                          : avatar
                            ? 'Trocar foto'
                            : 'Adicionar foto'}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => void handleAvatarUpload(pet, e)}
                          type="file"
                        />
                      </label>
                      {avatar && (
                        <Button
                          disabled={isUploading}
                          onClick={() => void handleAvatarRemove(pet)}
                          type="button"
                          variant="ghost"
                        >
                          Remover foto
                        </Button>
                      )}
                      <Button
                        onClick={() => startEdit(pet)}
                        type="button"
                        variant="outline"
                      >
                        Editar
                      </Button>
                      {confirmDeleteId === pet.id ? (
                        <div className="ml-auto flex items-center gap-2">
                          <Button
                            disabled={saving}
                            onClick={() => void handleDeletePet(pet)}
                            type="button"
                            variant="danger"
                          >
                            Confirmar exclusão
                          </Button>
                          <Button
                            onClick={() => setConfirmDeleteId(null)}
                            type="button"
                            variant="ghost"
                          >
                            Voltar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="ml-auto"
                          onClick={() => setConfirmDeleteId(pet.id)}
                          type="button"
                          variant="ghost"
                        >
                          Excluir
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <Link
                        className="rounded-full bg-[#dff7f0] px-3 py-1.5 text-[#006b57] hover:bg-[#c8f0e4]"
                        href={`/agendamento/edit?petId=${encodeURIComponent(pet.id)}`}
                      >
                        Agendar consulta →
                      </Link>
                      <Link
                        className="rounded-full bg-[#ebf5ff] px-3 py-1.5 text-[#153b50] hover:bg-[#d4ebff]"
                        href="/carteira/vacinas"
                      >
                        Carteira de vacinas
                      </Link>
                      {!activeSub && (
                        <Link
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200"
                          href="/assinaturas"
                        >
                          Assinar Clube DrVet
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
              </div>
              {pagination && (
                <PaginationControls
                  disabled={loading}
                  onPageChange={(nextPage) => setPage(nextPage)}
                  page={pagination.page}
                  total={pagination.total}
                  totalPages={pagination.totalPages}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
