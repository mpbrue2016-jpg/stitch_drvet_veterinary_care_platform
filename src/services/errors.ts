type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

export function isSchemaMissingError(error: unknown): boolean {
  const err = (error ?? {}) as SupabaseLikeError;
  const code = (err.code ?? '').toUpperCase();
  const message = (err.message ?? '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    code === '42P01' ||
    code === '42883' ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
}

export function toFriendlyError(error: unknown, fallback: string): Error {
  if (error instanceof Error && !('code' in error)) {
    const lowerMsg = error.message.toLowerCase();
    if (
      lowerMsg.includes('failed to fetch') ||
      lowerMsg.includes('fetch failed') ||
      lowerMsg.includes('networkerror')
    ) {
      return new Error(
        'Falha de conexão com o servidor do Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL e sua conexão de rede.',
      );
    }
    return error;
  }

  const err = (error ?? {}) as SupabaseLikeError;
  const code = (err.code ?? '').toUpperCase();
  const message = err.message ?? '';
  const lower = message.toLowerCase();

  if (code === 'PGRST205' || code === '42P01' || lower.includes('could not find the table')) {
    return new Error(
      'As tabelas do DrVet ainda não foram inicializadas neste projeto Supabase.',
    );
  }
  if (code === 'PGRST202' || code === '42883' || lower.includes('could not find the function')) {
    return new Error(
      'Função SQL (RPC) ausente no Supabase. Verifique se todas as 13 migrations SQL foram aplicadas no banco.',
    );
  }
  if (lower.includes('invalid api key') || lower.includes('no api key found') || lower.includes('secret api key required')) {
    return new Error(
      'Chave de API do Supabase inválida ou ausente. Confira NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local.',
    );
  }
  if (lower.includes('failed to fetch') || lower.includes('fetch failed') || lower.includes('networkerror')) {
    return new Error(
      'Falha de rede ao conectar no Supabase. Confira a URL do projeto e tente novamente.',
    );
  }
  if (code === '42501' || lower.includes('row-level security')) {
    return new Error('Você não tem permissão para realizar esta operação.');
  }
  if (code === '23505') {
    return new Error('Já existe um registro com esses mesmos dados.');
  }
  if (code === '23P01') {
    return new Error(
      'Conflito de horário: este período já está reservado ou bloqueado.',
    );
  }
  if (code === 'P0002') {
    return new Error('O registro solicitado não foi encontrado.');
  }
  if (code === '22023') {
    return new Error(message || 'Os dados informados não atendem às regras da operação.');
  }
  if (code === '55000') {
    return new Error('Este registro já foi finalizado e não pode mais ser alterado.');
  }
  if (lower.includes('jwt') || lower.includes('session')) {
    return new Error('Sua sessão expirou. Faça login novamente para continuar.');
  }

  return new Error(message || fallback);
}
