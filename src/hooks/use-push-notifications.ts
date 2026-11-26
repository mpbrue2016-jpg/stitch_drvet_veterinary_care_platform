'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  deletePushSubscription,
  fetchNotifications,
  fetchPushConfig,
  fetchPushSubscriptions,
  getCurrentBrowserSubscription,
  isWebPushSupported,
  markNotificationRead,
  PushApiError,
  registerPushServiceWorker,
  savePushSubscription,
  sendTestPushNotification,
  showLocalServiceWorkerNotification,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  updatePushPreferences,
  type LeadMinutesOption,
  type NotificationOutboxSummary,
} from '@/services/push.service';
import type { PushNotificationItem, PushSubscriptionItem } from '@/types/entities';

export interface PushPreferencesState {
  reminderLeadMinutes: LeadMinutesOption;
  notifyAppointments: boolean;
  notifyQueue: boolean;
}

const DEFAULT_PREFERENCES: PushPreferencesState = {
  reminderLeadMinutes: 30,
  notifyAppointments: true,
  notifyQueue: true,
};

function normalizeLeadMinutes(value: number | undefined): LeadMinutesOption {
  if (
    value === 15 ||
    value === 30 ||
    value === 60 ||
    value === 120 ||
    value === 1440
  ) {
    return value;
  }
  return 30;
}

