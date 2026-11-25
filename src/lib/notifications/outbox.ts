import { createClient } from '@supabase/supabase-js';
import {
  sanitizeAuditMetadata,
  type AuditLogInput,
} from '@/lib/logging/audit';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { isSchemaMissingError } from '@/services/errors';
import type { Database } from '@/types/database';

function getServiceRoleClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const { url } = getSupabasePublicConfig();
  if (!serviceKey || !url) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function persistServerAuditLog(
  input: AuditLogInput,
): Promise<{ persisted: boolean; skippedReason?: string }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { persisted: false, skippedReason: 'service_role_missing' };
  }

  try {
    const { error } = await adminClient.from('audit_logs').insert({
      actor_id: input.actorId ?? null,
      event: input.event,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome,
      status_code: input.statusCode ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
    });

    if (error) {
      return {
        persisted: false,
        skippedReason: isSchemaMissingError(error) ? 'schema_missing' : error.code,
      };
    }

    return { persisted: true };
  } catch {
    return { persisted: false, skippedReason: 'unexpected_error' };
  }
}

export async function recordAppointmentNotificationOutbox(params: {
  recipientUserId: string;
  event: 'created' | 'confirmed' | 'cancelled';
  pushAttempted: number;
  pushDelivered: number;
}): Promise<{ recordedCount: number; schemaMissing: boolean }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { recordedCount: 0, schemaMissing: false };
  }

  const templateKey = `appointment_${params.event}`;
  const nowIso = new Date().toISOString();
  const rows: Database['public']['Tables']['notification_outbox']['Insert'][] = [
    {
      recipient_user_id: params.recipientUserId,
      channel: 'email',
      template_key: templateKey,
      status: 'queued',
      attempts: 0,
      scheduled_for: nowIso,
    },
  ];

  if (params.pushAttempted > 0) {
    rows.push({
      recipient_user_id: params.recipientUserId,
      channel: 'push',
      template_key: templateKey,
      status: params.pushDelivered > 0 ? 'sent' : 'failed',
      attempts: 1,
      scheduled_for: nowIso,
      sent_at: params.pushDelivered > 0 ? nowIso : null,
      last_error:
        params.pushDelivered > 0
          ? null
          : 'Nenhum dispositivo Web Push ativo recebeu a entrega.',
    });
  }

  try {
    const { data, error } = await adminClient
      .from('notification_outbox')
      .insert(rows)
      .select('id');

    if (error) {
      return {
        recordedCount: 0,
        schemaMissing: isSchemaMissingError(error),
      };
    }

    return {
      recordedCount: data?.length ?? rows.length,
      schemaMissing: false,
    };
  } catch {
    return { recordedCount: 0, schemaMissing: false };
  }
}

export async function recordPrescriptionNotificationOutbox(params: {
  recipientUserId: string;
}): Promise<{ recordedCount: number; schemaMissing: boolean }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { recordedCount: 0, schemaMissing: false };
  }

  try {
    const { data, error } = await adminClient
      .from('notification_outbox')
      .insert({
        recipient_user_id: params.recipientUserId,
        channel: 'email',
        template_key: 'prescription_issued',
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString(),
      })
      .select('id');

    if (error) {
      return {
        recordedCount: 0,
        schemaMissing: isSchemaMissingError(error),
      };
    }

    return {
      recordedCount: data?.length ?? 1,
      schemaMissing: false,
    };
  } catch {
    return { recordedCount: 0, schemaMissing: false };
  }
}

export async function recordRoleApplicationNotificationOutbox(params: {
  recipientUserId: string;
  approved: boolean;
}): Promise<{ recordedCount: number; schemaMissing: boolean }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { recordedCount: 0, schemaMissing: false };
  }

  try {
    const { data, error } = await adminClient
      .from('notification_outbox')
      .insert({
        recipient_user_id: params.recipientUserId,
        channel: 'email',
        template_key: params.approved
          ? 'role_application_approved'
          : 'role_application_rejected',
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString(),
      })
      .select('id');

    if (error) {
      return {
        recordedCount: 0,
        schemaMissing: isSchemaMissingError(error),
      };
    }

    return {
      recordedCount: data?.length ?? 1,
      schemaMissing: false,
    };
  } catch {
    return { recordedCount: 0, schemaMissing: false };
  }
}

export async function recordRoleApplicationSubmittedOutbox(params: {
  recipientUserId: string;
}): Promise<{ recordedCount: number; schemaMissing: boolean }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { recordedCount: 0, schemaMissing: false };
  }

  try {
    const { data, error } = await adminClient
      .from('notification_outbox')
      .insert({
        recipient_user_id: params.recipientUserId,
        channel: 'email',
        template_key: 'role_application_submitted',
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString(),
      })
      .select('id');

    if (error) {
      return {
        recordedCount: 0,
        schemaMissing: isSchemaMissingError(error),
      };
    }

    return {
      recordedCount: data?.length ?? 1,
      schemaMissing: false,
    };
  } catch {
    return { recordedCount: 0, schemaMissing: false };
  }
}

export async function recordSubscriptionNotificationOutbox(params: {
  recipientUserId: string;
  event: 'created' | 'status_updated';
}): Promise<{ recordedCount: number; schemaMissing: boolean }> {
  const adminClient = getServiceRoleClient();
  if (!adminClient) {
    return { recordedCount: 0, schemaMissing: false };
  }

  try {
    const { data, error } = await adminClient
      .from('notification_outbox')
      .insert({
        recipient_user_id: params.recipientUserId,
        channel: 'email',
        template_key:
          params.event === 'created'
            ? 'subscription_created'
            : 'subscription_status_updated',
        status: 'queued',
        attempts: 0,
        scheduled_for: new Date().toISOString(),
      })
      .select('id');

    if (error) {
      return {
        recordedCount: 0,
        schemaMissing: isSchemaMissingError(error),
      };
    }

    return {
      recordedCount: data?.length ?? 1,
      schemaMissing: false,
    };
  } catch {
    return { recordedCount: 0, schemaMissing: false };
  }
}

