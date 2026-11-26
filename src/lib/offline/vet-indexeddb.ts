'use client';

import type { Appointment, ClinicalRecord } from '@/types/entities';
import {
  buildBasicRecordCacheKey,
  LAST_ACTIVE_VET_STORAGE_KEY,
  pruneVetAppointmentsForCache,
  pruneVetBasicRecordsForCache,
  toAppointmentFromCached,
  toCachedVetBasicRecord,
  toClinicalRecordFromCached,
  VET_OFFLINE_APPOINTMENTS_STORE,
  VET_OFFLINE_DB_NAME,
  VET_OFFLINE_DB_VERSION,
  VET_OFFLINE_META_STORE,
  VET_OFFLINE_RECORDS_STORE,
  type CachedVetAppointment,
  type CachedVetBasicRecord,
  type VetOfflineCacheMeta,
} from './vet-cache-helpers';

export interface VetOfflineCacheSnapshot {
  supported: boolean;
  veterinarianId: string | null;
  meta: VetOfflineCacheMeta | null;
  appointments: Appointment[];
  records: CachedVetBasicRecord[];
}

export function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function setLastActiveVetIdHint(veterinarianId: string): void {
  if (typeof window === 'undefined' || !veterinarianId.trim()) return;
  try {
    window.localStorage.setItem(LAST_ACTIVE_VET_STORAGE_KEY, veterinarianId.trim());
  } catch {
    // ignore storage quota or privacy-mode failures
  }
}

export function getLastActiveVetIdHint(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_VET_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function clearLastActiveVetIdHint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_ACTIVE_VET_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function openVetOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbSupported()) {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }

    const request = window.indexedDB.open(
      VET_OFFLINE_DB_NAME,
      VET_OFFLINE_DB_VERSION,
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(VET_OFFLINE_APPOINTMENTS_STORE)) {
        const apptStore = db.createObjectStore(VET_OFFLINE_APPOINTMENTS_STORE, {
          keyPath: 'cache_key',
        });
        apptStore.createIndex('by_vet', 'veterinarian_id', { unique: false });
        apptStore.createIndex('by_starts_at', 'starts_at', { unique: false });
      }

      if (!db.objectStoreNames.contains(VET_OFFLINE_RECORDS_STORE)) {
        const recordStore = db.createObjectStore(VET_OFFLINE_RECORDS_STORE, {
          keyPath: 'cache_key',
        });
        recordStore.createIndex('by_vet', 'veterinarian_id', { unique: false });
        recordStore.createIndex('by_updated_at', 'updated_at', { unique: false });
      }

      if (!db.objectStoreNames.contains(VET_OFFLINE_META_STORE)) {
        db.createObjectStore(VET_OFFLINE_META_STORE, {
          keyPath: 'veterinarian_id',
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Falha ao abrir cache local IndexedDB.'));
    request.onblocked = () =>
      reject(new Error('Banco local IndexedDB aguardando liberação de outra aba.'));
  });
}

function idbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Erro em operação IndexedDB.'));
  });
}

function idbTransactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Falha na transação IndexedDB.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Transação IndexedDB abortada.'));
  });
}

async function getByVetIndex<T>(
  store: IDBObjectStore,
  veterinarianId: string,
): Promise<T[]> {
  if (!store.indexNames.contains('by_vet')) return [];
  const index = store.index('by_vet');
  const results = await idbRequestToPromise(
    index.getAll(IDBKeyRange.only(veterinarianId)),
  );
  return (results as T[]) ?? [];
}

async function deleteVetEntriesInStore(
  store: IDBObjectStore,
  veterinarianId: string,
): Promise<void> {
  if (!store.indexNames.contains('by_vet')) return;
  const index = store.index('by_vet');
  const keys = await idbRequestToPromise(
    index.getAllKeys(IDBKeyRange.only(veterinarianId)),
  );
  for (const key of keys) {
    store.delete(key);
  }
}

