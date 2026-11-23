import { getSupabaseClient } from '@/lib/supabase';
import type { AvailabilitySlot } from '@/types/entities';
import { toFriendlyError } from './errors';

export interface ListAvailabilityParams {
  mine?: boolean;
  organization_id?: string;
}

export interface CreateAvailabilityInput {
  organization_id: string;
  starts_at: string;
  ends_at: string;
}

const AVAILABILITY_COLUMNS =
  'id, organization_id, veterinarian_id, starts_at, ends_at, is_available, is_blocked, blocked_at, block_reason';

export async function listarDisponibilidade(
  params?: ListAvailabilityParams,
): Promise<{ availability: AvailabilitySlot[] }> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('professional_availability')
      .select(AVAILABILITY_COLUMNS)
      .order('starts_at')
      .limit(100);

    if (params?.mine) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error('Faça login para consultar sua disponibilidade.');
      }
      query = query
        .eq('veterinarian_id', authData.user.id)
        .gte('starts_at', new Date().toISOString());

      if (params.organization_id) {
        query = query.eq('organization_id', params.organization_id);
      }
    } else {
      query = query
        .eq('is_available', true)
        .eq('is_blocked', false)
        .gt('starts_at', new Date().toISOString());

      if (params?.organization_id) {
        query = query.eq('organization_id', params.organization_id);
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return { availability: data ?? [] };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os horários.');
  }
}

export async function buscarHorarioPorId(
  id: string,
): Promise<AvailabilitySlot | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('professional_availability')
      .select(AVAILABILITY_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o horário.');
  }
}

export async function criarHorarioDisponivel(
  input: CreateAvailabilityInput,
): Promise<{ slot: AvailabilitySlot }> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para publicar horários.');
    }

    const { data, error } = await supabase
      .from('professional_availability')
      .insert({
        organization_id: input.organization_id,
        veterinarian_id: authData.user.id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
      })
      .select(AVAILABILITY_COLUMNS)
      .single();

    if (error) throw error;
    return { slot: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível criar o horário. Verifique aprovação e sobreposição.',
    );
  }
}

export async function alternarBloqueioHorario(input: {
  id: string;
  is_blocked: boolean;
  block_reason: string | null;
}): Promise<{ slot: AvailabilitySlot }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('set_availability_block', {
      target_availability: input.id,
      should_block: input.is_blocked,
      target_reason: input.is_blocked ? input.block_reason ?? null : null,
    });

    if (error) throw error;
    return { slot: data };
  } catch (error) {
    throw toFriendlyError(
      error,
      'Não foi possível atualizar o bloqueio deste horário.',
    );
  }
}

export async function excluirHorarioDisponivel(id: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('professional_availability')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível excluir o horário.');
  }
}
