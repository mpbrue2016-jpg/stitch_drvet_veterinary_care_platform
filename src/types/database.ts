export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type UserRole = 'tutor' | 'veterinarian' | 'partner' | 'admin';
export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'veterinarian'
  | 'staff'
  | 'billing';
export type ProfessionalStatus = 'pending' | 'approved' | 'suspended';
export type AppointmentKind = 'teleconsultation' | 'in_person';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed';
export type ClinicalRecordStatus = 'draft' | 'finalized';
export type ExamModality = 'laboratory' | 'imaging';
export type ExamOrderStatus = 'requested' | 'resulted';
export type CommissionOrigin =
  | 'teleconsultation'
  | 'in_person'
  | 'pharmacy_split'
  | 'partner_plan';
export type CommissionStatus = 'available' | 'pending' | 'paid';
export type AnticipationStatus = 'requested' | 'approved' | 'paid' | 'rejected';
export type TeleconsultationStatus = 'waiting' | 'in_progress' | 'ended';
export type SubscriptionInterval = 'monthly' | 'annual';
export type PetSubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type PaymentKind = 'teleconsultation' | 'subscription' | 'pharmacy';
export type PaymentMethod = 'pix' | 'credit_card' | 'voucher';
export type PaymentOrderStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';
export type PartnerKind = 'pet_shop' | 'pharmacy';
export type AdPlacement = 'home_banner' | 'booking_sidebar' | 'partner_coupon';
export type AdCampaignStatus = 'draft' | 'active' | 'paused' | 'ended';
export type IntegrationProvider = 'asaas' | 'mercado_pago' | 'livekit' | 'bling' | 'omie';
export type IntegrationEnvironment = 'sandbox' | 'production';
export type NotificationKind =
  | 'appointment_reminder'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'vet_queue_new'
  | 'system_test';

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          display_name: string;
          email: string | null;
          phone: string | null;
          role: UserRole;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          display_name?: string;
          email?: string | null;
          phone?: string | null;
          role?: UserRole;
          avatar_path?: string | null;
        }
      >;
      organizations: Table<
        {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        },
        {
          name: string;
          created_by: string;
          id?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      organization_memberships: Table<
        {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
          updated_at: string;
        },
        {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at?: string;
          updated_at?: string;
        }
      >;
      veterinarian_profiles: Table<
        {
          user_id: string;
          organization_id: string;
          registration_number: string;
          registration_region: string;
          specialty: string | null;
          status: ProfessionalStatus;
          consultation_fee_cents: number;
          bio: string | null;
          is_online_now: boolean;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          organization_id: string;
          registration_number: string;
          registration_region: string;
          specialty?: string | null;
          status?: ProfessionalStatus;
          consultation_fee_cents?: number;
          bio?: string | null;
          is_online_now?: boolean;
          avatar_path?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      pets: Table<
        {
          id: string;
          owner_id: string;
          name: string;
          species: string;
          breed: string | null;
          birth_date: string | null;
          sex: 'female' | 'male' | 'unknown' | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          owner_id: string;
          name: string;
          species: string;
          breed?: string | null;
          birth_date?: string | null;
          sex?: 'female' | 'male' | 'unknown' | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      professional_availability: Table<
        {
          id: string;
          organization_id: string;
          veterinarian_id: string;
          starts_at: string;
          ends_at: string;
          is_available: boolean;
          is_blocked: boolean;
          blocked_at: string | null;
          block_reason: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          veterinarian_id: string;
          starts_at: string;
          ends_at: string;
          is_available?: boolean;
          is_blocked?: boolean;
          blocked_at?: string | null;
          block_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      appointments: Table<
        {
          id: string;
          availability_id: string;
          organization_id: string;
          pet_id: string;
          tutor_id: string;
          veterinarian_id: string;
          kind: AppointmentKind;
          status: AppointmentStatus;
          reason: string | null;
          starts_at: string;
          ends_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          availability_id: string;
          organization_id: string;
          pet_id: string;
          tutor_id: string;
          veterinarian_id: string;
          kind: AppointmentKind;
          status?: AppointmentStatus;
          reason?: string | null;
          starts_at: string;
          ends_at: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      clinical_records: Table<
        {
          id: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          subjective: string;
          objective: string;
          assessment: string;
          plan: string;
          vitals: Json;
          status: ClinicalRecordStatus;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          subjective?: string;
          objective?: string;
          assessment?: string;
          plan?: string;
          vitals?: Json;
          status?: ClinicalRecordStatus;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      vaccination_records: Table<
        {
          id: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          vaccine_name: string;
          administered_on: string;
          batch_number: string | null;
          manufacturer: string | null;
          next_due_on: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          vaccine_name: string;
          administered_on: string;
          batch_number?: string | null;
          manufacturer?: string | null;
          next_due_on?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      exam_orders: Table<
        {
          id: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          modality: ExamModality;
          exam_name: string;
          clinical_indication: string;
          instructions: string | null;
          status: ExamOrderStatus;
          result_summary: string | null;
          laboratory_name: string | null;
          performed_at: string | null;
          requested_at: string;
          resulted_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          modality: ExamModality;
          exam_name: string;
          clinical_indication: string;
          instructions?: string | null;
          status?: ExamOrderStatus;
          result_summary?: string | null;
          laboratory_name?: string | null;
          performed_at?: string | null;
          requested_at?: string;
          resulted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      prescription_drafts: Table<
        {
          id: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          items: Json;
          status: 'draft' | 'issued';
          issued_at: string | null;
          verification_code: string | null;
          updated_by: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          veterinarian_id: string;
          items: Json;
          status?: 'draft' | 'issued';
          issued_at?: string | null;
          verification_code?: string | null;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      payout_accounts: Table<
        {
          id: string;
          organization_id: string;
          veterinarian_id: string;
          provider: string;
          provider_connected: boolean;
          payout_account_label: string;
          pix_key_masked: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          veterinarian_id: string;
          provider?: string;
          provider_connected?: boolean;
          payout_account_label: string;
          pix_key_masked?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      commission_ledger: Table<
        {
          id: string;
          organization_id: string;
          veterinarian_id: string;
          appointment_id: string | null;
          reference: string;
          tutor_name: string;
          pet_name: string;
          origin: CommissionOrigin;
          gross_amount_cents: number;
          net_amount_cents: number;
          status: CommissionStatus;
          occurred_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          veterinarian_id: string;
          appointment_id?: string | null;
          reference: string;
          tutor_name: string;
          pet_name: string;
          origin: CommissionOrigin;
          gross_amount_cents: number;
          net_amount_cents: number;
          status?: CommissionStatus;
          occurred_at?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      anticipation_requests: Table<
        {
          id: string;
          organization_id: string;
          veterinarian_id: string;
          protocol: string;
          requested_cents: number;
          notes: string | null;
          status: AnticipationStatus;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          veterinarian_id: string;
          protocol: string;
          requested_cents: number;
          notes?: string | null;
          status?: AnticipationStatus;
          created_at?: string;
          updated_at?: string;
        }
      >;
      teleconsultation_sessions: Table<
        {
          id: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          tutor_id: string;
          veterinarian_id: string;
          room_code: string;
          status: TeleconsultationStatus;
          recording_consent: boolean;
          started_at: string | null;
          ended_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          appointment_id: string;
          organization_id: string;
          pet_id: string;
          tutor_id: string;
          veterinarian_id: string;
          room_code: string;
          status?: TeleconsultationStatus;
          recording_consent?: boolean;
          started_at?: string | null;
          ended_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      teleconsultation_messages: Table<
        {
          id: string;
          session_id: string;
          sender_id: string;
          sender_name: string;
          message: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          session_id: string;
          sender_id: string;
          sender_name: string;
          message: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      subscription_plans: Table<
        {
          id: string;
          slug: string;
          name: string;
          description: string;
          price_cents: number;
          interval: SubscriptionInterval;
          discount_percent: number;
          benefits: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          slug: string;
          name: string;
          description: string;
          price_cents: number;
          interval?: SubscriptionInterval;
          discount_percent?: number;
          benefits?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      pet_subscriptions: Table<
        {
          id: string;
          plan_id: string;
          pet_id: string;
          owner_id: string;
          status: PetSubscriptionStatus;
          discount_percent: number;
          started_at: string;
          next_billing_at: string;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          plan_id: string;
          pet_id: string;
          owner_id: string;
          status?: PetSubscriptionStatus;
          discount_percent?: number;
          started_at?: string;
          next_billing_at?: string;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      payment_orders: Table<
        {
          id: string;
          user_id: string;
          organization_id: string | null;
          appointment_id: string | null;
          subscription_id: string | null;
          kind: PaymentKind;
          description: string;
          amount_cents: number;
          discount_cents: number;
          net_amount_cents: number;
          method: PaymentMethod;
          status: PaymentOrderStatus;
          external_reference: string | null;
          pix_payload: string | null;
          provider_payment_id: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          appointment_id?: string | null;
          subscription_id?: string | null;
          kind: PaymentKind;
          description: string;
          amount_cents: number;
          discount_cents?: number;
          net_amount_cents: number;
          method?: PaymentMethod;
          status?: PaymentOrderStatus;
          external_reference?: string | null;
          pix_payload?: string | null;
          provider_payment_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      partner_listings: Table<
        {
          id: string;
          organization_id: string;
          kind: PartnerKind;
          trade_name: string;
          city: string;
          state: string;
          coupon_code: string;
          discount_percent: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          kind: PartnerKind;
          trade_name: string;
          city: string;
          state: string;
          coupon_code: string;
          discount_percent?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      ad_campaigns: Table<
        {
          id: string;
          organization_id: string;
          title: string;
          placement: AdPlacement;
          budget_cents: number;
          status: AdCampaignStatus;
          starts_on: string;
          ends_on: string | null;
          clicks_count: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          title: string;
          placement?: AdPlacement;
          budget_cents: number;
          status?: AdCampaignStatus;
          starts_on?: string;
          ends_on?: string | null;
          clicks_count?: number;
          created_at?: string;
          updated_at?: string;
        }
      >;
      integration_configs: Table<
        {
          id: string;
          organization_id: string | null;
          provider: IntegrationProvider;
          environment: IntegrationEnvironment;
          webhook_endpoint: string;
          active: boolean;
          last_status: string;
          last_checked_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id?: string | null;
          provider: IntegrationProvider;
          environment?: IntegrationEnvironment;
          webhook_endpoint: string;
          active?: boolean;
          last_status?: string;
          last_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      push_subscriptions: Table<
        {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_secret: string;
          user_agent: string | null;
          role_hint: UserRole;
          reminder_lead_minutes: number;
          notify_appointments: boolean;
          notify_queue: boolean;
          is_active: boolean;
          last_notified_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_secret: string;
          user_agent?: string | null;
          role_hint?: UserRole;
          reminder_lead_minutes?: number;
          notify_appointments?: boolean;
          notify_queue?: boolean;
          is_active?: boolean;
          last_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      notifications: Table<
        {
          id: string;
          recipient_id: string;
          appointment_id: string | null;
          kind: NotificationKind;
          title: string;
          body: string;
          action_url: string;
          dedupe_key: string | null;
          read_at: string | null;
          pushed_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          recipient_id: string;
          appointment_id?: string | null;
          kind: NotificationKind;
          title: string;
          body: string;
          action_url?: string;
          dedupe_key?: string | null;
          read_at?: string | null;
          pushed_at?: string | null;
          created_at?: string;
        }
      >;
      legal_acknowledgements: Table<
        {
          id: string;
          user_id: string;
          document_key: string;
          document_version: string;
          acknowledged_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          document_key: string;
          document_version: string;
          acknowledged_at?: string;
        }
      >;
      fiscal_invoices: Table<
        {
          id: string;
          organization_id: string;
          veterinarian_id: string;
          invoice_number: string;
          period_label: string;
          total_cents: number;
          tax_id: string;
          verification_code: string;
          status: 'requested' | 'issued' | 'cancelled';
          provider: 'drvet_fiscal' | 'bling' | 'omie';
          notes: string | null;
          issued_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          veterinarian_id: string;
          invoice_number: string;
          period_label: string;
          total_cents: number;
          tax_id: string;
          verification_code: string;
          status?: 'requested' | 'issued' | 'cancelled';
          provider?: 'drvet_fiscal' | 'bling' | 'omie';
          notes?: string | null;
          issued_at?: string | null;
        }
      >;
      partner_attributions: Table<
        {
          id: string;
          tutor_id: string;
          partner_listing_id: string | null;
          organization_id: string | null;
          coupon_code: string;
          discount_percent: number;
          source: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          tutor_id: string;
          partner_listing_id?: string | null;
          organization_id?: string | null;
          coupon_code: string;
          discount_percent?: number;
          source?: string;
          active?: boolean;
        }
      >;
      role_applications: Table<
        {
          id: string;
          user_id: string;
          requested_role: 'veterinarian' | 'partner';
          organization_name: string;
          document_id: string;
          registration_region: string | null;
          specialty: string | null;
          city: string | null;
          state: string | null;
          avatar_path: string | null;
          status: 'pending' | 'approved' | 'rejected';
          reviewer_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          requested_role: 'veterinarian' | 'partner';
          organization_name: string;
          document_id: string;
          registration_region?: string | null;
          specialty?: string | null;
          city?: string | null;
          state?: string | null;
          avatar_path?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          reviewer_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        }
      >;
      audit_logs: Table<
        {
          id: string;
          actor_id: string | null;
          event: string;
          resource: string;
          action: string;
          outcome: 'allowed' | 'denied' | 'error' | 'rate_limited';
          status_code: number | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          event: string;
          resource: string;
          action: string;
          outcome: 'allowed' | 'denied' | 'error' | 'rate_limited';
          status_code?: number | null;
          metadata?: Json;
          created_at?: string;
        }
      >;
      webhook_events: Table<
        {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          order_id: string | null;
          payload_hash: string;
          status: 'processed' | 'ignored' | 'failed';
          processed_at: string;
          created_at: string;
        },
        {
          id?: string;
          provider: string;
          event_id: string;
          event_type: string;
          order_id?: string | null;
          payload_hash: string;
          status?: 'processed' | 'ignored' | 'failed';
          processed_at?: string;
          created_at?: string;
        }
      >;
      teleconsultation_consents: Table<
        {
          id: string;
          session_id: string;
          appointment_id: string;
          tutor_id: string;
          veterinarian_id: string;
          policy_version: string;
          tutor_consented_at: string | null;
          tutor_revoked_at: string | null;
          vet_consented_at: string | null;
          vet_revoked_at: string | null;
          retention_days: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          session_id: string;
          appointment_id: string;
          tutor_id: string;
          veterinarian_id: string;
          policy_version?: string;
          tutor_consented_at?: string | null;
          tutor_revoked_at?: string | null;
          vet_consented_at?: string | null;
          vet_revoked_at?: string | null;
          retention_days?: number;
        }
      >;
      notification_outbox: Table<
        {
          id: string;
          recipient_user_id: string;
          channel: 'email' | 'whatsapp' | 'push';
          template_key: string;
          status: 'queued' | 'sent' | 'failed' | 'cancelled';
          attempts: number;
          provider_message_id: string | null;
          scheduled_for: string;
          sent_at: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          recipient_user_id: string;
          channel: 'email' | 'whatsapp' | 'push';
          template_key: string;
          status?: 'queued' | 'sent' | 'failed' | 'cancelled';
          attempts?: number;
          provider_message_id?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          last_error?: string | null;
        }
      >;
      facial_biometrics: Table<
        {
          id: string;
          user_id: string;
          status: 'active' | 'revoked' | 'pending_recalibration';
          algorithm: string;
          template_hash: string;
          descriptor_vector: number[];
          liveness_score: number;
          device_label: string | null;
          enrolled_at: string;
          last_verified_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          status?: 'active' | 'revoked' | 'pending_recalibration';
          algorithm?: string;
          template_hash: string;
          descriptor_vector: number[];
          liveness_score: number;
          device_label?: string | null;
          enrolled_at?: string;
          last_verified_at?: string | null;
        }
      >;
      facial_biometric_verifications: Table<
        {
          id: string;
          user_id: string;
          biometric_id: string | null;
          event_type: 'enroll' | 'verify_success' | 'verify_failed' | 'revoke';
          similarity_score: number | null;
          liveness_score: number | null;
          matched: boolean;
          device_label: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          biometric_id?: string | null;
          event_type: 'enroll' | 'verify_success' | 'verify_failed' | 'revoke';
          similarity_score?: number | null;
          liveness_score?: number | null;
          matched?: boolean;
          device_label?: string | null;
        }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_organization: {
        Args: { organization_name: string };
        Returns: string;
      };
      add_veterinarian: {
        Args: {
          target_organization: string;
          target_user: string;
          target_registration_number: string;
          target_registration_region: string;
          target_specialty?: string | null;
          target_avatar_path?: string | null;
        };
        Returns: undefined;
      };
      approve_veterinarian: {
        Args: { target_organization: string; target_user: string };
        Returns: undefined;
      };
      transition_appointment: {
        Args: {
          target_appointment: string;
          next_status: AppointmentStatus;
        };
        Returns: Database['public']['Tables']['appointments']['Row'];
      };
      save_clinical_record: {
        Args: {
          target_appointment: string;
          target_subjective: string;
          target_objective: string;
          target_assessment: string;
          target_plan: string;
          target_vitals: Json;
          target_status: ClinicalRecordStatus;
        };
        Returns: Database['public']['Tables']['clinical_records']['Row'];
      };
      create_vaccination_record: {
        Args: {
          target_appointment: string;
          target_vaccine_name: string;
          target_administered_on: string;
          target_batch_number?: string | null;
          target_manufacturer?: string | null;
          target_next_due_on?: string | null;
          target_notes?: string | null;
        };
        Returns: Database['public']['Tables']['vaccination_records']['Row'];
      };
      create_exam_order: {
        Args: {
          target_appointment: string;
          target_modality: ExamModality;
          target_exam_name: string;
          target_clinical_indication: string;
          target_instructions?: string | null;
        };
        Returns: Database['public']['Tables']['exam_orders']['Row'];
      };
      record_exam_result: {
        Args: {
          target_exam_order: string;
          target_result_summary: string;
          target_laboratory_name?: string | null;
          target_performed_at?: string | null;
        };
        Returns: Database['public']['Tables']['exam_orders']['Row'];
      };
      save_prescription_draft: {
        Args: { target_appointment: string; target_items: Json };
        Returns: Database['public']['Tables']['prescription_drafts']['Row'];
      };
      set_availability_block: {
        Args: {
          target_availability: string;
          should_block: boolean;
          target_reason?: string | null;
        };
        Returns: Database['public']['Tables']['professional_availability']['Row'];
      };
      request_commission_anticipation: {
        Args: {
          target_amount_cents: number;
          target_notes?: string | null;
        };
        Returns: Database['public']['Tables']['anticipation_requests']['Row'];
      };
      open_teleconsultation_session: {
        Args: {
          target_appointment: string;
        };
        Returns: Database['public']['Tables']['teleconsultation_sessions']['Row'];
      };
      record_teleconsultation_consent: {
        Args: {
          target_session: string;
          consent_granted: boolean;
        };
        Returns: Database['public']['Tables']['teleconsultation_consents']['Row'];
      };
      subscribe_pet_to_plan: {
        Args: {
          target_plan: string;
          target_pet: string;
          target_method?: PaymentMethod;
        };
        Returns: Database['public']['Tables']['pet_subscriptions']['Row'];
      };
      admin_list_users: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['profiles']['Row'][];
      };
      admin_update_user_role: {
        Args: {
          target_user: string;
          next_role: UserRole;
        };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      create_teleconsultation_payment: {
        Args: {
          target_appointment: string;
          target_method?: PaymentMethod;
          target_coupon?: string | null;
        };
        Returns: Database['public']['Tables']['payment_orders']['Row'];
      };
      enqueue_appointment_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['notifications']['Row'][];
      };
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      get_public_veterinarians: {
        Args: Record<PropertyKey, never>;
        Returns: {
          user_id: string;
          organization_id: string;
          organization_name: string;
          display_name: string;
          registration_number: string;
          registration_region: string;
          specialty: string | null;
          consultation_fee_cents: number;
          bio: string | null;
          is_online_now: boolean;
          open_slots_count: number;
          avatar_path: string | null;
        }[];
      };
      update_my_vet_profile: {
        Args: {
          target_consultation_fee_cents: number;
          target_bio?: string | null;
          target_is_online_now?: boolean | null;
          target_avatar_path?: string | null;
        };
        Returns: Database['public']['Tables']['veterinarian_profiles']['Row'];
      };
      request_fiscal_invoice: {
        Args: {
          target_period_label: string;
          target_total_cents: number;
          target_tax_id: string;
          target_provider?: 'drvet_fiscal' | 'bling' | 'omie';
          target_notes?: string | null;
        };
        Returns: Database['public']['Tables']['fiscal_invoices']['Row'];
      };
      update_fiscal_invoice_status: {
        Args: {
          target_invoice: string;
          next_status: 'requested' | 'issued' | 'cancelled';
        };
        Returns: Database['public']['Tables']['fiscal_invoices']['Row'];
      };
      record_partner_attribution: {
        Args: { target_coupon: string };
        Returns: Database['public']['Tables']['partner_attributions']['Row'];
      };
      submit_role_application: {
        Args: {
          target_requested_role: 'veterinarian' | 'partner';
          target_organization_name: string;
          target_document_id: string;
          target_registration_region?: string | null;
          target_specialty?: string | null;
          target_city?: string | null;
          target_state?: string | null;
          target_avatar_path?: string | null;
        };
        Returns: Database['public']['Tables']['role_applications']['Row'];
      };
      review_role_application: {
        Args: {
          target_application: string;
          approve: boolean;
          target_notes?: string | null;
        };
        Returns: Database['public']['Tables']['role_applications']['Row'];
      };
      issue_prescription: {
        Args: { target_appointment: string };
        Returns: Database['public']['Tables']['prescription_drafts']['Row'];
      };
      verify_prescription_code: {
        Args: { target_code: string };
        Returns: {
          verification_code: string;
          status: string;
          issued_at: string;
          pet_name: string;
          species: string;
          veterinarian_name: string;
          crmv: string;
          items_count: number;
        }[];
      };
      create_pending_appointment_order: {
        Args: {
          target_appointment: string;
          target_method?: PaymentMethod;
          target_coupon?: string | null;
          target_pix_payload?: string | null;
          target_provider_id?: string | null;
        };
        Returns: Database['public']['Tables']['payment_orders']['Row'];
      };
      settle_payment_order: {
        Args: {
          target_order_id: string;
          target_reference?: string | null;
        };
        Returns: Database['public']['Tables']['payment_orders']['Row'];
      };
      upsert_my_payout_account: {
        Args: {
          target_provider: string;
          target_label: string;
          target_pix_key: string;
        };
        Returns: Database['public']['Tables']['payout_accounts']['Row'];
      };
      enroll_facial_biometrics: {
        Args: {
          target_template_hash: string;
          target_descriptor_vector: Json;
          target_liveness_score: number;
          target_device_label?: string | null;
        };
        Returns: Database['public']['Tables']['facial_biometrics']['Row'];
      };
      record_facial_biometric_verification: {
        Args: {
          target_matched: boolean;
          target_similarity_score: number;
          target_liveness_score: number;
          target_device_label?: string | null;
        };
        Returns: Database['public']['Tables']['facial_biometric_verifications']['Row'];
      };
      revoke_facial_biometrics: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      organization_role: OrganizationRole;
      professional_status: ProfessionalStatus;
      appointment_kind: AppointmentKind;
      appointment_status: AppointmentStatus;
      clinical_record_status: ClinicalRecordStatus;
      exam_modality: ExamModality;
      exam_order_status: ExamOrderStatus;
      commission_origin: CommissionOrigin;
      commission_status: CommissionStatus;
      anticipation_status: AnticipationStatus;
      teleconsultation_status: TeleconsultationStatus;
      subscription_interval: SubscriptionInterval;
      pet_subscription_status: PetSubscriptionStatus;
      payment_kind: PaymentKind;
      payment_method: PaymentMethod;
      payment_order_status: PaymentOrderStatus;
      partner_kind: PartnerKind;
      ad_placement: AdPlacement;
      ad_campaign_status: AdCampaignStatus;
      integration_provider: IntegrationProvider;
      integration_environment: IntegrationEnvironment;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