export async function saveVetAppointmentsToCache(
  veterinarianId: string,
  appointments: Appointment[],
  veterinarianName?: string | null,
): Promise<VetOfflineCacheMeta | null> {
  if (!isIndexedDbSupported() || !veterinarianId.trim()) return null;
  setLastActiveVetIdHint(veterinarianId);

  const db = await openVetOfflineDb();
  try {
    const now = new Date();
    const pruned = pruneVetAppointmentsForCache(appointments, veterinarianId, now);
    const tx = db.transaction(
      [VET_OFFLINE_APPOINTMENTS_STORE, VET_OFFLINE_META_STORE],
      'readwrite',
    );
    const apptStore = tx.objectStore(VET_OFFLINE_APPOINTMENTS_STORE);
    const metaStore = tx.objectStore(VET_OFFLINE_META_STORE);

    const existingMeta = (await idbRequestToPromise(
      metaStore.get(veterinarianId),
    )) as VetOfflineCacheMeta | undefined;

    await deleteVetEntriesInStore(apptStore, veterinarianId);
    for (const entry of pruned) {
      apptStore.put(entry);
    }

    const nextMeta: VetOfflineCacheMeta = {
      veterinarian_id: veterinarianId,
      veterinarian_name:
        veterinarianName ?? existingMeta?.veterinarian_name ?? null,
      last_synced_at: now.toISOString(),
      appointments_count: pruned.length,
      records_count: existingMeta?.records_count ?? 0,
    };
    metaStore.put(nextMeta);

    await idbTransactionComplete(tx);
    return nextMeta;
  } finally {
    db.close();
  }
}

export async function saveVetBasicRecordsToCache(
  veterinarianId: string,
  records: ClinicalRecord[],
  veterinarianName?: string | null,
): Promise<VetOfflineCacheMeta | null> {
  if (!isIndexedDbSupported() || !veterinarianId.trim()) return null;
  setLastActiveVetIdHint(veterinarianId);

  const db = await openVetOfflineDb();
  try {
    const now = new Date();
    const pruned = pruneVetBasicRecordsForCache(records, veterinarianId, now);
    const tx = db.transaction(
      [VET_OFFLINE_RECORDS_STORE, VET_OFFLINE_META_STORE],
      'readwrite',
    );
    const recordStore = tx.objectStore(VET_OFFLINE_RECORDS_STORE);
    const metaStore = tx.objectStore(VET_OFFLINE_META_STORE);

    const existingMeta = (await idbRequestToPromise(
      metaStore.get(veterinarianId),
    )) as VetOfflineCacheMeta | undefined;

    await deleteVetEntriesInStore(recordStore, veterinarianId);
    for (const entry of pruned) {
      recordStore.put(entry);
    }

    const nextMeta: VetOfflineCacheMeta = {
      veterinarian_id: veterinarianId,
      veterinarian_name:
        veterinarianName ?? existingMeta?.veterinarian_name ?? null,
      last_synced_at: now.toISOString(),
      appointments_count: existingMeta?.appointments_count ?? 0,
      records_count: pruned.length,
    };
    metaStore.put(nextMeta);

    await idbTransactionComplete(tx);
    return nextMeta;
  } finally {
    db.close();
  }
}

export async function saveSingleVetBasicRecordToCache(
  record: ClinicalRecord,
): Promise<void> {
  if (!isIndexedDbSupported() || !record.veterinarian_id.trim()) return;
  setLastActiveVetIdHint(record.veterinarian_id);

  const db = await openVetOfflineDb();
  try {
    const nowIso = new Date().toISOString();
    const cachedEntry = toCachedVetBasicRecord(record, nowIso);
    const tx = db.transaction(
      [VET_OFFLINE_RECORDS_STORE, VET_OFFLINE_META_STORE],
      'readwrite',
    );
    const recordStore = tx.objectStore(VET_OFFLINE_RECORDS_STORE);
    const metaStore = tx.objectStore(VET_OFFLINE_META_STORE);

    recordStore.put(cachedEntry);

    const existingRecords = await getByVetIndex<CachedVetBasicRecord>(
      recordStore,
      record.veterinarian_id,
    );
    const existingMeta = (await idbRequestToPromise(
      metaStore.get(record.veterinarian_id),
    )) as VetOfflineCacheMeta | undefined;

    const totalForVet = existingRecords.some(
      (item) => item.cache_key === cachedEntry.cache_key,
    )
      ? existingRecords.length
      : existingRecords.length + 1;

    metaStore.put({
      veterinarian_id: record.veterinarian_id,
      veterinarian_name: existingMeta?.veterinarian_name ?? null,
      last_synced_at: nowIso,
      appointments_count: existingMeta?.appointments_count ?? 0,
      records_count: totalForVet,
    } satisfies VetOfflineCacheMeta);

    await idbTransactionComplete(tx);
  } finally {
    db.close();
  }
}

