export interface CommissionSplitInput {
  grossAmountCents: number;
  discountCents?: number;
  platformFeeBps?: number;
}

export interface CommissionSplitResult {
  grossAmountCents: number;
  discountCents: number;
  chargedAmountCents: number;
  platformFeeBps: number;
  platformFeeCents: number;
  netVeterinarianCents: number;
}

export function calculateCommissionSplitCents(
  input: CommissionSplitInput,
): CommissionSplitResult {
  if (!Number.isInteger(input.grossAmountCents) || input.grossAmountCents < 0) {
    throw new Error('Valor bruto em centavos inválido para cálculo de split.');
  }

  const discountCents = input.discountCents ?? 0;
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new Error('Desconto em centavos inválido.');
  }

  const platformFeeBps = input.platformFeeBps ?? 1500;
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 5000) {
    throw new Error('Percentual da plataforma (bps) fora do limite permitido.');
  }

  const chargedAmountCents = Math.max(0, input.grossAmountCents - discountCents);
  const platformFeeCents = Math.round((chargedAmountCents * platformFeeBps) / 10_000);
  const netVeterinarianCents = Math.max(0, chargedAmountCents - platformFeeCents);

  return {
    grossAmountCents: input.grossAmountCents,
    discountCents,
    chargedAmountCents,
    platformFeeBps,
    platformFeeCents,
    netVeterinarianCents,
  };
}
