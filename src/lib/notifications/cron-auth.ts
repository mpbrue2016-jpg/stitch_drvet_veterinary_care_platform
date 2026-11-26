import crypto from 'node:crypto';

export function verifyCronSecretToken(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  const provided = providedToken?.trim();
  const expected = expectedSecret?.trim();
  if (!provided || !expected) return false;

  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}
