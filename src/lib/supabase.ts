import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  '';

export const isSupabaseEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: SupabaseClient<Database, 'public'> | null = null;

/**
 * Cliente Supabase singleton para uso exclusivo na camada `src/services/*`.
 */
export function getSupabaseClient(): SupabaseClient<Database, 'public'> {
  if (!isSupabaseEnvConfigured) {
    throw new Error(
      'Configuração do Supabase ausente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.',
    );
  }
  if (!browserClient) {
    browserClient = createBrowserClient<Database, 'public'>(
      supabaseUrl,
      supabaseAnonKey,
    ) as unknown as SupabaseClient<Database, 'public'>;
  }
  return browserClient;
}
