import crypto from 'node:crypto';
export {
  calculateCommissionSplitCents,
  type CommissionSplitInput,
  type CommissionSplitResult,
} from './split';

export type PaymentGatewayProvider = 'asaas' | 'mercado_pago';

export interface PaymentGatewayReadiness {
  provider: PaymentGatewayProvider;
  configured: boolean;
  webhookVerificationReady: boolean;
  missingEnvVars: string[];
}

export function checkPaymentGatewayReadiness(
  env: Record<string, string | undefined>,
): PaymentGatewayReadiness[] {
  const hasWebhookSecret = Boolean(env.PAYMENT_WEBHOOK_SECRET?.trim());
  const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const mpMissing: string[] = [];
  if (!env.MERCADO_PAGO_ACCESS_TOKEN?.trim()) mpMissing.push('MERCADO_PAGO_ACCESS_TOKEN');
  if (!hasWebhookSecret) mpMissing.push('PAYMENT_WEBHOOK_SECRET');
  if (!hasServiceRole) mpMissing.push('SUPABASE_SERVICE_ROLE_KEY');

  const asaasMissing: string[] = [];
  if (!env.ASAAS_API_KEY?.trim()) asaasMissing.push('ASAAS_API_KEY');
  if (!hasWebhookSecret) asaasMissing.push('PAYMENT_WEBHOOK_SECRET');
  if (!hasServiceRole) asaasMissing.push('SUPABASE_SERVICE_ROLE_KEY');

  return [
    {
      provider: 'mercado_pago',
      configured: Boolean(env.MERCADO_PAGO_ACCESS_TOKEN?.trim()),
      webhookVerificationReady: hasWebhookSecret && hasServiceRole,
      missingEnvVars: mpMissing,
    },
    {
      provider: 'asaas',
      configured: Boolean(env.ASAAS_API_KEY?.trim()),
      webhookVerificationReady: hasWebhookSecret && hasServiceRole,
      missingEnvVars: asaasMissing,
    },
  ];
}

export function verifySharedWebhookSecret(
  provided: string,
  expected: string,
): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifyHmacSha256Hex(params: {
  payload: string;
  signatureHex: string;
  secret: string;
}): boolean {
  if (!params.secret || !params.signatureHex) return false;
  const expectedHex = crypto
    .createHmac('sha256', params.secret)
    .update(params.payload)
    .digest('hex');

  const provided = Buffer.from(params.signatureHex.trim().toLowerCase(), 'utf8');
  const expected = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

export function isWithinReplayWindow(
  timestampSeconds: number,
  options: { maxAgeSeconds?: number; nowMs?: number } = {},
): boolean {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return false;
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const delta = Math.abs(nowSeconds - Math.floor(timestampSeconds));
  return delta <= maxAgeSeconds;
}

export function verifyMercadoPagoSignature(params: {
  signatureHeader: string;
  requestIdHeader: string;
  dataId: string;
  secret: string;
  nowMs?: number;
  maxAgeSeconds?: number;
}): { valid: boolean; reason?: string; timestampSeconds?: number } {
  const parts = params.signatureHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let tsRaw = '';
  let v1 = '';
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 'ts') tsRaw = value ?? '';
    if (key === 'v1') v1 = value ?? '';
  }

  const ts = Number.parseInt(tsRaw, 10);
  if (!tsRaw || !v1 || !Number.isFinite(ts)) {
    return { valid: false, reason: 'Cabeçalho x-signature incompleto.' };
  }

  if (
    !isWithinReplayWindow(ts, {
      nowMs: params.nowMs,
      maxAgeSeconds: params.maxAgeSeconds,
    })
  ) {
    return { valid: false, reason: 'Timestamp de webhook fora da janela anti-replay.' };
  }

  const manifest = `id:${params.dataId};request-id:${params.requestIdHeader};ts:${tsRaw};`;
  const ok = verifyHmacSha256Hex({
    payload: manifest,
    signatureHex: v1,
    secret: params.secret,
  });

  if (!ok) {
    return { valid: false, reason: 'Assinatura HMAC-SHA256 divergente.' };
  }

  return { valid: true, timestampSeconds: ts };
}

export function computePayloadSha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}
