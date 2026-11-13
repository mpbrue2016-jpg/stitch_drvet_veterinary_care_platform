type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

export function toFriendlyError(error: unknown, fallback: string): Error {
  if (error instanceof Error && !('code' in error)) {
    return error;
  }

  const err = (error ?? {}) as SupabaseLikeError;
  const code = err.code ?? '';
  const message = err.message ?? '';

  if (code === '42501' || message.toLowerCase().includes('row-level security')) {
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
  if (message.toLowerCase().includes('jwt') || message.toLowerCase().includes('session')) {
    return new Error('Sua sessão expirou. Faça login novamente para continuar.');
  }

  return new Error(message || fallback);
}
