import type { PrescriptionItem } from '../../types/entities';

export interface CanonicalPrescriptionInput {
  prescriptionId: string;
  appointmentId: string;
  organizationId: string;
  petId: string;
  veterinarianId: string;
  verificationCode: string;
  issuedAt: string;
  items: PrescriptionItem[];
}

export interface DigitalSignatureReadiness {
  mode: 'qr_authenticity_only';
  icpBrasilActive: false;
  privateKeyStoredInApp: false;
  canonicalHashAlgorithm: 'SHA-256';
  schemaVersion: 'drvet-rx-v1';
  supportedCloudProviders: readonly {
    id: 'vidaas' | 'birdid' | 'soluti' | 'certisign';
    label: string;
    standard: 'PAdES-ICP-Brasil';
  }[];
  complianceNotes: string[];
}

export const ICP_BRASIL_CLOUD_PROVIDERS: DigitalSignatureReadiness['supportedCloudProviders'] =
  [
    { id: 'vidaas', label: 'Vidaas (Valid)', standard: 'PAdES-ICP-Brasil' },
    { id: 'birdid', label: 'BirdID (Soluti / VaultID)', standard: 'PAdES-ICP-Brasil' },
    { id: 'soluti', label: 'Soluti / Certillion', standard: 'PAdES-ICP-Brasil' },
    { id: 'certisign', label: 'Certisign remoteID', standard: 'PAdES-ICP-Brasil' },
  ] as const;

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCanonicalPrescriptionItems(
  items: readonly PrescriptionItem[],
): PrescriptionItem[] {
  return items.map((item) => ({
    name: normalizeText(item.name),
    presentation: normalizeText(item.presentation),
    dose: normalizeText(item.dose),
    route: normalizeText(item.route),
    frequency: normalizeText(item.frequency),
    duration: normalizeText(item.duration),
    quantity: normalizeText(item.quantity),
    instructions: normalizeText(item.instructions),
  }));
}

export function buildCanonicalPrescriptionManifest(
  input: CanonicalPrescriptionInput,
): string {
  const issuedIso = new Date(input.issuedAt).toISOString();
  const canonicalObject = {
    schemaVersion: 'drvet-rx-v1',
    appointmentId: input.appointmentId.trim(),
    issuedAt: issuedIso,
    items: normalizeCanonicalPrescriptionItems(input.items),
    organizationId: input.organizationId.trim(),
    petId: input.petId.trim(),
    prescriptionId: input.prescriptionId.trim(),
    verificationCode: input.verificationCode.trim().toUpperCase(),
    veterinarianId: input.veterinarianId.trim(),
  };

  return JSON.stringify(canonicalObject);
}

export async function computePrescriptionDigestHex(
  input: CanonicalPrescriptionInput,
): Promise<string> {
  const manifest = buildCanonicalPrescriptionManifest(input);
  const bytes = new TextEncoder().encode(manifest);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto SHA-256 indisponível neste ambiente de execução.',
    );
  }
  const digestBuffer = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function evaluateDigitalSignatureReadiness(): DigitalSignatureReadiness {
  return {
    mode: 'qr_authenticity_only',
    icpBrasilActive: false,
    privateKeyStoredInApp: false,
    canonicalHashAlgorithm: 'SHA-256',
    schemaVersion: 'drvet-rx-v1',
    supportedCloudProviders: ICP_BRASIL_CLOUD_PROVIDERS,
    complianceNotes: [
      'A aplicação não armazena chave privada ou senha de certificado e-CPF do médico-veterinário.',
      'Receitas emitidas geram código verificável único e manifesto canônico SHA-256 pronto para assinatura remota PAdES via Autoridade Certificadora credenciada.',
      'Receituários de controle especial MAPA/CFMV exigem acoplamento com provedor ICP-Brasil homologado antes do uso regulatório.',
    ],
  };
}
