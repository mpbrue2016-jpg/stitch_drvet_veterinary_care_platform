import { NextResponse } from 'next/server';
import { getPublicVapidInfo } from '@/lib/push/vapid';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getPublicVapidInfo());
}
