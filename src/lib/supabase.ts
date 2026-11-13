import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  '';

export const isSupabaseEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Cliente Supabase preparado para integração no Google AI Studio.
 * Não deve ser chamado diretamente nas telas — utilize `src/services/*`.
 */
// TODO(AI Studio): substituir os retornos mock de src/services/* por chamadas usando este cliente.
export function getSupabaseClient() {
  if (!isSupabaseEnvConfigured) {
    throw new Error(
      'Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas.',
    );
  }
  return createBrowserClient<Database, 'public'>(supabaseUrl, supabaseAnonKey);
}