export async function syncFullVetOfflineSnapshot(params: {
  veterinarianId: string;
  appointments: Appointment[];
  clinicalRecords: ClinicalRecord[];
  veterinarianName?: string | null;
}): Promise<VetOfflineCacheMeta | null> {
  if (!isIndexedDbSupported() || !params.veterinarianId.trim()) return null;
  setLastActiveVetIdHint(params.veterinarianId);

  const db = await openVetOfflineDb();
  try {
    const now = new Date();
    const prunedAppointments = pruneVetAppointmentsForCache(
      params.appointments,
      params.veterinarianId,
      now,
    );
    const prunedRecords = pruneVetBasicRecordsForCache(
      params.clinicalRecords,
      params.veterinarianId,
      now,
    );

    const tx = db.transaction(
      [
        VET_OFFLINE_APPOINTMENTS_STORE,
        VET_OFFLINE_RECORDS_STORE,
        VET_OFFLINE_META_STORE,
      ],
      'readwrite',
    );
    const apptStore = tx.objectStore(VET_OFFLINE_APPOINTMENTS_STORE);
    const recordStore = tx.objectStore(VET_OFFLINE_RECORDS_STORE);
    const metaStore = tx.objectStore(VET_OFFLINE_META_STORE);

    await Promise.all([
      deleteVetEntriesInStore(apptStore, params.veterinarianId),
      deleteVetEntriesInStore(recordStore, params.veterinarianId),
    ]);

    for (const item of prunedAppointments) {
      apptStore.put(item);
    }
    for (const record of prunedRecords) {
      recordStore.put(record);
    }

    const nextMeta: VetOfflineCacheMeta = {
      veterinarian_id: params.veterinarianId,
      veterinarian_name: params.veterinarianName ?? null,
      last_synced_at: now.toISOString(),
      appointments_count: prunedAppointments.length,
      records_count: prunedRecords.length,
    };
    metaStore.put(nextMeta);

    await idbTransactionComplete(tx);
    return nextMeta;
  } finally {
    db.close();
  }
}

async function resolveTargetVetId(
  db: IDBDatabase,
  explicitVetId?: string | null,
): Promise<string | null> {
  if (explicitVetId && explicitVetId.trim()) {
    return explicitVetId.trim();
  }
  const hint = getLastActiveVetIdHint();
  if (hint) return hint;

  const tx = db.transaction([VET_OFFLINE_META_STORE], 'readonly');
  const metas = (await idbRequestToPromise(
    tx.objectStore(VET_OFFLINE_META_STORE).getAll(),
  )) as VetOfflineCacheMeta[];
  if (!metas || metas.length === 0) return null;

  metas.sort(
    (left, right) =>
      new Date(right.last_synced_at).getTime() -
      new Date(left.last_synced_at).getTime(),
  );
  return metas[0]?.veterinarian_id ?? null;
}

export async function getVetOfflineCacheSnapshot(
  explicitVetId?: string | null,
): Promise<VetOfflineCacheSnapshot> {
  if (!isIndexedDbSupported()) {
    return {
      supported: false,
      veterinarianId: null,
      meta: null,
      appointments: [],
      records: [],
    };
  }

  const db = await openVetOfflineDb();
  try {
    const vetId = await resolveTargetVetId(db, explicitVetId);
    if (!vetId) {
      return {
        supported: true,
        veterinarianId: null,
        meta: null,
        appointments: [],
        records: [],
      };
    }

    const tx = db.transaction(
      [
        VET_OFFLINE_APPOINTMENTS_STORE,
        VET_OFFLINE_RECORDS_STORE,
        VET_OFFLINE_META_STORE,
      ],
      'readonly',
    );
    const [cachedAppts, cachedRecords, meta] = await Promise.all([
      getByVetIndex<CachedVetAppointment>(
        tx.objectStore(VET_OFFLINE_APPOINTMENTS_STORE),
        vetId,
      ),
      getByVetIndex<CachedVetBasicRecord>(
        tx.objectStore(VET_OFFLINE_RECORDS_STORE),
        vetId,
      ),
      idbRequestToPromise(
        tx.objectStore(VET_OFFLINE_META_STORE).get(vetId),
      ) as Promise<VetOfflineCacheMeta | undefined>,
    ]);

    const sortedAppointments = cachedAppts
      .sort(
        (left, right) =>
          new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
      )
      .map(toAppointmentFromCached);

    const sortedRecords = cachedRecords.sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
    );

    return {
      supported: true,
      veterinarianId: vetId,
      meta: meta ?? null,
      appointments: sortedAppointments,
      records: sortedRecords,
    };
  } finally {
    db.close();
  }
}

