import type {
  Appointment,
  AppointmentStatus,
  ClinicalRecord,
  ClinicalRecordStatus,
  ClinicalVitals,
  PetSummary,
} from '../../types/entities';

export const VET_OFFLINE_DB_NAME = 'drvet_vet_offline_cache_v1';
export const VET_OFFLINE_DB_VERSION = 1;
export const VET_OFFLINE_APPOINTMENTS_STORE = 'appointments';
export const VET_OFFLINE_RECORDS_STORE = 'basic_records';
export const VET_OFFLINE_META_STORE = 'cache_meta';
export const VET_OFFLINE_MAX_APPOINTMENTS = 200;
export const VET_OFFLINE_MAX_RECORDS = 150;
export const VET_OFFLINE_APPOINTMENT_PAST_DAYS = 30;
export const LAST_ACTIVE_VET_STORAGE_KEY = 'drvet:last-active-vet-id:v1';

export interface CachedVetAppointment extends Appointment {
  cache_key: string;
  cached_at: string;
}

export interface CachedVetBasicRecord {
  cache_key: string;
  id: string;
  appointment_id: string;
  organization_id: string;
  pet_id: string;
  veterinarian_id: string;
  pet: PetSummary | null;
  status: ClinicalRecordStatus;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  cached_at: string;
}

export interface VetOfflineCacheMeta {
  veterinarian_id: string;
  veterinarian_name: string | null;
  last_synced_at: string;
  appointments_count: number;
  records_count: number;
}

export function buildAppointmentCacheKey(
  veterinarianId: string,
  appointmentId: string,
): string {
  return `${veterinarianId}:${appointmentId}`;
}

export function buildBasicRecordCacheKey(
  veterinarianId: string,
  appointmentId: string,
): string {
  return `${veterinarianId}:${appointmentId}`;
}

export function normalizeOfflineText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function toCachedVetAppointment(
  appointment: Appointment,
  cachedAt: string = new Date().toISOString(),
): CachedVetAppointment {
  return {
    ...appointment,
    pet: appointment.pet
      ? {
          id: appointment.pet.id,
          name: appointment.pet.name,
          species: appointment.pet.species,
        }
      : null,
    cache_key: buildAppointmentCacheKey(appointment.veterinarian_id, appointment.id),
    cached_at: cachedAt,
  };
}

export function toAppointmentFromCached(cached: CachedVetAppointment): Appointment {
  return {
    id: cached.id,
    availability_id: cached.availability_id,
    organization_id: cached.organization_id,
    pet_id: cached.pet_id,
    tutor_id: cached.tutor_id,
    veterinarian_id: cached.veterinarian_id,
    kind: cached.kind,
    status: cached.status,
    reason: cached.reason,
    starts_at: cached.starts_at,
    ends_at: cached.ends_at,
    pet: cached.pet
      ? {
          id: cached.pet.id,
          name: cached.pet.name,
          species: cached.pet.species,
        }
      : null,
  };
}

export function toCachedVetBasicRecord(
  record: ClinicalRecord,
  cachedAt: string = new Date().toISOString(),
): CachedVetBasicRecord {
  return {
    cache_key: buildBasicRecordCacheKey(record.veterinarian_id, record.appointment_id),
    id: record.id,
    appointment_id: record.appointment_id,
    organization_id: record.organization_id,
    pet_id: record.pet_id,
    veterinarian_id: record.veterinarian_id,
    pet: record.pet
      ? {
          id: record.pet.id,
          name: record.pet.name,
          species: record.pet.species,
        }
      : null,
    status: record.status,
    subjective: record.subjective,
    objective: record.objective,
    assessment: record.assessment,
    plan: record.plan,
    vitals: {
      weight_kg: record.vitals.weight_kg ?? null,
      temperature_c: record.vitals.temperature_c ?? null,
      heart_rate_bpm: record.vitals.heart_rate_bpm ?? null,
      respiratory_rate_rpm: record.vitals.respiratory_rate_rpm ?? null,
      mucous_membranes: record.vitals.mucous_membranes ?? null,
      capillary_refill_seconds: record.vitals.capillary_refill_seconds ?? null,
    },
    finalized_at: record.finalized_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
    cached_at: cachedAt,
  };
}

export function toClinicalRecordFromCached(cached: CachedVetBasicRecord): ClinicalRecord {
  return {
    id: cached.id,
    appointment_id: cached.appointment_id,
    organization_id: cached.organization_id,
    pet_id: cached.pet_id,
    veterinarian_id: cached.veterinarian_id,
    subjective: cached.subjective,
    objective: cached.objective,
    assessment: cached.assessment,
    plan: cached.plan,
    vitals: { ...cached.vitals },
    status: cached.status,
    finalized_at: cached.finalized_at,
    created_at: cached.created_at,
    updated_at: cached.updated_at,
    pet: cached.pet ? { ...cached.pet } : null,
  };
}

