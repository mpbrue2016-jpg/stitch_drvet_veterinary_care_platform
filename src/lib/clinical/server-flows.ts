import type { UserRole } from '../auth/guards';
import type { OrganizationRole } from '../../types/database';

export interface MembershipSummary {
  organization_id: string;
  role: OrganizationRole;
}

export interface AppointmentAccessRecord {
  id: string;
  organization_id: string;
  pet_id: string;
  tutor_id: string;
  veterinarian_id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  starts_at: string;
  ends_at: string;
}

export interface ClinicalRecordAccessTarget {
  appointment_id: string;
  organization_id: string;
  veterinarian_id: string;
  status: 'draft' | 'finalized';
}

export function canAccessOrganizationResource(params: {
  actorRole: UserRole;
  actorMemberships: MembershipSummary[];
  targetOrganizationId: string;
  allowedOrgRoles?: OrganizationRole[];
}): boolean {
  if (params.actorRole === 'admin') return true;
  const membership = params.actorMemberships.find(
    (m) => m.organization_id === params.targetOrganizationId,
  );
  if (!membership) return false;
  if (!params.allowedOrgRoles || params.allowedOrgRoles.length === 0) {
    return true;
  }
  return params.allowedOrgRoles.includes(membership.role);
}

export function canAccessAppointment(params: {
  actorId: string;
  actorRole: UserRole;
  actorMemberships: MembershipSummary[];
  appointment: AppointmentAccessRecord;
}): boolean {
  if (params.actorRole === 'admin') return true;
  if (params.appointment.tutor_id === params.actorId) return true;
  if (params.appointment.veterinarian_id === params.actorId) return true;
  return canAccessOrganizationResource({
    actorRole: params.actorRole,
    actorMemberships: params.actorMemberships,
    targetOrganizationId: params.appointment.organization_id,
    allowedOrgRoles: ['owner', 'admin'],
  });
}

export function evaluateAppointmentTransition(params: {
  actorId: string;
  actorRole: UserRole;
  actorMemberships: MembershipSummary[];
  isApprovedVetInOrg: boolean;
  appointment: AppointmentAccessRecord;
  nextStatus: 'confirmed' | 'cancelled' | 'completed';
  nowMs?: number;
}): { allowed: true } | { allowed: false; status: number; reason: string } {
  const nowMs = params.nowMs ?? Date.now();
  const isGlobalAdmin = params.actorRole === 'admin';
  const isAssignedVet =
    params.appointment.veterinarian_id === params.actorId &&
    params.isApprovedVetInOrg;
  const isOrgManager = canAccessOrganizationResource({
    actorRole: params.actorRole,
    actorMemberships: params.actorMemberships,
    targetOrganizationId: params.appointment.organization_id,
    allowedOrgRoles: ['owner', 'admin'],
  });
  const isOwner =
    isGlobalAdmin ||
    params.appointment.tutor_id === params.actorId ||
    isOrgManager;

  const startsAtMs = new Date(params.appointment.starts_at).getTime();
  const endsAtMs = new Date(params.appointment.ends_at).getTime();

  if (params.nextStatus === 'cancelled') {
    if (!isOwner && !isAssignedVet) {
      return {
        allowed: false,
        status: 403,
        reason: 'Sem permissão para cancelar este agendamento.',
      };
    }
    if (
      (params.appointment.status !== 'pending' &&
        params.appointment.status !== 'confirmed') ||
      (startsAtMs <= nowMs && !isGlobalAdmin)
    ) {
      return {
        allowed: false,
        status: 409,
        reason: 'Este agendamento não pode mais ser cancelado.',
      };
    }
    return { allowed: true };
  }

  if (params.nextStatus === 'confirmed') {
    if (!isAssignedVet && !isGlobalAdmin) {
      return {
        allowed: false,
        status: 403,
        reason: 'Somente o veterinário designado ou administrador pode confirmar.',
      };
    }
    if (params.appointment.status !== 'pending' || startsAtMs <= nowMs) {
      return {
        allowed: false,
        status: 409,
        reason: 'Agendamento não está pendente ou já ultrapassou o horário.',
      };
    }
    return { allowed: true };
  }

  // completed
  if (!isAssignedVet && !isGlobalAdmin) {
    return {
      allowed: false,
      status: 403,
      reason: 'Somente o veterinário designado ou administrador pode concluir.',
    };
  }
  if (
    params.appointment.status !== 'confirmed' ||
    (endsAtMs > nowMs && !isGlobalAdmin)
  ) {
    return {
      allowed: false,
      status: 409,
      reason: 'A consulta precisa estar confirmada e ter encerrado para ser concluída.',
    };
  }
  return { allowed: true };
}

