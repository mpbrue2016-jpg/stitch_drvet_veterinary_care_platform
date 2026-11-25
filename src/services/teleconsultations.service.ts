import { getSupabaseClient } from '@/lib/supabase';
import type { RecordingReadinessResult } from '@/lib/teleconsultation/consent';
import type {
  TeleconsultationMessage,
  TeleconsultationSession,
  TeleconsultationStatus,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export interface TeleconsultationConsentSummary {
  session_id: string;
  appointment_id: string;
  tutor_id: string;
  veterinarian_id: string;
  policy_version: string;
  tutor_consented_at: string | null;
  tutor_revoked_at: string | null;
  vet_consented_at: string | null;
  vet_revoked_at: string | null;
}

export interface ConsentReadinessPayload {
  consent: TeleconsultationConsentSummary | null;
  readiness: RecordingReadinessResult;
  actorParty: 'tutor' | 'vet' | 'observer';
}

const SESSION_COLUMNS =
  'id, appointment_id, organization_id, pet_id, tutor_id, veterinarian_id, room_code, status, recording_consent, started_at, ended_at, notes, created_at, updated_at';

export async function listarSessoesTeleconsulta(): Promise<{
  sessions: TeleconsultationSession[];
  currentUserId: string;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para acessar a sala de teleconsulta.');
    }

    const { data, error } = await supabase
      .from('teleconsultation_sessions')
      .select(SESSION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return {
      sessions: data ?? [],
      currentUserId: authData.user.id,
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível carregar as salas de teleconsulta.',
    );
  }
}

export async function abrirSalaTeleconsulta(
  appointmentId: string,
): Promise<{ session: TeleconsultationSession }> {
  try {
    const response = await fetch('/api/teleconsultation/sessions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    });
    const payload = (await response.json().catch(() => null)) as {
      session?: TeleconsultationSession;
      error?: string;
    } | null;

    if (!response.ok || !payload?.session) {
      throw new Error(
        payload?.error || 'Não foi possível abrir a sala de teleconsulta.',
      );
    }

    return { session: payload.session };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível abrir a sala de teleconsulta.',
    );
  }
}

export async function atualizarSessaoTeleconsulta(input: {
  sessionId: string;
  status?: TeleconsultationStatus;
  notes?: string | null;
}): Promise<{ session: TeleconsultationSession }> {
  try {
    const response = await fetch('/api/teleconsultation/sessions', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.sessionId,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      session?: TeleconsultationSession;
      error?: string;
    } | null;

    if (!response.ok || !payload?.session) {
      throw new Error(
        payload?.error ||
          'Não foi possível atualizar a sessão de teleconsulta.',
      );
    }

    return { session: payload.session };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar a sessão de teleconsulta.',
    );
  }
}

export async function buscarConsentimentoTeleconsulta(
  sessionId: string,
): Promise<ConsentReadinessPayload> {
  try {
    const response = await fetch(
      `/api/teleconsultation/consent?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        credentials: 'same-origin',
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | (ConsentReadinessPayload & { error?: string })
      | null;
    if (!response.ok || !payload?.readiness) {
      throw new Error(
        payload?.error ||
          'Não foi possível verificar o status do consentimento bilateral.',
      );
    }
    return {
      consent: payload.consent ?? null,
      readiness: payload.readiness,
      actorParty: payload.actorParty ?? 'observer',
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível verificar o status do consentimento bilateral.',
    );
  }
}

export async function registrarConsentimentoTeleconsulta(
  sessionId: string,
  granted: boolean,
): Promise<{
  consent: TeleconsultationConsentSummary | null;
  readiness: RecordingReadinessResult;
}> {
  try {
    const response = await fetch('/api/teleconsultation/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, granted }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          consent?: TeleconsultationConsentSummary | null;
          readiness?: RecordingReadinessResult;
          error?: string;
        }
      | null;
    if (!response.ok || !payload?.readiness) {
      throw new Error(
        payload?.error || 'Não foi possível registrar seu consentimento.',
      );
    }
    return {
      consent: payload.consent ?? null,
      readiness: payload.readiness,
    };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível registrar seu consentimento.',
    );
  }
}

export async function listarMensagensTeleconsulta(
  sessionId: string,
): Promise<{ messages: TeleconsultationMessage[] }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('teleconsultation_messages')
      .select('id, session_id, sender_id, sender_name, message, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;
    return { messages: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o chat da sala.');
  }
}

export async function enviarMensagemTeleconsulta(input: {
  sessionId: string;
  message: string;
}): Promise<{ message: TeleconsultationMessage }> {
  try {
    const response = await fetch('/api/teleconsultation/messages', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: input.sessionId,
        message: input.message.trim(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      message?: TeleconsultationMessage;
      error?: string;
    } | null;

    if (!response.ok || !payload?.message) {
      throw new Error(payload?.error || 'Não foi possível enviar a mensagem.');
    }

    return { message: payload.message };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível enviar a mensagem.');
  }
}

export function inscreverMensagensTeleconsulta(
  sessionId: string,
  onInsert: (msg: TeleconsultationMessage) => void,
) {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`teleconsulta-chat-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'teleconsultation_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as TeleconsultationMessage;
        if (row?.id) onInsert(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
