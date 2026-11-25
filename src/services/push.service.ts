'use client';

import type { PushNotificationItem, PushSubscriptionItem } from '@/types/entities';

export type LeadMinutesOption = 15 | 30 | 60 | 120 | 1440;

export interface PushConfigPayload {
  publicKey: string;
  vapidConfiguredFromEnv: boolean;
  supportPush: boolean;
}

export interface ApiResultWithSchemaFlag {
  schemaMissing?: boolean;
  error?: string;
}

export class PushApiError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'PushApiError';
    this.status = status;
    this.code = code;
  }
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    return existing;
  }
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getCurrentBrowserSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const registration = await registerPushServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeBrowserPush(
  vapidPublicKey: string,
): Promise<{
  subscription: PushSubscription;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
}> {
  if (!isWebPushSupported()) {
    throw new Error('Este navegador não oferece suporte a Web Push Notifications.');
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error(
      'Permissão de notificação negada no navegador. Libere as notificações nas configurações do site.',
    );
  }

  const registration = await registerPushServiceWorker();
  if (!registration) {
    throw new Error('Não foi possível registrar o Service Worker para notificações.');
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });
  }

  const json = subscription.toJSON();
  const p256dh =
    json.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey('p256dh'));
  const authSecret =
    json.keys?.auth || arrayBufferToBase64Url(subscription.getKey('auth'));

  if (!subscription.endpoint || !p256dh || !authSecret) {
    throw new Error('Chaves da inscrição Push retornaram incompletas.');
  }

  return {
    subscription,
    endpoint: subscription.endpoint,
    p256dh,
    auth_secret: authSecret,
  };
}

export async function unsubscribeBrowserPush(): Promise<{ endpoint: string | null }> {
  if (!isWebPushSupported()) return { endpoint: null };
  const subscription = await getCurrentBrowserSubscription();
  if (!subscription) return { endpoint: null };
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return { endpoint };
}

export async function showLocalServiceWorkerNotification(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active ?? navigator.serviceWorker.controller;
      if (worker) {
        worker.postMessage({
          type: 'SHOW_LOCAL_NOTIFICATION',
          title: payload.title,
          body: payload.body,
          url: payload.url ?? '/notificacoes',
          tag: payload.tag ?? `drvet-${Date.now()}`,
        });
        return true;
      }
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag ?? `drvet-${Date.now()}`,
        data: { url: payload.url ?? '/notificacoes' },
      });
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      tag: payload.tag,
    });
    return true;
  } catch {
    return false;
  }
}

async function parseJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;

  if (!response.ok) {
    throw new PushApiError(
      payload.error || fallbackError,
      response.status,
      payload.code,
    );
  }
  return payload;
}

export async function fetchPushConfig(): Promise<PushConfigPayload> {
  const res = await fetch('/api/push/config', { cache: 'no-store' });
  return parseJsonResponse<PushConfigPayload>(
    res,
    'Não foi possível carregar a configuração VAPID.',
  );
}

export async function fetchPushSubscriptions(): Promise<{
  subscriptions: PushSubscriptionItem[];
  schemaMissing: boolean;
}> {
  const res = await fetch('/api/push/subscriptions', { cache: 'no-store' });
  const payload = (await res.json().catch(() => ({}))) as {
    subscriptions?: PushSubscriptionItem[];
    code?: string;
    error?: string;
  };

  if (res.status === 503 && payload.code === 'SCHEMA_MISSING') {
    return { subscriptions: [], schemaMissing: true };
  }
  if (!res.ok) {
    throw new PushApiError(
      payload.error || 'Não foi possível carregar as inscrições Push.',
      res.status,
      payload.code,
    );
  }
  return {
    subscriptions: payload.subscriptions ?? [],
    schemaMissing: false,
  };
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  reminder_lead_minutes?: LeadMinutesOption;
  notify_appointments?: boolean;
  notify_queue?: boolean;
}): Promise<PushSubscriptionItem> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await parseJsonResponse<{ subscription: PushSubscriptionItem }>(
    res,
    'Não foi possível salvar a inscrição Push.',
  );
  return payload.subscription;
}

export async function updatePushPreferences(input: {
  id?: string;
  reminder_lead_minutes?: LeadMinutesOption;
  notify_appointments?: boolean;
  notify_queue?: boolean;
  is_active?: boolean;
}): Promise<PushSubscriptionItem[]> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await parseJsonResponse<{ subscriptions: PushSubscriptionItem[] }>(
    res,
    'Não foi possível atualizar as preferências de notificação.',
  );
  return payload.subscriptions ?? [];
}

export async function deletePushSubscription(input: {
  endpoint?: string;
  id?: string;
}): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await parseJsonResponse<{ removed: boolean }>(
    res,
    'Não foi possível remover a inscrição Push.',
  );
}

export interface NotificationOutboxSummary {
  schemaReady: boolean;
  queued: number;
  sent: number;
  failed: number;
}

export async function fetchNotifications(sync = true): Promise<{
  notifications: PushNotificationItem[];
  unreadCount: number;
  schemaMissing: boolean;
  outboxSummary: NotificationOutboxSummary | null;
}> {
  const res = await fetch(`/api/push/notifications?sync=${sync ? '1' : '0'}`, {
    cache: 'no-store',
  });
  const payload = (await res.json().catch(() => ({}))) as {
    notifications?: PushNotificationItem[];
    unreadCount?: number;
    outboxSummary?: NotificationOutboxSummary;
    code?: string;
    error?: string;
  };

  if (res.status === 503 && payload.code === 'SCHEMA_MISSING') {
    return {
      notifications: [],
      unreadCount: 0,
      schemaMissing: true,
      outboxSummary: null,
    };
  }
  if (!res.ok) {
    throw new PushApiError(
      payload.error || 'Não foi possível carregar as notificações.',
      res.status,
      payload.code,
    );
  }
  return {
    notifications: payload.notifications ?? [],
    unreadCount: payload.unreadCount ?? 0,
    schemaMissing: false,
    outboxSummary: payload.outboxSummary ?? null,
  };
}

export async function markNotificationRead(input: {
  id?: string;
  markAll?: boolean;
}): Promise<void> {
  const res = await fetch('/api/push/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await parseJsonResponse<{ updatedCount: number }>(
    res,
    'Não foi possível atualizar a notificação.',
  );
}

export async function sendTestPushNotification(
  audience: 'tutor' | 'veterinarian',
): Promise<{
  notification: PushNotificationItem;
  dispatch: { attempted: number; delivered: number; failed: number };
}> {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience }),
  });
  return parseJsonResponse<{
    notification: PushNotificationItem;
    dispatch: { attempted: number; delivered: number; failed: number };
  }>(res, 'Não foi possível disparar a notificação de teste.');
}