export async function getCachedVetAppointments(
  explicitVetId?: string | null,
): Promise<{
  appointments: Appointment[];
  veterinarianId: string | null;
  lastSyncedAt: string | null;
}> {
  const snapshot = await getVetOfflineCacheSnapshot(explicitVetId);
  return {
    appointments: snapshot.appointments,
    veterinarianId: snapshot.veterinarianId,
    lastSyncedAt: snapshot.meta?.last_synced_at ?? null,
  };
}

export async function getCachedVetBasicRecords(
  explicitVetId?: string | null,
): Promise<{
  clinicalRecords: ClinicalRecord[];
  rawRecords: CachedVetBasicRecord[];
  veterinarianId: string | null;
  lastSyncedAt: string | null;
}> {
  const snapshot = await getVetOfflineCacheSnapshot(explicitVetId);
  return {
    clinicalRecords: snapshot.records.map(toClinicalRecordFromCached),
    rawRecords: snapshot.records,
    veterinarianId: snapshot.veterinarianId,
    lastSyncedAt: snapshot.meta?.last_synced_at ?? null,
  };
}

export async function getCachedVetBasicRecordByAppointment(
  appointmentId: string,
  explicitVetId?: string | null,
): Promise<{
  clinicalRecord: ClinicalRecord | null;
  lastSyncedAt: string | null;
}> {
  if (!isIndexedDbSupported() || !appointmentId.trim()) {
    return { clinicalRecord: null, lastSyncedAt: null };
  }

  const db = await openVetOfflineDb();
  try {
    const vetId = await resolveTargetVetId(db, explicitVetId);
    if (!vetId) {
      return { clinicalRecord: null, lastSyncedAt: null };
    }

    const tx = db.transaction(
      [VET_OFFLINE_RECORDS_STORE, VET_OFFLINE_META_STORE],
      'readonly',
    );
    const cacheKey = buildBasicRecordCacheKey(vetId, appointmentId);
    const [cached, meta] = await Promise.all([
      idbRequestToPromise(
        tx.objectStore(VET_OFFLINE_RECORDS_STORE).get(cacheKey),
      ) as Promise<CachedVetBasicRecord | undefined>,
      idbRequestToPromise(
        tx.objectStore(VET_OFFLINE_META_STORE).get(vetId),
      ) as Promise<VetOfflineCacheMeta | undefined>,
    ]);

    return {
      clinicalRecord: cached ? toClinicalRecordFromCached(cached) : null,
      lastSyncedAt: cached?.cached_at ?? meta?.last_synced_at ?? null,
    };
  } finally {
    db.close();
  }
}

export async function clearVetOfflineCache(
  explicitVetId?: string | null,
): Promise<void> {
  if (!isIndexedDbSupported()) {
    clearLastActiveVetIdHint();
    return;
  }

  const db = await openVetOfflineDb();
  try {
    const tx = db.transaction(
      [
        VET_OFFLINE_APPOINTMENTS_STORE,
        VET_OFFLINE_RECORDS_STORE,
        VET_OFFLINE_META_STORE,
      ],
      'readwrite',
    );
    const apptStore = tx.objectStore(VET_OFFLINE_APPOINTMENTS_STORE);
    const recordStore = tx.objectStore(VET_OFFLINE_RECORDS_STORE);
    const metaStore = tx.objectStore(VET_OFFLINE_META_STORE);

    if (explicitVetId && explicitVetId.trim()) {
      const targetId = explicitVetId.trim();
      await Promise.all([
        deleteVetEntriesInStore(apptStore, targetId),
        deleteVetEntriesInStore(recordStore, targetId),
      ]);
      metaStore.delete(targetId);
      if (getLastActiveVetIdHint() === targetId) {
        clearLastActiveVetIdHint();
      }
    } else {
      apptStore.clear();
      recordStore.clear();
      metaStore.clear();
      clearLastActiveVetIdHint();
    }

    await idbTransactionComplete(tx);
  } finally {
    db.close();
  }
}
