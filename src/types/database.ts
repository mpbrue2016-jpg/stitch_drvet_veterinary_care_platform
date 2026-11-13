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
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          display_name?: string;
          email?: string | null;
          phone?: string | null;
          role?: UserRole;
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
