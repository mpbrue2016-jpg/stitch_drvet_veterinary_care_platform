import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabasePublicConfig, isSupabaseConfigured } from '@/lib/supabase/config';
import type { Database } from '@/types/database';

const webhookPayloadSchema = z.object({
  orderId: z.string().uuid(),
  externalReference: z.string().trim().max(80).nullable().optional(),
});

function verifyWebhookSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  }

  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
  const providedSecret = request.headers.get('x-webhook-secret')?.trim() ?? '';

  if (!expectedSecret || !verifyWebhookSecret(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: 'Assinatura de webhook inválida.' }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'Chave de serviço do servidor não configurada.' },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = webhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload de webhook inválido.' }, { status: 400 });
  }

  const { url } = getSupabasePublicConfig();
  const adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error } = await adminClient.rpc('settle_payment_order', {
    target_order_id: parsed.data.orderId,
    target_reference: parsed.data.externalReference ?? null,
  });

  if (error) {
    const status = error.code === 'P0002' ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ settled: order });
}
