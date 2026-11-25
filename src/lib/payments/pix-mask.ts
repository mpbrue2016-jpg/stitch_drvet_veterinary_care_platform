export function maskPixKeyForDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 6) return '***';

  if (trimmed.includes('@')) {
    const atIndex = trimmed.indexOf('@');
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    if (!domain) return '***';
    const safeLocal =
      local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`;
    return `${safeLocal}@${domain}`;
  }

  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}
