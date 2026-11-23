import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type {
  ClinicalRecord,
  ClinicalRecordStatus,
  ClinicalVitals,
  PetSummary,
} from '@/types/entities';
import { toFriendlyError } from './errors';

export interface SaveClinicalRecordInput {
  appointment_id: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  vitals: ClinicalVitals;
  status: ClinicalRecordStatus;
}

const CLINICAL_COLUMNS =
  'id, appointment_id, organization_id, pet_id, veterinarian_id, subjective, objective, assessment, plan, vitals, status, finalized_at, created_at, updated_at';

function parseVitals(raw: Json): ClinicalVitals {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const toNum = (val: unknown) =>
    typeof val === 'number' && Number.isFinite(val) ? val : null;

  return {
    weight_kg: toNum(obj.weight_kg),
    temperature_c: toNum(obj.temperature_c),
    heart_rate_bpm: toNum(obj.heart_rate_bpm),
    respiratory_rate_rpm: toNum(obj.respiratory_rate_rpm),
    mucous_membranes:
      typeof obj.mucous_membranes === 'string' ? obj.mucous_membranes : null,
    capillary_refill_seconds: toNum(obj.capillary_refill_seconds),
  };
}

export async function listarProntuarios(): Promise<{
  clinicalRecords: ClinicalRecord[];
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('clinical_records')
      .select(CLINICAL_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const rows = data ?? [];
    const petIds = Array.from(new Set(rows.map((row) => row.pet_id)));
    const { data: pets, error: petsError } =
      petIds.length > 0
        ? await supabase.from('pets').select('id, name, species').in('id', petIds)
        : { data: [], error: null };

    if (petsError) throw petsError;
    const petById = new Map<string, PetSummary>(
      (pets ?? []).map((pet) => [pet.id, pet]),
    );

    return {
      clinicalRecords: rows.map((row) => ({
        ...row,
        vitals: parseVitals(row.vitals),
        pet: petById.get(row.pet_id) ?? null,
      })),
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar os prontuários.');
  }
}

export async function buscarProntuarioPorAtendimento(
  appointmentId: string,
): Promise<{
  clinicalRecord: ClinicalRecord | null;
  canEdit: boolean;
  petId: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Faça login para acessar o prontuário.');
    }

    const [{ data: record, error: recordError }, { data: appointment, error: aptError }] =
      await Promise.all([
        supabase
          .from('clinical_records')
          .select(CLINICAL_COLUMNS)
          .eq('appointment_id', appointmentId)
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('id, veterinarian_id, status, starts_at, pet_id')
          .eq('id', appointmentId)
          .maybeSingle(),
      ]);

    if (recordError) throw recordError;
    if (aptError) throw aptError;

    const targetPetId = record?.pet_id ?? appointment?.pet_id ?? null;
    let pet: PetSummary | null = null;
    if (targetPetId) {
      const { data: petRow } = await supabase
        .from('pets')
        .select('id, name, species')
        .eq('id', targetPetId)
        .maybeSingle();
      pet = petRow ?? null;
    }

    const canEdit =
      (!record || record.status === 'draft') &&
      Boolean(
        appointment &&
          appointment.veterinarian_id === authData.user.id &&
          (appointment.status === 'completed' ||
            (appointment.status === 'confirmed' &&
              new Date(appointment.starts_at).getTime() <= Date.now())),
      );

    return {
      clinicalRecord: record
        ? {
            ...record,
            vitals: parseVitals(record.vitals),
            pet,
          }
        : null,
      canEdit,
      petId: targetPetId,
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível carregar o prontuário.');
  }
}

export async function salvarProntuario(
  input: SaveClinicalRecordInput,
): Promise<{ clinicalRecord: ClinicalRecord }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('save_clinical_record', {
      target_appointment: input.appointment_id,
      target_subjective: input.subjective,
      target_objective: input.objective,
      target_assessment: input.assessment,
      target_plan: input.plan,
      target_vitals: input.vitals as unknown as Json,
      target_status: input.status,
    });

    if (error) throw error;

    return {
      clinicalRecord: {
        ...data,
        vitals: parseVitals(data.vitals),
      },
    };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível salvar o prontuário.');
  }
}
