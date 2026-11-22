import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendNotification } from 'web-push';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import type { Database } from '@/types/database';
import { getServerVapidConfig } from './vapid';

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface DispatchSummary {
  attempted: number;
  delivered: number;
  deactivated: number;
}

function isSafePushEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function dispatchWebPushForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: WebPushPayload,
  filterType?: 'appointments' | 'queue',
): Promise<DispatchSummary> {
  getServerVapidConfig();

  let query = supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret, notify_appointments, notify_queue')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (filterType === 'appointments') {
    query = query.eq('notify_appointments', true);
  } else if (filterType === 'queue') {
    query = query.eq('notify_queue', true);
  }

  const { data: subscriptions, error } = await query;
  if (error || !subscriptions || subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, deactivated: 0 };
  }

  let delivered = 0;
  let deactivated = 0;
  const serialized = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url.startsWith('/') ? payload.url : '/agendamento',
    tag: payload.tag ?? 'drvet-notification',
  });

  for (const sub of subscriptions) {
    if (!isSafePushEndpoint(sub.endpoint)) continue;
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_secret,
          },
        },
        serialized,
        { TTL: 3600 },
      );
      delivered += 1;
      await supabase
        .from('push_subscriptions')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (pushError: unknown) {
      const statusCode =
        typeof pushError === 'object' &&
        pushError !== null &&
        'statusCode' in pushError
          ? Number((pushError as { statusCode?: number }).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        deactivated += 1;
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', sub.id);
      }
    }
  }

  return {
    attempted: subscriptions.length,
    delivered,
    deactivated,
  };
}

export async function dispatchBackgroundPushWithServiceRole(
  userId: string,
  payload: WebPushPayload,
  filterType?: 'appointments' | 'queue',
): Promise<DispatchSummary> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return { attempted: 0, delivered: 0, deactivated: 0 };
  }

  const { url } = getSupabasePublicConfig();
  if (!url) {
    return { attempted: 0, delivered: 0, deactivated: 0 };
  }

  const adminClient = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return dispatchWebPushForUser(adminClient, userId, payload, filterType);
}