export function pruneVetAppointmentsForCache(
  appointments: Appointment[],
  veterinarianId: string,
  now: Date = new Date(),
): CachedVetAppointment[] {
  const cutoffMs =
    now.getTime() - VET_OFFLINE_APPOINTMENT_PAST_DAYS * 24 * 60 * 60 * 1000;
  const cachedAt = now.toISOString();
  const byId = new Map<string, Appointment>();

  for (const item of appointments) {
    if (!veterinarianId || item.veterinarian_id !== veterinarianId) continue;
    const startMs = new Date(item.starts_at).getTime();
    if (Number.isNaN(startMs) || startMs < cutoffMs) continue;
    byId.set(item.id, item);
  }

  return Array.from(byId.values())
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    )
    .slice(0, VET_OFFLINE_MAX_APPOINTMENTS)
    .map((item) => toCachedVetAppointment(item, cachedAt));
}

export function pruneVetBasicRecordsForCache(
  records: ClinicalRecord[],
  veterinarianId: string,
  now: Date = new Date(),
): CachedVetBasicRecord[] {
  const cachedAt = now.toISOString();
  const byAppointmentId = new Map<string, ClinicalRecord>();

  for (const record of records) {
    if (!veterinarianId || record.veterinarian_id !== veterinarianId) continue;
    const existing = byAppointmentId.get(record.appointment_id);
    if (
      !existing ||
      new Date(record.updated_at).getTime() >= new Date(existing.updated_at).getTime()
    ) {
      byAppointmentId.set(record.appointment_id, record);
    }
  }

  return Array.from(byAppointmentId.values())
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    )
    .slice(0, VET_OFFLINE_MAX_RECORDS)
    .map((record) => toCachedVetBasicRecord(record, cachedAt));
}

export function filterCachedAppointments<T extends Appointment>(
  appointments: T[],
  filters: {
    q?: string;
    status?: AppointmentStatus | '';
    from?: string;
    to?: string;
  } = {},
): T[] {
  const normalizedQuery = normalizeOfflineText(filters.q);
  const fromMs = filters.from ? new Date(filters.from).getTime() : null;
  const toMs = filters.to
    ? new Date(
        filters.to.length <= 10 ? `${filters.to}T23:59:59.999Z` : filters.to,
      ).getTime()
    : null;

  return appointments.filter((appointment) => {
    if (filters.status && appointment.status !== filters.status) {
      return false;
    }

    const startMs = new Date(appointment.starts_at).getTime();
    if (fromMs !== null && !Number.isNaN(fromMs) && startMs < fromMs) {
      return false;
    }
    if (toMs !== null && !Number.isNaN(toMs) && startMs > toMs) {
      return false;
    }

    if (normalizedQuery) {
      const kindLabel =
        appointment.kind === 'teleconsultation' ? 'teleconsulta' : 'presencial';
      const haystack = normalizeOfflineText(
        [
          appointment.pet?.name,
          appointment.pet?.species,
          appointment.reason,
          kindLabel,
          appointment.status,
        ]
          .filter(Boolean)
          .join(' '),
      );
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });
}

export function filterCachedBasicRecords<
  T extends {
    pet?: PetSummary | null;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    appointment_id: string;
  },
>(records: T[], query: string): T[] {
  const normalizedQuery = normalizeOfflineText(query);
  if (!normalizedQuery) return records;

  return records.filter((record) => {
    const haystack = normalizeOfflineText(
      [
        record.pet?.name,
        record.pet?.species,
        record.subjective,
        record.objective,
        record.assessment,
        record.plan,
        record.appointment_id,
      ]
        .filter(Boolean)
        .join(' '),
    );
    return haystack.includes(normalizedQuery);
  });
}

export function formatCachedVitalsSummary(vitals: ClinicalVitals): string[] {
  const items: string[] = [];
  if (vitals.weight_kg !== null) items.push(`Peso: ${vitals.weight_kg} kg`);
  if (vitals.temperature_c !== null) items.push(`Temp.: ${vitals.temperature_c} °C`);
  if (vitals.heart_rate_bpm !== null) items.push(`FC: ${vitals.heart_rate_bpm} bpm`);
  if (vitals.respiratory_rate_rpm !== null) {
    items.push(`FR: ${vitals.respiratory_rate_rpm} rpm`);
  }
  if (vitals.capillary_refill_seconds !== null) {
    items.push(`TPC: ${vitals.capillary_refill_seconds} s`);
  }
  if (vitals.mucous_membranes) {
    items.push(`Mucosas: ${vitals.mucous_membranes}`);
  }
  return items;
}

export function isLikelyOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : '';

  if (!message) return false;

  return (
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('err_internet_disconnected') ||
    message.includes('falha de conexão') ||
    message.includes('falha de rede') ||
    message.includes('conexão de rede') ||
    message.includes('sem conexão') ||
    message.includes('conexão instável') ||
    message.includes('fetch')
  );
}
