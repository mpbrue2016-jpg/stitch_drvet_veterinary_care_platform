import type { PrescriptionVerification } from '../../types/entities';

export const RECENT_VERIFIED_CODES_STORAGE_KEY =
  'drvet:verified_prescription_codes:v1';
export const MAX_RECENT_VERIFIED_CODES = 5;

export interface CachedVerifiedPrescription {
  code: string;
  verifiedAt: string;
  result: PrescriptionVerification;
}

export function normalizeVerificationCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isSafeVerificationCode(code: string): boolean {
  return /^[A-Z0-9-]{4,32}$/.test(code);
}

export function extractPrescriptionCodeFromQrValue(
  rawValue: string,
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.length > 512) return null;

  const direct = normalizeVerificationCode(trimmed);
  if (isSafeVerificationCode(direct)) {
    return direct;
  }

  try {
    const parsedUrl = trimmed.startsWith('/')
      ? new URL(trimmed, 'https://drvet.local')
      : new URL(trimmed);
    const paramCode = parsedUrl.searchParams.get('code');
    if (paramCode) {
      const normalizedParam = normalizeVerificationCode(paramCode);
      if (isSafeVerificationCode(normalizedParam)) {
        return normalizedParam;
      }
    }
  } catch {
    // Non-URL payloads fall through to token regex extraction
  }

  const rxMatch = trimmed.match(/\b(RX-[A-Z0-9-]{4,28})\b/i);
  if (rxMatch?.[1]) {
    const normalizedMatch = normalizeVerificationCode(rxMatch[1]);
    if (isSafeVerificationCode(normalizedMatch)) {
      return normalizedMatch;
    }
  }

  return null;
}

function isNonEmptyString(value: unknown, maxLength = 180): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function sanitizeVerificationPayload(
  raw: unknown,
): PrescriptionVerification | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const verificationCode =
    typeof obj.verification_code === 'string'
      ? normalizeVerificationCode(obj.verification_code)
      : '';

  if (!isSafeVerificationCode(verificationCode)) return null;
  if (!isNonEmptyString(obj.status, 40)) return null;
  if (!isNonEmptyString(obj.issued_at, 64)) return null;
  if (Number.isNaN(Date.parse(obj.issued_at))) return null;
  if (!isNonEmptyString(obj.pet_name, 120)) return null;
  if (!isNonEmptyString(obj.species, 60)) return null;
  if (!isNonEmptyString(obj.veterinarian_name, 120)) return null;
  if (!isNonEmptyString(obj.crmv, 60)) return null;
  if (
    typeof obj.items_count !== 'number' ||
    !Number.isInteger(obj.items_count) ||
    obj.items_count < 0 ||
    obj.items_count > 100
  ) {
    return null;
  }

  return {
    verification_code: verificationCode,
    status: obj.status.trim(),
    issued_at: obj.issued_at.trim(),
    pet_name: obj.pet_name.trim(),
    species: obj.species.trim(),
    veterinarian_name: obj.veterinarian_name.trim(),
    crmv: obj.crmv.trim(),
    items_count: obj.items_count,
  };
}

export function parseRecentVerifiedCodes(
  rawJson: string | null,
): CachedVerifiedPrescription[] {
  if (!rawJson) return [];
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const normalizedEntries: CachedVerifiedPrescription[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const result = sanitizeVerificationPayload(record.result);
      if (!result) continue;

      const rawCode =
        typeof record.code === 'string'
          ? normalizeVerificationCode(record.code)
          : result.verification_code;
      if (!isSafeVerificationCode(rawCode) || rawCode !== result.verification_code) {
        continue;
      }

      if (seen.has(rawCode)) continue;

      const verifiedAt =
        typeof record.verifiedAt === 'string' &&
        !Number.isNaN(Date.parse(record.verifiedAt))
          ? record.verifiedAt
          : result.issued_at;

      seen.add(rawCode);
      normalizedEntries.push({
        code: rawCode,
        verifiedAt,
        result,
      });

      if (normalizedEntries.length >= MAX_RECENT_VERIFIED_CODES) {
        break;
      }
    }

    return normalizedEntries;
  } catch {
    return [];
  }
}

export function upsertRecentVerifiedCode(
  existing: CachedVerifiedPrescription[],
  verification: PrescriptionVerification,
  verifiedAt = new Date().toISOString(),
): CachedVerifiedPrescription[] {
  const sanitized = sanitizeVerificationPayload(verification);
  if (!sanitized) return existing.slice(0, MAX_RECENT_VERIFIED_CODES);

  const safeVerifiedAt = !Number.isNaN(Date.parse(verifiedAt))
    ? verifiedAt
    : new Date().toISOString();

  const nextEntry: CachedVerifiedPrescription = {
    code: sanitized.verification_code,
    verifiedAt: safeVerifiedAt,
    result: sanitized,
  };

  const filtered = existing.filter(
    (entry) => normalizeVerificationCode(entry.code) !== nextEntry.code,
  );

  return [nextEntry, ...filtered].slice(0, MAX_RECENT_VERIFIED_CODES);
}

export function removeRecentVerifiedCode(
  existing: CachedVerifiedPrescription[],
  targetCode: string,
): CachedVerifiedPrescription[] {
  const normalized = normalizeVerificationCode(targetCode);
  if (!normalized) return existing;
  return existing.filter(
    (entry) => normalizeVerificationCode(entry.code) !== normalized,
  );
}

export function findCachedVerifiedPrescription(
  existing: CachedVerifiedPrescription[],
  targetCode: string,
): CachedVerifiedPrescription | null {
  const normalized = normalizeVerificationCode(targetCode);
  if (!normalized) return null;
  return (
    existing.find(
      (entry) => normalizeVerificationCode(entry.code) === normalized,
    ) ?? null
  );
}

export function readRecentVerifiedCodesFromStorage(): CachedVerifiedPrescription[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseRecentVerifiedCodes(
      window.localStorage.getItem(RECENT_VERIFIED_CODES_STORAGE_KEY),
    );
  } catch {
    return [];
  }
}

export function writeRecentVerifiedCodesToStorage(
  entries: CachedVerifiedPrescription[],
): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = entries.slice(0, MAX_RECENT_VERIFIED_CODES);
    window.localStorage.setItem(
      RECENT_VERIFIED_CODES_STORAGE_KEY,
      JSON.stringify(trimmed),
    );
  } catch {
    // Ignore quota/storage access restrictions gracefully
  }
}

export function clearRecentVerifiedCodesFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_VERIFIED_CODES_STORAGE_KEY);
  } catch {
    // Ignore storage access restrictions gracefully
  }
}
