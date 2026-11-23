import { getSupabaseClient } from '@/lib/supabase';
import type {
  TeleconsultationMessage,
  TeleconsultationSession,
  TeleconsultationStatus,
} from '@/types/entities';
import { toFriendlyError } from './errors';

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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('open_teleconsultation_session', {
      target_appointment: appointmentId,
    });
    if (error) throw error;
    return { session: data };
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
  recording_consent?: boolean;
  notes?: string | null;
}): Promise<{ session: TeleconsultationSession }> {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const patch: {
      status?: TeleconsultationStatus;
      recording_consent?: boolean;
      notes?: string | null;
      started_at?: string | null;
      ended_at?: string | null;
    } = {};

    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === 'in_progress') patch.started_at = now;
      if (input.status === 'ended') patch.ended_at = now;
    }
    if (input.recording_consent !== undefined) {
      patch.recording_consent = input.recording_consent;
    }
    if (input.notes !== undefined) {
      patch.notes = input.notes?.trim() || null;
    }

    const { data, error } = await supabase
      .from('teleconsultation_sessions')
      .update(patch)
      .eq('id', input.sessionId)
      .select(SESSION_COLUMNS)
      .single();

    if (error) throw error;
    return { session: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar a sessão de teleconsulta.',
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
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para enviar mensagens na sala.');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authData.user.id)
      .maybeSingle();

    const senderName =
      profile?.display_name ||
      String(authData.user.user_metadata?.display_name ?? '') ||
      authData.user.email ||
      'Participante';

    const { data, error } = await supabase
      .from('teleconsultation_messages')
      .insert({
        session_id: input.sessionId,
        sender_id: authData.user.id,
        sender_name: senderName,
        message: input.message.trim(),
      })
      .select('id, session_id, sender_id, sender_name, message, created_at')
      .single();

    if (error) throw error;
    return { message: data };
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
