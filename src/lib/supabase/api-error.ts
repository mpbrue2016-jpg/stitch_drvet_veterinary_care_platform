import { NextResponse } from 'next/server';
import { isSchemaMissingError, toFriendlyError } from '@/services/errors';

export function supabaseErrorResponse(
  error: unknown,
  fallbackMessage: string,
  status = 500,
) {
  if (isSchemaMissingError(error)) {
    const friendly = toFriendlyError(error, fallbackMessage);
    return NextResponse.json(
      {
        error: friendly.message,
        code: 'SCHEMA_MISSING',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: fallbackMessage }, { status });
}