export function usePushNotifications() {
  const configured = isSupabaseConfigured();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [userId, setUserId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [vapidConfiguredFromEnv, setVapidConfiguredFromEnv] = useState(false);
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionItem[]>([]);
  const [notifications, setNotifications] = useState<PushNotificationItem[]>([]);
  const [outboxSummary, setOutboxSummary] =
    useState<NotificationOutboxSummary | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const shownLocalTagsRef = useRef<Set<string>>(new Set());

  const currentSubscription = useMemo(() => {
    if (!subscriptions.length) return null;
    if (browserEndpoint) {
      const matched = subscriptions.find(
        (item) => item.endpoint === browserEndpoint,
      );
      if (matched) return matched;
    }
    return subscriptions.find((item) => item.is_active) ?? subscriptions[0];
  }, [browserEndpoint, subscriptions]);

  const preferences = useMemo<PushPreferencesState>(() => {
    if (!currentSubscription) return DEFAULT_PREFERENCES;
    return {
      reminderLeadMinutes: normalizeLeadMinutes(
        currentSubscription.reminder_lead_minutes,
      ),
      notifyAppointments: currentSubscription.notify_appointments,
      notifyQueue: currentSubscription.notify_queue,
    };
  }, [currentSubscription]);

  const isPushEnabledOnThisDevice = Boolean(
    permission === 'granted' &&
      browserEndpoint &&
      subscriptions.some(
        (item) => item.endpoint === browserEndpoint && item.is_active,
      ),
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at).length,
    [notifications],
  );

  const refresh = useCallback(
    async (syncReminders = true) => {
      if (!configured) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id ?? null;
        setUserId(uid);
        setAuthenticated(Boolean(uid));

        const config = await fetchPushConfig().catch(() => null);
        if (config) {
          setVapidPublicKey(config.publicKey);
          setVapidConfiguredFromEnv(config.vapidConfiguredFromEnv);
        }

        if (!uid) {
          setSubscriptions([]);
          setNotifications([]);
          setLoading(false);
          return;
        }

        const [subsResult, notifResult, browserSub] = await Promise.all([
          fetchPushSubscriptions(),
          fetchNotifications(syncReminders),
          getCurrentBrowserSubscription().catch(() => null),
        ]);

        setBrowserEndpoint(browserSub?.endpoint ?? null);
        setSubscriptions(subsResult.subscriptions);
        setNotifications(notifResult.notifications);
        setOutboxSummary(notifResult.outboxSummary);
        setSchemaMissing(subsResult.schemaMissing || notifResult.schemaMissing);
      } catch (error) {
        if (error instanceof PushApiError && error.code === 'SCHEMA_MISSING') {
          setSchemaMissing(true);
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar o sistema de notificações.',
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [configured],
  );

  useEffect(() => {
    const pushOk = isWebPushSupported();
    setSupported(pushOk);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
    if (pushOk) {
      void registerPushServiceWorker().catch(() => null);
    }
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!configured || !userId || schemaMissing) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`drvet-push-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const item = payload.new as PushNotificationItem;
          setNotifications((current) => {
            if (current.some((existing) => existing.id === item.id)) {
              return current;
            }
            return [item, ...current].slice(0, 50);
          });

          const tag = `realtime-${item.id}`;
          if (!shownLocalTagsRef.current.has(tag)) {
            shownLocalTagsRef.current.add(tag);
            const allowByKind =
              item.kind === 'vet_queue_new' ||
              item.kind === 'vet_agenda_reminder' ||
              item.kind === 'vet_agenda_summary'
                ? preferences.notifyQueue
                : item.kind === 'appointment_reminder' ||
                    item.kind === 'appointment_confirmed' ||
                    item.kind === 'appointment_cancelled'
                  ? preferences.notifyAppointments
                  : true;
            if (allowByKind) {
              void showLocalServiceWorkerNotification({
                title: item.title,
                body: item.body,
                url: item.action_url,
                tag,
              });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as PushNotificationItem;
          setNotifications((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: `veterinarian_id=eq.${userId}`,
        },
        () => {
          void fetchNotifications(false)
            .then((result) => {
              if (!result.schemaMissing) {
                setNotifications(result.notifications);
              }
            })
            .catch(() => null);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `tutor_id=eq.${userId}`,
        },
        () => {
          void fetchNotifications(false)
            .then((result) => {
              if (!result.schemaMissing) {
                setNotifications(result.notifications);
              }
            })
            .catch(() => null);
        },
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [
    configured,
    preferences.notifyAppointments,
    preferences.notifyQueue,
    refresh,
    schemaMissing,
    userId,
  ]);

  const enablePush = useCallback(
    async (customPrefs?: Partial<PushPreferencesState>) => {
      setBusy(true);
      setErrorMessage('');
      setNotice('');
      try {
        let publicKey = vapidPublicKey;
        if (!publicKey) {
          const cfg = await fetchPushConfig();
          publicKey = cfg.publicKey;
          setVapidPublicKey(cfg.publicKey);
          setVapidConfiguredFromEnv(cfg.vapidConfiguredFromEnv);
        }

        const sub = await subscribeBrowserPush(publicKey);
        setPermission(Notification.permission);
        setBrowserEndpoint(sub.endpoint);

        const saved = await savePushSubscription({
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth_secret: sub.auth_secret,
          reminder_lead_minutes:
            customPrefs?.reminderLeadMinutes ?? preferences.reminderLeadMinutes,
          notify_appointments:
            customPrefs?.notifyAppointments ?? preferences.notifyAppointments,
          notify_queue: customPrefs?.notifyQueue ?? preferences.notifyQueue,
        });

        setSubscriptions((current) => {
          const others = current.filter((item) => item.endpoint !== saved.endpoint);
          return [saved, ...others];
        });
        setSchemaMissing(false);
        setNotice('Notificações Push ativadas neste dispositivo.');

        await showLocalServiceWorkerNotification({
          title: 'DrVet: Alertas ativados neste dispositivo',
          body: 'Você receberá avisos de consultas marcadas e movimentações da fila veterinária.',
          url: '/notificacoes',
          tag: 'drvet-push-activated',
        });
      } catch (error) {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPermission(Notification.permission);
        }
        if (error instanceof PushApiError && error.code === 'SCHEMA_MISSING') {
          setSchemaMissing(true);
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível ativar as notificações Push.',
        );
      } finally {
        setBusy(false);
      }
    },
    [
      preferences.notifyAppointments,
      preferences.notifyQueue,
      preferences.reminderLeadMinutes,
      vapidPublicKey,
    ],
  );

  const disablePush = useCallback(async () => {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { endpoint } = await unsubscribeBrowserPush();
      const targetEndpoint = endpoint ?? browserEndpoint ?? undefined;
      if (targetEndpoint) {
        await deletePushSubscription({ endpoint: targetEndpoint }).catch(() => null);
        setSubscriptions((current) =>
          current.filter((item) => item.endpoint !== targetEndpoint),
        );
      } else if (currentSubscription) {
        await deletePushSubscription({ id: currentSubscription.id });
        setSubscriptions((current) =>
          current.filter((item) => item.id !== currentSubscription.id),
        );
      }
      setBrowserEndpoint(null);
      setNotice('Inscrição Push desativada neste navegador.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível desativar as notificações Push.',
      );
    } finally {
      setBusy(false);
    }
  }, [browserEndpoint, currentSubscription]);

  const updatePreferences = useCallback(
    async (patch: Partial<PushPreferencesState & { isActive: boolean }>) => {
      setBusy(true);
      setErrorMessage('');
      setNotice('');
      try {
        const updatedList = await updatePushPreferences({
          id: currentSubscription?.id,
          reminder_lead_minutes: patch.reminderLeadMinutes,
          notify_appointments: patch.notifyAppointments,
          notify_queue: patch.notifyQueue,
          is_active: patch.isActive,
        });
        if (updatedList.length > 0) {
          setSubscriptions((current) => {
            const map = new Map(current.map((item) => [item.id, item]));
            updatedList.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          });
        }
        setNotice('Preferências de alerta salvas.');
      } catch (error) {
        if (error instanceof PushApiError && error.code === 'SCHEMA_MISSING') {
          setSchemaMissing(true);
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar as preferências.',
        );
      } finally {
        setBusy(false);
      }
    },
    [currentSubscription?.id],
  );

  const sendTestPush = useCallback(
    async (audience: 'tutor' | 'veterinarian') => {
      setBusy(true);
      setErrorMessage('');
      setNotice('');
      try {
        const result = await sendTestPushNotification(audience);
        setNotifications((current) => [
          result.notification,
          ...current.filter((item) => item.id !== result.notification.id),
        ]);

        if (result.dispatch.delivered > 0) {
          setNotice(
            `Push criptografado enviado para ${result.dispatch.delivered} dispositivo(s).`,
          );
        } else {
          const shownLocally = await showLocalServiceWorkerNotification({
            title: result.notification.title,
            body: result.notification.body,
            url: result.notification.action_url,
            tag: `test-${result.notification.id}`,
          });
          setNotice(
            shownLocally
              ? 'Notificação registrada e exibida pelo Service Worker local.'
              : 'Notificação registrada na central. Ative a permissão Push do navegador para receber banners nativos.',
          );
        }
      } catch (error) {
        if (error instanceof PushApiError && error.code === 'SCHEMA_MISSING') {
          setSchemaMissing(true);
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível disparar a notificação de teste.',
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const markAsRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead({ id });
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: now } : item)),
      );
    } catch {
      // non-blocking UI update
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markNotificationRead({ markAll: true });
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.read_at ? item : { ...item, read_at: now })),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível marcar todas como lidas.',
      );
    }
  }, []);

  const clearFeedback = useCallback(() => {
    setNotice('');
    setErrorMessage('');
  }, []);

  return {
    configured,
    supported,
    permission,
    authenticated,
    userId,
    vapidPublicKey,
    vapidConfiguredFromEnv,
    subscriptions,
    currentSubscription,
    notifications,
    outboxSummary,
    unreadCount,
    preferences,
    isPushEnabledOnThisDevice,
    schemaMissing,
    loading,
    busy,
    notice,
    errorMessage,
    clearFeedback,
    refresh,
    enablePush,
    disablePush,
    updatePreferences,
    sendTestPush,
    markAsRead,
    markAllRead,
  };
}
