export const TELECONSULTATION_RECORDING_POLICY = {
  policyVersion: 'v1-lgpd-cfmv-2026',
  retentionDays: 1825, // 5 anos mínimos de referência clínica
  storageBucket: 'teleconsultation-recordings',
  requiresDualConsent: true,
  requiresPrivateEncryptedBucket: true,
  allowClientLocalRecording: false,
} as const;

export type ConsentParty = 'tutor' | 'vet';

export interface TeleconsultationConsentState {
  sessionId: string;
  appointmentId: string;
  tutorId: string;
  veterinarianId: string;
  sessionStatus: 'waiting' | 'in_progress' | 'ended';
  tutorConsentedAt: string | null;
  tutorRevokedAt: string | null;
  vetConsentedAt: string | null;
  vetRevokedAt: string | null;
  storageBucketProvisioned: boolean;
  policyVersion?: string;
}

export interface RecordingReadinessResult {
  recordingPermitted: boolean;
  tutorConsented: boolean;
  vetConsented: boolean;
  bilateralConsented: boolean;
  storageReady: boolean;
  sessionActive: boolean;
  policyVersion: string;
  retentionDays: number;
  missingRequirements: string[];
}

export function hasActivePartyConsent(
  consentedAt: string | null | undefined,
  revokedAt: string | null | undefined,
): boolean {
  if (!consentedAt) return false;
  if (!revokedAt) return true;
  return new Date(consentedAt).getTime() > new Date(revokedAt).getTime();
}

export function canActorSignConsent(params: {
  actorId: string;
  tutorId: string;
  veterinarianId: string;
  targetParty: ConsentParty;
}): { allowed: boolean; reason?: string } {
  if (!params.actorId) {
    return { allowed: false, reason: 'Usuário não autenticado.' };
  }

  if (params.targetParty === 'tutor') {
    if (params.actorId !== params.tutorId) {
      return {
        allowed: false,
        reason: 'Somente o tutor responsável pelo atendimento pode registrar ou revogar o consentimento do tutor.',
      };
    }
    return { allowed: true };
  }

  if (params.actorId !== params.veterinarianId) {
    return {
      allowed: false,
      reason: 'Somente o médico-veterinário designado pode registrar ou revogar o consentimento profissional.',
    };
  }
  return { allowed: true };
}

export function evaluateRecordingReadiness(
  state: TeleconsultationConsentState,
): RecordingReadinessResult {
  const tutorConsented = hasActivePartyConsent(
    state.tutorConsentedAt,
    state.tutorRevokedAt,
  );
  const vetConsented = hasActivePartyConsent(
    state.vetConsentedAt,
    state.vetRevokedAt,
  );
  const bilateralConsented = tutorConsented && vetConsented;
  const sessionActive =
    state.sessionStatus === 'waiting' || state.sessionStatus === 'in_progress';
  const storageReady = Boolean(state.storageBucketProvisioned);

  const missingRequirements: string[] = [];
  if (!tutorConsented) {
    missingRequirements.push('Consentimento explícito do tutor pendente.');
  }
  if (!vetConsented) {
    missingRequirements.push('Consentimento explícito do médico-veterinário pendente.');
  }
  if (!sessionActive) {
    missingRequirements.push('A sessão de teleconsulta já foi encerrada.');
  }
  if (!storageReady) {
    missingRequirements.push(
      'Armazenamento privado criptografado (teleconsultation-recordings) ainda não provisionado.',
    );
  }

  return {
    recordingPermitted:
      bilateralConsented && sessionActive && storageReady,
    tutorConsented,
    vetConsented,
    bilateralConsented,
    storageReady,
    sessionActive,
    policyVersion:
      state.policyVersion || TELECONSULTATION_RECORDING_POLICY.policyVersion,
    retentionDays: TELECONSULTATION_RECORDING_POLICY.retentionDays,
    missingRequirements,
  };
}
