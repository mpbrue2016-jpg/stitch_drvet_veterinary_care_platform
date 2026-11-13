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

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          display_name: string;
          phone: string | null;
          created_at: string;
          updated_at: string;
        },
        { id: string; display_name?: string; phone?: string | null }
      >;
      organizations: Table<
        { id: string; name: string; created_by: string; created_at: string },
        { name: string; created_by: string; id?: string; created_at?: string }
      >;
      organization_memberships: Table<
        {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
        },
        {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at?: string;
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
        },
        {
          user_id: string;
          organization_id: string;
          registration_number: string;
          registration_region: string;
          specialty?: string | null;
          status?: ProfessionalStatus;
          created_at?: string;
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
    };
    Views: { [_ in never]: never };
    Functions: {
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
    };
    Enums: {
      organization_role: OrganizationRole;
      professional_status: ProfessionalStatus;
      appointment_kind: AppointmentKind;
      appointment_status: AppointmentStatus;
      clinical_record_status: ClinicalRecordStatus;
      exam_modality: ExamModality;
      exam_order_status: ExamOrderStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
