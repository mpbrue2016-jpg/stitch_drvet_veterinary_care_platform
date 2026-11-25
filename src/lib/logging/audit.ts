export type AuditOutcome = 'allowed' | 'denied' | 'error' | 'rate_limited';

export interface AuditLogInput {
  event: string;
  resource: string;
  action: string;
  outcome: AuditOutcome;
  actorId?: string | null;
  statusCode?: number;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN =
  /(password|senha|token|secret|key|authorization|cookie|pix_payload|subjective|objective|assessment|plan|clinical|notes|phone|email|cpf|cnpj)/i;

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  if (!metadata) return {};
  const clean: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      clean[key] = '[REDACTED]';
      continue;
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      clean[key] = value;
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, 200);
    } else if (Array.isArray(value)) {
      clean[key] = `array(${value.length})`;
    } else if (typeof value === 'object') {
      clean[key] = '[object]';
    }
  }

  return clean;
}

export function createStructuredAuditEntry(input: AuditLogInput) {
  return {
    timestamp: new Date().toISOString(),
    level: input.outcome === 'error' ? 'error' : input.outcome === 'denied' || input.outcome === 'rate_limited' ? 'warn' : 'info',
    event: input.event,
    resource: input.resource,
    action: input.action,
    outcome: input.outcome,
    actorId: input.actorId ?? null,
    statusCode: input.statusCode ?? null,
    requestId: input.requestId ?? null,
    metadata: sanitizeAuditMetadata(input.metadata),
  };
}

export function logAuditEvent(input: AuditLogInput) {
  const entry = createStructuredAuditEntry(input);
  const serialized = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(serialized);
  } else if (entry.level === 'warn') {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
  return entry;
}