export function canReadClinicalRecord(params: {
  actorId: string;
  actorRole: UserRole;
  actorMemberships: MembershipSummary[];
  isApprovedVetInOrg: boolean;
  appointment: AppointmentAccessRecord;
  record: ClinicalRecordAccessTarget;
}): boolean {
  if (params.actorRole === 'admin') return true;
  if (
    params.record.veterinarian_id === params.actorId &&
    params.isApprovedVetInOrg
  ) {
    return true;
  }
  if (
    canAccessOrganizationResource({
      actorRole: params.actorRole,
      actorMemberships: params.actorMemberships,
      targetOrganizationId: params.record.organization_id,
      allowedOrgRoles: ['owner', 'admin'],
    })
  ) {
    return true;
  }
  return (
    params.record.status === 'finalized' &&
    params.appointment.id === params.record.appointment_id &&
    params.appointment.tutor_id === params.actorId
  );
}

export function evaluateClinicalRecordWrite(params: {
  actorId: string;
  isApprovedVetInOrg: boolean;
  appointment: AppointmentAccessRecord;
  existingStatus?: 'draft' | 'finalized' | null;
  targetStatus: 'draft' | 'finalized';
  sections: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  nowMs?: number;
}): { allowed: true } | { allowed: false; status: number; reason: string } {
  const nowMs = params.nowMs ?? Date.now();
  const startsAtMs = new Date(params.appointment.starts_at).getTime();

  if (
    params.appointment.veterinarian_id !== params.actorId ||
    !params.isApprovedVetInOrg ||
    (params.appointment.status !== 'confirmed' &&
      params.appointment.status !== 'completed') ||
    (params.appointment.status === 'confirmed' && startsAtMs > nowMs)
  ) {
    return {
      allowed: false,
      status: 403,
      reason: 'Apenas o veterinário designado após o início do atendimento pode salvar o prontuário.',
    };
  }

  if (params.existingStatus === 'finalized') {
    return {
      allowed: false,
      status: 409,
      reason: 'Prontuário já finalizado é imutável e não pode ser alterado.',
    };
  }

  if (params.targetStatus === 'finalized') {
    const { subjective, objective, assessment, plan } = params.sections;
    if (
      !subjective.trim() ||
      !objective.trim() ||
      !assessment.trim() ||
      !plan.trim()
    ) {
      return {
        allowed: false,
        status: 400,
        reason: 'Todas as seções SOAP são obrigatórias para finalizar o prontuário.',
      };
    }
  }

  return { allowed: true };
}

export function canReadVaccinationRecord(params: {
  actorId: string;
  actorRole: UserRole;
  isApprovedVetInOrg: boolean;
  appointment: AppointmentAccessRecord;
}): boolean {
  if (params.actorRole === 'admin') return true;
  if (params.appointment.tutor_id === params.actorId) return true;
  return (
    params.appointment.veterinarian_id === params.actorId &&
    params.isApprovedVetInOrg
  );
}

export function evaluateVaccinationWrite(params: {
  actorId: string;
  isApprovedVetInOrg: boolean;
  appointment: AppointmentAccessRecord;
  nowMs?: number;
}): { allowed: true } | { allowed: false; status: number; reason: string } {
  const nowMs = params.nowMs ?? Date.now();
  const endsAtMs = new Date(params.appointment.ends_at).getTime();

  if (
    params.appointment.veterinarian_id !== params.actorId ||
    !params.isApprovedVetInOrg ||
    (params.appointment.status !== 'confirmed' &&
      params.appointment.status !== 'completed') ||
    endsAtMs > nowMs
  ) {
    return {
      allowed: false,
      status: 403,
      reason: 'Somente o veterinário designado pode registrar vacina após o atendimento.',
    };
  }

  return { allowed: true };
}

export type TeleconsultationSessionStatus = 'waiting' | 'in_progress' | 'ended';

export function canTransitionTeleconsultationStatus(
  from: TeleconsultationSessionStatus,
  to: TeleconsultationSessionStatus,
): boolean {
  if (from === to) return true;
  if (from === 'waiting') {
    return to === 'in_progress' || to === 'ended';
  }
  if (from === 'in_progress') {
    return to === 'ended';
  }
  return false;
}

export function canManageSubscriptionStatus(params: {
  actorId: string;
  actorRole: UserRole;
  subscriptionOwnerId: string;
}): boolean {
  if (params.actorRole === 'admin') return true;
  return params.subscriptionOwnerId === params.actorId;
}

export function canManageTeleconsultationSession(params: {
  actorId: string;
  actorRole: UserRole;
  sessionVeterinarianId: string;
}): boolean {
  if (params.actorRole === 'admin') return true;
  return params.sessionVeterinarianId === params.actorId;
}

export function canPostTeleconsultationMessage(params: {
  actorId: string;
  actorRole: UserRole;
  tutorId: string;
  veterinarianId: string;
  sessionStatus: TeleconsultationSessionStatus;
}): { allowed: true } | { allowed: false; status: number; reason: string } {
  const isParticipant =
    params.actorRole === 'admin' ||
    params.tutorId === params.actorId ||
    params.veterinarianId === params.actorId;

  if (!isParticipant) {
    return {
      allowed: false,
      status: 403,
      reason: 'Somente participantes da teleconsulta podem enviar mensagens.',
    };
  }

  if (params.sessionStatus === 'ended') {
    return {
      allowed: false,
      status: 409,
      reason: 'Esta sala de teleconsulta já foi encerrada.',
    };
  }

  return { allowed: true };
}


