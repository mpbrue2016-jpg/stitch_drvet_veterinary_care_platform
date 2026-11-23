import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  '169.254.169.254',
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((octet) => Number(octet));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('::ffff:')) {
    const mappedV4 = lower.slice(7);
    if (net.isIPv4(mappedV4)) {
      return isPrivateOrReservedIpv4(mappedV4);
    }
  }
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }
  if (lower.startsWith('ff')) return true;
  return false;
}

export function isPrivateIpAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateOrReservedIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIpv6(ip);
  return true;
}

export async function validateSafeExternalUrl(
  rawUrl: string,
): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'URL inválida.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: 'Apenas URLs HTTP ou HTTPS são permitidas.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { valid: false, reason: 'Endereços locais ou internos não são permitidos.' };
  }

  if (net.isIP(hostname) !== 0) {
    if (isPrivateIpAddress(hostname)) {
      return { valid: false, reason: 'Endereços IP privados ou reservados não são permitidos.' };
    }
    return { valid: true, url: parsed };
  }

  try {
    const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
    if (resolved.length === 0) {
      return { valid: false, reason: 'Não foi possível resolver o host informado.' };
    }
    for (const record of resolved) {
      if (isPrivateIpAddress(record.address)) {
        return {
          valid: false,
          reason: 'O host informado resolve para um endereço IP privado ou interno.',
        };
      }
    }
  } catch {
    return { valid: false, reason: 'Falha ao validar resolução DNS do endpoint informado.' };
  }

  return { valid: true, url: parsed };
}
