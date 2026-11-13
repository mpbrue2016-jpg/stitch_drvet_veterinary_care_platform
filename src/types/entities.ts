import type {
  AppointmentKind,
  AppointmentStatus,
  ClinicalRecordStatus,
  ExamModality,
  ExamOrderStatus,
  OrganizationRole,
  ProfessionalStatus,
} from './database';

export type {
  AppointmentKind,
  AppointmentStatus,
  ClinicalRecordStatus,
  ExamModality,
  ExamOrderStatus,
  OrganizationRole,
  ProfessionalStatus,
};

export interface UserProfile {
  id: string;
  display_name: string;
  email?: string;
  phone: string | null;
  role: 'tutor' | 'veterinarian' | 'partner' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  role: OrganizationRole;
  created_at?: string;
}

export interface VeterinarianProfile {
  organization_id: string;
  user_id: string;
  display_name?: string;
  registration_number: string;
  registration_region: string;
  specialty: string | null;
  status: ProfessionalStatus;
  created_at?: string;
}

export interface PetSummary {
  id: string;
  name: string;
  species: string;
}

export interface Pet extends PetSummary {
  owner_id: string;
  breed: string | null;
  birth_date: string | null;
  sex: 'female' | 'male' | 'unknown' | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  id: string;
  organization_id: string;
  veterinarian_id: string;
  starts_at: string;
  ends_at: string;
  is_available: boolean;
  is_blocked: boolean;
  blocked_at?: string | null;
  block_reason: string | null;
}

export interface Appointment {
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
  pet: PetSummary | null;
}

export interface ClinicalVitals {
  weight_kg: number | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  respiratory_rate_rpm: number | null;
  mucous_membranes: string | null;
  capillary_refill_seconds: number | null;
}

export interface ClinicalRecord {
  id: string;
  appointment_id: string;
  organization_id: string;
  pet_id: string;
  veterinarian_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  status: ClinicalRecordStatus;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
  pet?: PetSummary | null;
}

export interface VaccinationRecord {
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
  pet: PetSummary | null;
}

export interface ExamOrder {
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
  pet: PetSummary | null;
}

export interface PrescriptionItem {
  name: string;
  presentation: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

export interface PrescriptionDraft {
  id: string;
  appointment_id: string;
  organization_id: string;
  pet_id: string;
  veterinarian_id: string;
  items: PrescriptionItem[];
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export type CommissionOrigin = 'teleconsultation' | 'in_person' | 'pharmacy_split' | 'partner_plan';
export type CommissionStatus = 'available' | 'pending' | 'paid';

export interface CommissionEntry {
  id: string;
  reference: string;
  tutor_name: string;
  pet_name: string;
  origin: CommissionOrigin;
  gross_amount_cents: number;
  net_amount_cents: number;
  status: CommissionStatus;
  occurred_at: string;
}

export interface CommissionSummary {
  available_cents: number;
  period_total_cents: number;
  pending_cents: number;
  accumulated_cents: number;
  provider_connected: boolean;
  payout_account_label: string;
  pix_key_masked: string | null;
  period_label: string;
}
