import type {
  FacialBiometricProfile,
  FacialBiometricVerification,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export interface FacialBiometricsStatusResponse {
  schemaReady: boolean;
  enrolled: boolean;
  isVeterinarian: boolean;
  role: string;
  biometric: FacialBiometricProfile | null;
  recentLogs: FacialBiometricVerification[];
}

export async function consultarBiometriaFacial(): Promise<FacialBiometricsStatusResponse> {
  try {
    const response = await fetch('/api/biometrics', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as
      | (FacialBiometricsStatusResponse & { error?: string })
      | null;

    if (!response.ok || !payload) {
      throw new Error(
        payload?.error || 'Não foi possível verificar a biometria facial.',
      );
    }

    return payload;
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível verificar a biometria facial.',
    );
  }
}

export async function cadastrarBiometriaFacial(input: {
  template_hash: string;
  descriptor_vector: number[];
  liveness_score: number;
  device_label?: string | null;
}): Promise<{ biometric: FacialBiometricProfile }> {
  try {
    const response = await fetch('/api/biometrics/enroll', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      biometric?: FacialBiometricProfile;
      error?: string;
    } | null;

    if (!response.ok || !payload?.biometric) {
      throw new Error(
        payload?.error || 'Não foi possível cadastrar a biometria facial.',
      );
    }

    return { biometric: payload.biometric };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível cadastrar a biometria facial.',
    );
  }
}

export async function verificarBiometriaFacial(input: {
  descriptor_vector: number[];
  liveness_score: number;
  device_label?: string | null;
}): Promise<{
  matched: boolean;
  similarityScore: number;
  livenessScore: number;
  threshold: number;
  message: string;
}> {
  try {
    const response = await fetch('/api/biometrics/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      matched?: boolean;
      similarityScore?: number;
      livenessScore?: number;
      threshold?: number;
      message?: string;
      error?: string;
    } | null;

    if (!response.ok || !payload || typeof payload.matched !== 'boolean') {
      throw new Error(
        payload?.error || 'Não foi possível validar sua biometria facial.',
      );
    }

    return {
      matched: payload.matched,
      similarityScore: payload.similarityScore ?? 0,
      livenessScore: payload.livenessScore ?? 0,
      threshold: payload.threshold ?? 0.78,
      message:
        payload.message ??
        (payload.matched
          ? 'Biometria facial confirmada.'
          : 'Rosto não corresponde ao cadastro biométrico.'),
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível validar sua biometria facial.',
    );
  }
}

export async function revogarBiometriaFacial(): Promise<void> {
  try {
    const response = await fetch('/api/biometrics', {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        payload?.error || 'Não foi possível revogar a biometria facial.',
      );
    }
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível revogar a biometria facial.',
    );
  }
}
