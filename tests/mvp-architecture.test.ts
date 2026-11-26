import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildDailyGoalSelectOptions,
  buildIndividualVetAgendaDigest,
  calculateDailyGoalProgress,
  clampDailyConsultationGoal,
  DEFAULT_DAILY_CONSULTATION_GOAL,
  filterAppointmentsForVeterinarian,
  filterAvailabilityForVeterinarian,
  getVetDailyGoalStorageKey,
  isVetAgendaNotificationKind,
  MAX_DAILY_CONSULTATION_GOAL,
  MIN_DAILY_CONSULTATION_GOAL,
  parseStoredDailyConsultationGoal,
  summarizeVetConsultations,
  toClinicDateKey,
} from '../src/lib/agenda/individual-digest';
import { canManagePartnerOrganization } from '../src/lib/auth/guards';
import {
  buildCanonicalPrescriptionManifest,
  computePrescriptionDigestHex,
  evaluateDigitalSignatureReadiness,
} from '../src/lib/clinical/prescription-digest';
import {
  assessFacialLiveness,
  computeDescriptorSimilarity,
  computeFaceDescriptorFromLumaGrid,
  FACIAL_DESCRIPTOR_DIMENSION,
  FACIAL_MATCH_THRESHOLD,
} from '../src/lib/biometrics/facial';
import {
  extractPrescriptionCodeFromQrValue,
  findCachedVerifiedPrescription,
  MAX_RECENT_VERIFIED_CODES,
  parseRecentVerifiedCodes,
  removeRecentVerifiedCode,
  upsertRecentVerifiedCode,
} from '../src/lib/clinical/recent-prescription-codes';
import {
  canManageSubscriptionStatus,
  canManageTeleconsultationSession,
  canPostTeleconsultationMessage,
  canTransitionTeleconsultationStatus,
} from '../src/lib/clinical/server-flows';
import {
  calculateCommissionSplitCents,
  checkPaymentGatewayReadiness,
  computePayloadSha256,
  isWithinReplayWindow,
  verifyMercadoPagoSignature,
  verifySharedWebhookSecret,
} from '../src/lib/payments/architecture';
import { maskPixKeyForDisplay } from '../src/lib/payments/pix-mask';
import { buildUtf8Csv, sanitizeCsvCell } from '../src/lib/security/csv';
import {
  detectBinaryFileSignature,
  validateBinaryUploadSignature,
} from '../src/lib/security/file-signature';
import {
  isPrivateIpAddress,
  validateSafeExternalUrl,
} from '../src/lib/security/ssrf';
import {
  canActorSignConsent,
  evaluateRecordingReadiness,
  TELECONSULTATION_RECORDING_POLICY,
} from '../src/lib/teleconsultation/consent';
import {
  adminReviewRoleApplicationSchema,
  adminUpdateUserRoleSchema,
  avatarPathSchema,
  createAdCampaignSchema,
  createPartnerListingSchema,
  deleteAvailabilitySchema,
  dispatchVetAgendaCommunicadoSchema,
  enrollFacialBiometricsSchema,
  fiscalInvoiceSchema,
  issuePrescriptionSchema,
  legalAcknowledgementSchema,
  openTeleconsultationSessionSchema,
  recordPartnerAttributionSchema,
  saveIntegrationConfigSchema,
  sendTeleconsultationMessageSchema,
  strictPayoutAccountSchema,
  strictRoleApplicationSchema,
  subscribePetPlanSchema,
  updateAdCampaignStatusSchema,
  updateFiscalInvoiceStatusSchema,
  updateProfileSchema,
  updateSubscriptionStatusSchema,
  updateTeleconsultationSessionSchema,
  verifyFacialBiometricsSchema,
  vetProfileSettingsSchema,
  vetReminderSettingsSchema,
} from '../src/lib/validations';
import { verifyCronSecretToken } from '../src/lib/notifications/cron-auth';
import {
  buildAppointmentWhatsappReminderText,
  buildVet30MinReminderContent,
  describeVetReminderChannel,
  escapeHtml,
  filterAppointmentsDueForVet30MinReminder,
  formatTwilioWhatsappAddress,
  getVet30MinReminderDedupeKey,
  isVetAutoReminderEnabled,
  normalizeVetReminderChannel,
  normalizeWhatsappPhoneToE164,
  shouldSendEmailForChannel,
  shouldSendPushForChannel,
  shouldSendWhatsappForChannel,
  VET_REMINDER_LEAD_MINUTES,
} from '../src/lib/notifications/vet-reminders';
import {
  isWhatsappProviderConfigured,
  sendWhatsappReminder,
} from '../src/lib/notifications/whatsapp-dispatcher';
import {
  buildAppointmentCacheKey,
  buildBasicRecordCacheKey,
  filterCachedAppointments,
  filterCachedBasicRecords,
  formatCachedVitalsSummary,
  isLikelyOfflineError,
  pruneVetAppointmentsForCache,
  pruneVetBasicRecordsForCache,
  toClinicalRecordFromCached,
} from '../src/lib/offline/vet-cache-helpers';

test('checkPaymentGatewayReadiness reports missing variables without leaking secret values', () => {
  const secretToken = 'secret_mp_live_token_should_not_appear';
  const missingResult = checkPaymentGatewayReadiness({});
  assert.equal(missingResult.length, 2);
  for (const gateway of missingResult) {
    assert.equal(gateway.configured, false);
    assert.equal(gateway.webhookVerificationReady, false);
    assert.ok(gateway.missingEnvVars.includes('PAYMENT_WEBHOOK_SECRET'));
    assert.ok(gateway.missingEnvVars.includes('SUPABASE_SERVICE_ROLE_KEY'));
  }

  const configured = checkPaymentGatewayReadiness({
    MERCADO_PAGO_ACCESS_TOKEN: secretToken,
    PAYMENT_WEBHOOK_SECRET: 'whsec_123',
    SUPABASE_SERVICE_ROLE_KEY: 'srv_456',
  });
  const mp = configured.find((item) => item.provider === 'mercado_pago');
  const asaas = configured.find((item) => item.provider === 'asaas');
  assert.equal(mp?.configured, true);
  assert.equal(mp?.webhookVerificationReady, true);
  assert.deepEqual(mp?.missingEnvVars, []);
  assert.equal(asaas?.configured, false);
  assert.equal(JSON.stringify(configured).includes(secretToken), false);
});

test('verifySharedWebhookSecret and verifyMercadoPagoSignature enforce HMAC and replay protection', () => {
  assert.equal(verifySharedWebhookSecret('super-secret', 'super-secret'), true);
  assert.equal(verifySharedWebhookSecret('wrong-secret', 'super-secret'), false);
  assert.equal(verifySharedWebhookSecret('', ''), false);

  const nowMs = 1_700_000_000_000;
  const ts = Math.floor(nowMs / 1000) - 30;
  const secret = 'mp_webhook_hmac_secret';
  const dataId = '99887766';
  const requestId = 'req-abc-123';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const sigHex = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const valid = verifyMercadoPagoSignature({
    signatureHeader: `ts=${ts},v1=${sigHex}`,
    requestIdHeader: requestId,
    dataId,
    secret,
    nowMs,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.timestampSeconds, ts);

  const tampered = verifyMercadoPagoSignature({
    signatureHeader: `ts=${ts},v1=${sigHex}`,
    requestIdHeader: requestId,
    dataId: '00000000',
    secret,
    nowMs,
  });
  assert.equal(tampered.valid, false);

  const expiredTs = Math.floor(nowMs / 1000) - 900;
  const expiredManifest = `id:${dataId};request-id:${requestId};ts:${expiredTs};`;
  const expiredSig = crypto
    .createHmac('sha256', secret)
    .update(expiredManifest)
    .digest('hex');
  const expired = verifyMercadoPagoSignature({
    signatureHeader: `ts=${expiredTs},v1=${expiredSig}`,
    requestIdHeader: requestId,
    dataId,
    secret,
    nowMs,
  });
  assert.equal(expired.valid, false);
  assert.equal(isWithinReplayWindow(expiredTs, { nowMs, maxAgeSeconds: 300 }), false);
  assert.equal(computePayloadSha256('payload').length, 64);
});

test('calculateCommissionSplitCents computes exact integer cents and rejects out-of-range bps', () => {
  const split = calculateCommissionSplitCents({
    grossAmountCents: 20_000,
    discountCents: 3_000,
    platformFeeBps: 1_500,
  });
  assert.equal(split.chargedAmountCents, 17_000);
  assert.equal(split.platformFeeCents, 2_550);
  assert.equal(split.netVeterinarianCents, 14_450);

  assert.throws(() =>
    calculateCommissionSplitCents({
      grossAmountCents: 10_000,
      platformFeeBps: 6_000,
    }),
  );
  assert.throws(() =>
    calculateCommissionSplitCents({
      grossAmountCents: -100,
    }),
  );
});

test('canActorSignConsent prevents cross-party signing', () => {
  assert.equal(
    canActorSignConsent({
      actorId: 'tutor-1',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      targetParty: 'tutor',
    }).allowed,
    true,
  );
  assert.equal(
    canActorSignConsent({
      actorId: 'vet-1',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      targetParty: 'tutor',
    }).allowed,
    false,
  );
  assert.equal(
    canActorSignConsent({
      actorId: 'tutor-1',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      targetParty: 'vet',
    }).allowed,
    false,
  );
  assert.equal(
    canActorSignConsent({
      actorId: 'stranger-1',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      targetParty: 'vet',
    }).allowed,
    false,
  );
});

test('evaluateRecordingReadiness blocks recording until bilateral consent, active session, and encrypted storage are met', () => {
  const baseState = {
    sessionId: 'sess-1',
    appointmentId: 'apt-1',
    tutorId: 'tutor-1',
    veterinarianId: 'vet-1',
    sessionStatus: 'in_progress' as const,
    tutorConsentedAt: '2026-11-24T10:00:00.000Z',
    tutorRevokedAt: null,
    vetConsentedAt: null,
    vetRevokedAt: null,
    storageBucketProvisioned: false,
  };

  // Unilateral consent + no storage bucket => blocked
  const onlyTutor = evaluateRecordingReadiness(baseState);
  assert.equal(onlyTutor.tutorConsented, true);
  assert.equal(onlyTutor.vetConsented, false);
  assert.equal(onlyTutor.bilateralConsented, false);
  assert.equal(onlyTutor.recordingPermitted, false);
  assert.equal(onlyTutor.retentionDays, TELECONSULTATION_RECORDING_POLICY.retentionDays);

  // Bilateral consent without provisioned encrypted storage => still blocked
  const bilateralNoStorage = evaluateRecordingReadiness({
    ...baseState,
    vetConsentedAt: '2026-11-24T10:01:00.000Z',
    storageBucketProvisioned: false,
  });
  assert.equal(bilateralNoStorage.bilateralConsented, true);
  assert.equal(bilateralNoStorage.recordingPermitted, false);

  // Revocation after prior consent => blocked
  const revokedTutor = evaluateRecordingReadiness({
    ...baseState,
    tutorRevokedAt: '2026-11-24T10:02:00.000Z',
    vetConsentedAt: '2026-11-24T10:01:00.000Z',
    storageBucketProvisioned: true,
  });
  assert.equal(revokedTutor.tutorConsented, false);
  assert.equal(revokedTutor.recordingPermitted, false);

  // Ended session => blocked
  const endedSession = evaluateRecordingReadiness({
    ...baseState,
    sessionStatus: 'ended',
    vetConsentedAt: '2026-11-24T10:01:00.000Z',
    storageBucketProvisioned: true,
  });
  assert.equal(endedSession.recordingPermitted, false);

  // All 4 conditions met => permitted
  const ready = evaluateRecordingReadiness({
    ...baseState,
    vetConsentedAt: '2026-11-24T10:01:00.000Z',
    storageBucketProvisioned: true,
  });
  assert.equal(ready.recordingPermitted, true);
  assert.deepEqual(ready.missingRequirements, []);
});

test('detectBinaryFileSignature and validateBinaryUploadSignature reject disguised or mismatched uploads', () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const htmlSpoofBytes = new TextEncoder().encode('<script>alert(1)</script>');

  assert.equal(detectBinaryFileSignature(pdfBytes), 'application/pdf');
  assert.equal(detectBinaryFileSignature(jpgBytes), 'image/jpeg');
  assert.equal(detectBinaryFileSignature(pngBytes), 'image/png');
  assert.equal(detectBinaryFileSignature(webpBytes), 'image/webp');
  assert.equal(detectBinaryFileSignature(htmlSpoofBytes), null);

  assert.equal(
    validateBinaryUploadSignature({
      bytes: pdfBytes,
      declaredMimeType: 'application/pdf',
      allowedMimeTypes: ['application/pdf', 'image/jpeg'],
    }).valid,
    true,
  );

  assert.equal(
    validateBinaryUploadSignature({
      bytes: htmlSpoofBytes,
      declaredMimeType: 'application/pdf',
      allowedMimeTypes: ['application/pdf', 'image/jpeg'],
    }).valid,
    false,
  );

  // Rejects valid PDF disguised as image/jpeg or disallowed for avatar bucket
  assert.equal(
    validateBinaryUploadSignature({
      bytes: pdfBytes,
      declaredMimeType: 'image/jpeg',
      allowedMimeTypes: ['application/pdf', 'image/jpeg'],
    }).valid,
    false,
  );
  assert.equal(
    validateBinaryUploadSignature({
      bytes: pdfBytes,
      declaredMimeType: 'application/pdf',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    }).valid,
    false,
  );
});

test('sanitizeCsvCell and buildUtf8Csv neutralize spreadsheet formula injection payloads', () => {
  assert.equal(sanitizeCsvCell('=cmd|" /C calc"!A0'), `"'=cmd|"" /C calc""!A0"`);
  assert.equal(sanitizeCsvCell('+1+1'), `"'+1+1"`);
  assert.equal(sanitizeCsvCell('-2+3'), `"'-2+3"`);
  assert.equal(sanitizeCsvCell('@SUM(A1:A2)'), `"'@SUM(A1:A2)"`);
  assert.equal(sanitizeCsvCell('\t=IMPORTXML()'), `"'\t=IMPORTXML()"`);
  assert.equal(sanitizeCsvCell('Rex "Ouro"'), `"Rex ""Ouro"""`);

  const csv = buildUtf8Csv(
    ['Tutor', 'Pet', 'Valor'],
    [['=HYPERLINK("http://evil")', 'Pipoca', '180,00']],
  );
  assert.ok(csv.startsWith('\uFEFF"Tutor";"Pet";"Valor"\n'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
});

test('computePrescriptionDigestHex produces deterministic tamper-evident SHA-256 hashes', async () => {
  const basePrescription = {
    prescriptionId: '11111111-1111-4111-8111-111111111111',
    appointmentId: '22222222-2222-4222-8222-222222222222',
    organizationId: '33333333-3333-4333-8333-333333333333',
    petId: '44444444-4444-4444-8444-444444444444',
    veterinarianId: '55555555-5555-4555-8555-555555555555',
    verificationCode: 'rx-8a2c91e0f4',
    issuedAt: '2026-11-24T12:00:00.000Z',
    items: [
      {
        name: ' Amoxicilina + Clavulanato ',
        presentation: 'Comprimido 250mg',
        dose: '1 comprimido',
        route: 'Oral',
        frequency: 'A cada 12h',
        duration: '7 dias',
        quantity: '14 comprimidos',
        instructions: 'Administrar após alimentação.',
      },
    ],
  };

  const manifest = buildCanonicalPrescriptionManifest(basePrescription);
  assert.ok(manifest.includes('"verificationCode":"RX-8A2C91E0F4"'));
  assert.ok(manifest.includes('"name":"Amoxicilina + Clavulanato"'));

  const hashA = await computePrescriptionDigestHex(basePrescription);
  const hashB = await computePrescriptionDigestHex({
    ...basePrescription,
    verificationCode: '  RX-8A2C91E0F4 ',
    items: [{ ...basePrescription.items[0], name: 'Amoxicilina + Clavulanato' }],
  });
  assert.equal(hashA.length, 64);
  assert.equal(hashA, hashB);

  const tamperedHash = await computePrescriptionDigestHex({
    ...basePrescription,
    items: [{ ...basePrescription.items[0], dose: '2 comprimidos' }],
  });
  assert.notEqual(hashA, tamperedHash);
});

test('evaluateDigitalSignatureReadiness keeps private keys out of the application', () => {
  const readiness = evaluateDigitalSignatureReadiness();
  assert.equal(readiness.mode, 'qr_authenticity_only');
  assert.equal(readiness.icpBrasilActive, false);
  assert.equal(readiness.privateKeyStoredInApp, false);
  assert.equal(readiness.canonicalHashAlgorithm, 'SHA-256');
  assert.ok(readiness.supportedCloudProviders.length >= 3);
});

test('canManagePartnerOrganization and partner/prescription Zod schemas enforce RBAC and bounds', () => {
  assert.equal(canManagePartnerOrganization('admin', null), true);
  assert.equal(canManagePartnerOrganization('partner', 'owner'), true);
  assert.equal(canManagePartnerOrganization('partner', 'admin'), true);
  assert.equal(canManagePartnerOrganization('partner', 'staff'), false);
  assert.equal(canManagePartnerOrganization('partner', 'billing'), false);
  assert.equal(canManagePartnerOrganization('partner', null), false);
  assert.equal(canManagePartnerOrganization('tutor', 'owner'), false);
  assert.equal(canManagePartnerOrganization('veterinarian', 'owner'), false);

  const validPartner = createPartnerListingSchema.safeParse({
    organization_id: '33333333-3333-4333-8333-333333333333',
    kind: 'pharmacy',
    trade_name: 'FarmaVet Central',
    city: 'São Paulo',
    state: 'sp',
    coupon_code: 'drvet15',
    discount_percent: 15,
  });
  assert.equal(validPartner.success, true);
  if (validPartner.success) {
    assert.equal(validPartner.data.state, 'SP');
    assert.equal(validPartner.data.coupon_code, 'DRVET15');
  }

  assert.equal(
    createPartnerListingSchema.safeParse({
      organization_id: '33333333-3333-4333-8333-333333333333',
      kind: 'pharmacy',
      trade_name: 'FarmaVet',
      city: 'São Paulo',
      state: 'SP',
      coupon_code: 'INVALIDO!',
      discount_percent: 95,
    }).success,
    false,
  );

  assert.equal(
    createAdCampaignSchema.safeParse({
      organization_id: '33333333-3333-4333-8333-333333333333',
      title: 'Campanha Vacinação',
      placement: 'booking_sidebar',
      budget_cents: 50000,
      starts_on: '2026-11-24',
    }).success,
    true,
  );

  assert.equal(
    updateAdCampaignStatusSchema.safeParse({
      campaignId: '44444444-4444-4444-8444-444444444444',
      status: 'paused',
    }).success,
    true,
  );

  assert.equal(
    issuePrescriptionSchema.safeParse({
      appointment_id: 'not-a-uuid',
    }).success,
    false,
  );
});

test('maskPixKeyForDisplay hides sensitive segments of PIX keys without exposing full values', () => {
  assert.equal(maskPixKeyForDisplay('123456'), '***');
  assert.equal(maskPixKeyForDisplay('ab@clinic.vet.br'), 'a*@clinic.vet.br');
  assert.equal(maskPixKeyForDisplay('dra.ana@clinic.vet.br'), 'dr***@clinic.vet.br');
  assert.equal(maskPixKeyForDisplay('12345678901'), '123••••8901');
  assert.equal(maskPixKeyForDisplay('550e8400-e29b-41d4-a716-446655440000'), '550••••0000');
  assert.equal(maskPixKeyForDisplay('bad@'), '***');
});

test('SSRF guards block loopback, private, metadata, and non-HTTP URLs', async () => {
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('10.0.0.5'), true);
  assert.equal(isPrivateIpAddress('169.254.169.254'), true);
  assert.equal(isPrivateIpAddress('192.168.1.10'), true);
  assert.equal(isPrivateIpAddress('172.20.0.1'), true);
  assert.equal(isPrivateIpAddress('::1'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);

  const blockedLocalhost = await validateSafeExternalUrl('http://localhost:3000/webhook');
  assert.equal(blockedLocalhost.valid, false);

  const blockedMetadata = await validateSafeExternalUrl('http://169.254.169.254/latest/meta-data');
  assert.equal(blockedMetadata.valid, false);

  const blockedScheme = await validateSafeExternalUrl('file:///etc/passwd');
  assert.equal(blockedScheme.valid, false);

  const allowedPublicIp = await validateSafeExternalUrl('https://1.1.1.1/webhook');
  assert.equal(allowedPublicIp.valid, true);
});

test('admin and commissions Zod schemas reject invalid roles, providers, and malformed payloads', () => {
  assert.equal(
    adminUpdateUserRoleSchema.safeParse({
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'veterinarian',
    }).success,
    true,
  );
  assert.equal(
    adminUpdateUserRoleSchema.safeParse({
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'superadmin',
    }).success,
    false,
  );

  assert.equal(
    adminReviewRoleApplicationSchema.safeParse({
      applicationId: '22222222-2222-4222-8222-222222222222',
      approve: true,
      notes: 'CRMV validado.',
    }).success,
    true,
  );

  assert.equal(
    saveIntegrationConfigSchema.safeParse({
      organization_id: null,
      provider: 'asaas',
      environment: 'sandbox',
      webhook_endpoint: 'https://api.drvet.example.com/webhooks/asaas',
      active: true,
    }).success,
    true,
  );
  assert.equal(
    saveIntegrationConfigSchema.safeParse({
      provider: 'unknown_gw',
      environment: 'sandbox',
      webhook_endpoint: 'not-a-url',
      active: true,
    }).success,
    false,
  );

  assert.equal(
    strictPayoutAccountSchema.safeParse({
      provider: 'mercadopago',
      payout_account_label: 'Banco Inter - Clínica Vet',
      pix_key: 'financeiro@clinicavet.com.br',
    }).success,
    true,
  );
  assert.equal(
    strictPayoutAccountSchema.safeParse({
      provider: 'stripe',
      payout_account_label: 'Conta',
      pix_key: '123',
    }).success,
    false,
  );
});

test('fiscal invoice, vet self-profile, and role application schemas enforce bounds and UF rules', () => {
  assert.equal(
    fiscalInvoiceSchema.safeParse({
      period_label: '2026-11',
      total_cents: 45000,
      tax_id: '12345678000195',
      provider: 'drvet_fiscal',
    }).success,
    true,
  );
  assert.equal(
    fiscalInvoiceSchema.safeParse({
      period_label: '2026-11',
      total_cents: 0,
      tax_id: '123',
      provider: 'drvet_fiscal',
    }).success,
    false,
  );

  assert.equal(
    updateFiscalInvoiceStatusSchema.safeParse({
      invoiceId: '55555555-5555-4555-8555-555555555555',
      status: 'issued',
    }).success,
    true,
  );

  assert.equal(
    vetProfileSettingsSchema.safeParse({
      consultation_fee_cents: 15000,
      bio: 'Clínica geral e dermatologia.',
      is_online_now: true,
    }).success,
    true,
  );
  assert.equal(
    vetProfileSettingsSchema.safeParse({
      consultation_fee_cents: 500,
    }).success,
    false,
  );

  // Veterinarian role application must include valid 2-letter CRMV UF
  assert.equal(
    strictRoleApplicationSchema.safeParse({
      requested_role: 'veterinarian',
      organization_name: 'Clínica Vida Vet',
      document_id: '12345',
      registration_region: 'sp',
      state: 'sp',
    }).success,
    true,
  );
  assert.equal(
    strictRoleApplicationSchema.safeParse({
      requested_role: 'veterinarian',
      organization_name: 'Clínica Vida Vet',
      document_id: '12345',
      registration_region: null,
    }).success,
    false,
  );
  assert.equal(
    strictRoleApplicationSchema.safeParse({
      requested_role: 'partner',
      organization_name: 'Pet Farma Brasil',
      document_id: '12.345.678/0001-95',
      state: 'rj',
    }).success,
    true,
  );
});

test('recent verified prescription cache caps at 5 items, deduplicates, and rejects malformed JSON', () => {
  assert.equal(MAX_RECENT_VERIFIED_CODES, 5);
  assert.deepEqual(parseRecentVerifiedCodes('not-valid-json'), []);
  assert.deepEqual(
    parseRecentVerifiedCodes(
      JSON.stringify([
        {
          code: '<script>',
          verifiedAt: '2026-11-25T10:00:00.000Z',
          result: {
            verification_code: '<script>',
            status: 'issued',
            issued_at: '2026-11-25T09:00:00.000Z',
            pet_name: 'Thor',
            species: 'Cão',
            veterinarian_name: 'Dra. Ana',
            crmv: 'CRMV-SP 1234',
            items_count: 1,
          },
        },
      ]),
    ),
    [],
  );

  let entries = parseRecentVerifiedCodes(null);
  for (let i = 1; i <= 7; i += 1) {
    entries = upsertRecentVerifiedCode(
      entries,
      {
        verification_code: `rx-000${i}`,
        status: 'issued',
        issued_at: `2026-11-25T0${i}:00:00.000Z`,
        pet_name: `Pet ${i}`,
        species: 'Cão',
        veterinarian_name: 'Dra. Ana',
        crmv: 'CRMV-SP 1234',
        items_count: i,
      },
      `2026-11-25T1${i}:00:00.000Z`,
    );
  }

  assert.equal(entries.length, 5);
  assert.deepEqual(
    entries.map((item) => item.code),
    ['RX-0007', 'RX-0006', 'RX-0005', 'RX-0004', 'RX-0003'],
  );

  // Re-validating an older cached code moves it back to index 0 without creating a duplicate
  entries = upsertRecentVerifiedCode(
    entries,
    {
      verification_code: 'RX-0004',
      status: 'issued',
      issued_at: '2026-11-25T04:00:00.000Z',
      pet_name: 'Pet 4',
      species: 'Cão',
      veterinarian_name: 'Dra. Ana',
      crmv: 'CRMV-SP 1234',
      items_count: 4,
    },
    '2026-11-25T19:00:00.000Z',
  );
  assert.equal(entries.length, 5);
  assert.equal(entries[0]?.code, 'RX-0004');

  const roundTripped = parseRecentVerifiedCodes(JSON.stringify(entries));
  assert.equal(roundTripped.length, 5);
  assert.equal(findCachedVerifiedPrescription(roundTripped, ' rx-0004 ')?.result.pet_name, 'Pet 4');

  const afterRemove = removeRecentVerifiedCode(roundTripped, 'RX-0004');
  assert.equal(afterRemove.length, 4);
  assert.equal(findCachedVerifiedPrescription(afterRemove, 'RX-0004'), null);
});

test('subscription, teleconsultation session, and availability schemas enforce strict fields and exclude recording_consent', () => {
  assert.equal(
    subscribePetPlanSchema.safeParse({
      planId: '11111111-1111-4111-8111-111111111111',
      petId: '22222222-2222-4222-8222-222222222222',
      method: 'pix',
    }).success,
    true,
  );
  assert.equal(
    subscribePetPlanSchema.safeParse({
      planId: '11111111-1111-4111-8111-111111111111',
      petId: '22222222-2222-4222-8222-222222222222',
      method: 'cash',
    }).success,
    false,
  );

  assert.equal(
    updateSubscriptionStatusSchema.safeParse({
      subscriptionId: '33333333-3333-4333-8333-333333333333',
      status: 'paused',
    }).success,
    true,
  );

  assert.equal(
    openTeleconsultationSessionSchema.safeParse({
      appointmentId: '44444444-4444-4444-8444-444444444444',
    }).success,
    true,
  );

  assert.equal(
    updateTeleconsultationSessionSchema.safeParse({
      sessionId: '55555555-5555-4555-8555-555555555555',
      status: 'in_progress',
      notes: 'Tutor conectado e áudio verificado.',
    }).success,
    true,
  );
  // Empty patch without status or notes must fail
  assert.equal(
    updateTeleconsultationSessionSchema.safeParse({
      sessionId: '55555555-5555-4555-8555-555555555555',
    }).success,
    false,
  );
  // Strict schema must block recording_consent tampering
  assert.equal(
    updateTeleconsultationSessionSchema.safeParse({
      sessionId: '55555555-5555-4555-8555-555555555555',
      status: 'in_progress',
      recording_consent: true,
    }).success,
    false,
  );

  assert.equal(
    deleteAvailabilitySchema.safeParse({
      id: '66666666-6666-4666-8666-666666666666',
    }).success,
    true,
  );
});

test('teleconsultation status transition and ownership helpers block invalid state rollbacks and unauthorized actors', () => {
  assert.equal(canTransitionTeleconsultationStatus('waiting', 'in_progress'), true);
  assert.equal(canTransitionTeleconsultationStatus('in_progress', 'ended'), true);
  assert.equal(canTransitionTeleconsultationStatus('waiting', 'ended'), true);
  assert.equal(canTransitionTeleconsultationStatus('ended', 'ended'), true);
  assert.equal(canTransitionTeleconsultationStatus('ended', 'in_progress'), false);
  assert.equal(canTransitionTeleconsultationStatus('ended', 'waiting'), false);

  assert.equal(
    canManageSubscriptionStatus({
      actorId: 'tutor-1',
      actorRole: 'tutor',
      subscriptionOwnerId: 'tutor-1',
    }),
    true,
  );
  assert.equal(
    canManageSubscriptionStatus({
      actorId: 'tutor-2',
      actorRole: 'tutor',
      subscriptionOwnerId: 'tutor-1',
    }),
    false,
  );
  assert.equal(
    canManageSubscriptionStatus({
      actorId: 'admin-1',
      actorRole: 'admin',
      subscriptionOwnerId: 'tutor-1',
    }),
    true,
  );

  assert.equal(
    canManageTeleconsultationSession({
      actorId: 'vet-1',
      actorRole: 'veterinarian',
      sessionVeterinarianId: 'vet-1',
    }),
    true,
  );
  assert.equal(
    canManageTeleconsultationSession({
      actorId: 'tutor-1',
      actorRole: 'tutor',
      sessionVeterinarianId: 'vet-1',
    }),
    false,
  );
});

test('extractPrescriptionCodeFromQrValue extracts valid DrVet verification codes from URLs and raw payloads', () => {
  assert.equal(extractPrescriptionCodeFromQrValue('rx-8a2c91e0f4'), 'RX-8A2C91E0F4');
  assert.equal(
    extractPrescriptionCodeFromQrValue(
      'https://app.drvet.com.br/receitas/verificar?code=RX-8A2C91E0F4',
    ),
    'RX-8A2C91E0F4',
  );
  assert.equal(
    extractPrescriptionCodeFromQrValue('/receitas/verificar?code=rx-99bb11cc'),
    'RX-99BB11CC',
  );
  assert.equal(
    extractPrescriptionCodeFromQrValue('Receita emitida código RX-1234ABCD.'),
    'RX-1234ABCD',
  );
  assert.equal(extractPrescriptionCodeFromQrValue('https://example.com/?x=1'), null);
  assert.equal(extractPrescriptionCodeFromQrValue('<script>alert(1)</script>'), null);
});

test('teleconsultation chat guard, legal acknowledgement, self-profile, and partner attribution schemas enforce RBAC and bounds', () => {
  assert.deepEqual(
    canPostTeleconsultationMessage({
      actorId: 'tutor-1',
      actorRole: 'tutor',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      sessionStatus: 'in_progress',
    }),
    { allowed: true },
  );
  assert.equal(
    canPostTeleconsultationMessage({
      actorId: 'intruder-1',
      actorRole: 'tutor',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      sessionStatus: 'waiting',
    }).allowed,
    false,
  );
  assert.equal(
    canPostTeleconsultationMessage({
      actorId: 'vet-1',
      actorRole: 'veterinarian',
      tutorId: 'tutor-1',
      veterinarianId: 'vet-1',
      sessionStatus: 'ended',
    }).allowed,
    false,
  );

  assert.equal(
    sendTeleconsultationMessageSchema.safeParse({
      sessionId: '77777777-7777-4777-8777-777777777777',
      message: 'Temperatura normalizada e hidratação orientada.',
    }).success,
    true,
  );
  assert.equal(
    sendTeleconsultationMessageSchema.safeParse({
      sessionId: '77777777-7777-4777-8777-777777777777',
      message: '   ',
    }).success,
    false,
  );

  assert.equal(
    legalAcknowledgementSchema.safeParse({
      documentKey: 'terms_of_use_telemedicina',
      documentVersion: '2026.1',
    }).success,
    true,
  );
  assert.equal(
    legalAcknowledgementSchema.safeParse({
      documentKey: 'invalid key with spaces',
      documentVersion: '1.0',
    }).success,
    false,
  );

  const validCoupon = recordPartnerAttributionSchema.safeParse({
    couponCode: 'drvet15',
  });
  assert.equal(validCoupon.success, true);
  if (validCoupon.success) {
    assert.equal(validCoupon.data.couponCode, 'DRVET15');
  }
  assert.equal(
    recordPartnerAttributionSchema.safeParse({
      couponCode: 'bad code!',
    }).success,
    false,
  );

  // Strict profile update schema must reject attempts to escalate role
  assert.equal(
    updateProfileSchema.strict().safeParse({
      display_name: 'Maria Clara',
      phone: '11999990000',
      role: 'admin',
    }).success,
    false,
  );
});

test('facial biometric descriptor extraction, liveness checks, and cosine similarity behave deterministically', () => {
  const size = 64;
  const baseFrame = new Uint8ClampedArray(size * size);
  const brightFrame = new Uint8ClampedArray(size * size);
  const invertedFrame = new Uint8ClampedArray(size * size);
  const darkFrame = new Uint8ClampedArray(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      // Structured face-like radial + left/right eye-bridge gradient
      const val = Math.round(90 + ((x * 3 + y * 5) % 90));
      baseFrame[idx] = val;
      brightFrame[idx] = Math.min(250, val + 25);
      invertedFrame[idx] = 220 - val;
      darkFrame[idx] = 8;
    }
  }

  const d1 = computeFaceDescriptorFromLumaGrid(baseFrame, size, size);
  const d2 = computeFaceDescriptorFromLumaGrid(brightFrame, size, size);
  const dInverted = computeFaceDescriptorFromLumaGrid(invertedFrame, size, size);

  assert.equal(d1.length, FACIAL_DESCRIPTOR_DIMENSION);
  const norm = Math.sqrt(d1.reduce((acc, v) => acc + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-3);

  const sameFaceSim = computeDescriptorSimilarity(d1, d2);
  const diffFaceSim = computeDescriptorSimilarity(d1, dInverted);
  assert.ok(sameFaceSim >= FACIAL_MATCH_THRESHOLD);
  assert.ok(diffFaceSim < 0.25);

  assert.equal(assessFacialLiveness(darkFrame, darkFrame).passed, false);
  const goodLiveness = assessFacialLiveness(baseFrame, brightFrame);
  assert.equal(goodLiveness.passed, true);
  assert.ok(goodLiveness.score >= 0.55);
});

test('avatarPathSchema and facial biometrics Zod schemas enforce strict storage and descriptor bounds', () => {
  assert.equal(
    avatarPathSchema.safeParse('11111111-1111-4111-8111-111111111111/vet-foto.webp').success,
    true,
  );
  assert.equal(
    avatarPathSchema.safeParse('../etc/passwd').success,
    false,
  );
  assert.equal(
    avatarPathSchema.safeParse('not-a-uuid/photo.png').success,
    false,
  );

  const validVector = new Array(64).fill(0.125);
  const validHash = 'a'.repeat(64);

  assert.equal(
    enrollFacialBiometricsSchema.safeParse({
      template_hash: validHash,
      descriptor_vector: validVector,
      liveness_score: 0.85,
      device_label: 'Chrome Webcam',
    }).success,
    true,
  );
  assert.equal(
    enrollFacialBiometricsSchema.safeParse({
      template_hash: 'bad-hash',
      descriptor_vector: validVector,
      liveness_score: 0.85,
    }).success,
    false,
  );
  assert.equal(
    enrollFacialBiometricsSchema.safeParse({
      template_hash: validHash,
      descriptor_vector: validVector,
      liveness_score: 0.2,
    }).success,
    false,
  );
  assert.equal(
    verifyFacialBiometricsSchema.safeParse({
      descriptor_vector: validVector,
      liveness_score: 0.78,
      extra_field: 'tamper',
    }).success,
    false,
  );
});

test('individual vet agenda digest strictly isolates each veterinarian appointments and slots', () => {
  const vetA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const vetB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const orgId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const now = new Date('2026-11-26T12:00:00.000Z');

  const appointments = [
    {
      id: 'apt-a-1',
      availability_id: 'slot-a-1',
      organization_id: orgId,
      pet_id: 'pet-1',
      tutor_id: 'tutor-1',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Acompanhamento dermatológico',
      starts_at: '2026-11-27T14:00:00.000Z',
      ends_at: '2026-11-27T15:00:00.000Z',
      pet: { id: 'pet-1', name: 'Thor', species: 'cachorro' },
    },
    {
      id: 'apt-a-2',
      availability_id: 'slot-a-2',
      organization_id: orgId,
      pet_id: 'pet-2',
      tutor_id: 'tutor-2',
      veterinarian_id: vetA,
      kind: 'in_person' as const,
      status: 'pending' as const,
      reason: null,
      starts_at: '2026-11-28T10:00:00.000Z',
      ends_at: '2026-11-28T11:00:00.000Z',
      pet: { id: 'pet-2', name: 'Mia', species: 'gato' },
    },
    {
      id: 'apt-b-1',
      availability_id: 'slot-b-1',
      organization_id: orgId,
      pet_id: 'pet-3',
      tutor_id: 'tutor-3',
      veterinarian_id: vetB,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Outro veterinário não deve aparecer no comunicado do vet A',
      starts_at: '2026-11-26T15:00:00.000Z',
      ends_at: '2026-11-26T16:00:00.000Z',
      pet: { id: 'pet-3', name: 'RexOutroVet', species: 'cachorro' },
    },
  ];

  const slots = [
    {
      id: 'slot-a-open',
      organization_id: orgId,
      veterinarian_id: vetA,
      starts_at: '2026-11-29T13:00:00.000Z',
      ends_at: '2026-11-29T14:00:00.000Z',
      is_available: true,
      is_blocked: false,
      block_reason: null,
    },
    {
      id: 'slot-a-blocked',
      organization_id: orgId,
      veterinarian_id: vetA,
      starts_at: '2026-11-30T13:00:00.000Z',
      ends_at: '2026-11-30T14:00:00.000Z',
      is_available: true,
      is_blocked: true,
      block_reason: 'Congresso',
    },
    {
      id: 'slot-b-open',
      organization_id: orgId,
      veterinarian_id: vetB,
      starts_at: '2026-11-29T16:00:00.000Z',
      ends_at: '2026-11-29T17:00:00.000Z',
      is_available: true,
      is_blocked: false,
      block_reason: null,
    },
  ];

  assert.equal(filterAppointmentsForVeterinarian(appointments, vetA).length, 2);
  assert.equal(filterAvailabilityForVeterinarian(slots, vetB).length, 1);

  const digestA = buildIndividualVetAgendaDigest({
    veterinarianId: vetA,
    veterinarianName: 'Dra. Helena Costa',
    crmvLabel: 'CRMV-SP 54321',
    appointments,
    slots,
    now,
  });

  assert.equal(digestA.confirmedNext7Days, 1);
  assert.equal(digestA.pendingNext7Days, 1);
  assert.equal(digestA.openFutureSlots, 1);
  assert.equal(digestA.blockedFutureSlots, 1);
  assert.equal(digestA.nextAppointment?.petName, 'Thor');
  assert.equal(digestA.body.includes('RexOutroVet'), false);
  assert.equal(digestA.title.includes('Dra. Helena Costa'), true);

  assert.equal(isVetAgendaNotificationKind('vet_agenda_summary'), true);
  assert.equal(isVetAgendaNotificationKind('vet_agenda_reminder'), true);
  assert.equal(isVetAgendaNotificationKind('vet_queue_new'), true);
  assert.equal(isVetAgendaNotificationKind('appointment_reminder'), false);

  assert.equal(dispatchVetAgendaCommunicadoSchema.safeParse({ force: true }).success, true);
  assert.equal(
    dispatchVetAgendaCommunicadoSchema.safeParse({
      force: true,
      veterinarian_id: vetB,
    }).success,
    false,
  );
});

test('summarizeVetConsultations computes today total, waiting, in-progress, and completed per veterinarian', () => {
  const vetA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const vetB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const orgId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  // 2026-11-26 15:00 America/Sao_Paulo = 2026-11-26T18:00:00.000Z
  const now = new Date('2026-11-26T18:00:00.000Z');
  assert.equal(toClinicDateKey(now, 'America/Sao_Paulo'), '2026-11-26');
  // 2026-11-27T01:30:00.000Z is 2026-11-26 22:30 in America/Sao_Paulo
  assert.equal(toClinicDateKey('2026-11-27T01:30:00.000Z', 'America/Sao_Paulo'), '2026-11-26');

  const appointments = [
    {
      id: 'apt-today-completed',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-1',
      tutor_id: 'tutor-1',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'completed' as const,
      reason: 'Retorno',
      starts_at: '2026-11-26T13:00:00.000Z',
      ends_at: '2026-11-26T13:30:00.000Z',
      pet: { id: 'pet-1', name: 'Thor', species: 'cachorro' },
    },
    {
      id: 'apt-today-window-active',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-2',
      tutor_id: 'tutor-2',
      veterinarian_id: vetA,
      kind: 'in_person' as const,
      status: 'confirmed' as const,
      reason: 'Vacinação',
      starts_at: '2026-11-26T17:45:00.000Z',
      ends_at: '2026-11-26T18:30:00.000Z',
      pet: { id: 'pet-2', name: 'Mia', species: 'gato' },
    },
    {
      id: 'apt-today-session-active',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-3',
      tutor_id: 'tutor-3',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Teleorientação',
      starts_at: '2026-11-26T19:00:00.000Z',
      ends_at: '2026-11-26T19:30:00.000Z',
      pet: { id: 'pet-3', name: 'Luna', species: 'cachorro' },
    },
    {
      id: 'apt-today-pending-evening-brt',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-4',
      tutor_id: 'tutor-4',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'pending' as const,
      reason: 'Triagem noturna',
      starts_at: '2026-11-27T01:30:00.000Z', // 22:30 BRT on 2026-11-26
      ends_at: '2026-11-27T02:00:00.000Z',
      pet: { id: 'pet-4', name: 'Bidu', species: 'cachorro' },
    },
    {
      id: 'apt-today-cancelled',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-5',
      tutor_id: 'tutor-5',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'cancelled' as const,
      reason: 'Cancelada',
      starts_at: '2026-11-26T20:00:00.000Z',
      ends_at: '2026-11-26T20:30:00.000Z',
      pet: { id: 'pet-5', name: 'Pipoca', species: 'gato' },
    },
    {
      id: 'apt-tomorrow-pending',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-6',
      tutor_id: 'tutor-6',
      veterinarian_id: vetA,
      kind: 'in_person' as const,
      status: 'pending' as const,
      reason: 'Amanhã',
      starts_at: '2026-11-27T14:00:00.000Z',
      ends_at: '2026-11-27T14:30:00.000Z',
      pet: { id: 'pet-6', name: 'Nina', species: 'cachorro' },
    },
    {
      id: 'apt-other-vet-today',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-7',
      tutor_id: 'tutor-7',
      veterinarian_id: vetB,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Outro profissional',
      starts_at: '2026-11-26T18:00:00.000Z',
      ends_at: '2026-11-26T18:30:00.000Z',
      pet: { id: 'pet-7', name: 'Rex', species: 'cachorro' },
    },
  ];

  const summary = summarizeVetConsultations({
    appointments,
    inProgressAppointmentIds: ['apt-today-session-active'],
    veterinarianId: vetA,
    now,
    timeZone: 'America/Sao_Paulo',
  });

  assert.equal(summary.todayTotal, 4);
  assert.equal(summary.waiting, 2);
  assert.equal(summary.pendingConfirmation, 2);
  assert.equal(summary.inProgress, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.todayWaiting, 1);
  assert.equal(summary.todayInProgress, 2);
  assert.equal(summary.todayCompleted, 1);
  assert.equal(summary.referenceDateKey, '2026-11-26');
});

test('daily consultation goal helpers isolate keys per veterinarian, clamp bounds, and compute progress', () => {
  assert.equal(clampDailyConsultationGoal(undefined), DEFAULT_DAILY_CONSULTATION_GOAL);
  assert.equal(clampDailyConsultationGoal('abc'), DEFAULT_DAILY_CONSULTATION_GOAL);
  assert.equal(clampDailyConsultationGoal(0), DEFAULT_DAILY_CONSULTATION_GOAL);
  assert.equal(clampDailyConsultationGoal(-5), DEFAULT_DAILY_CONSULTATION_GOAL);
  assert.equal(clampDailyConsultationGoal(99), MAX_DAILY_CONSULTATION_GOAL);
  assert.equal(clampDailyConsultationGoal('12'), 12);
  assert.equal(clampDailyConsultationGoal(1), MIN_DAILY_CONSULTATION_GOAL);

  assert.equal(
    getVetDailyGoalStorageKey('vet-1'),
    'drvet:vet-daily-goal:v1:vet-1',
  );
  assert.notEqual(
    getVetDailyGoalStorageKey('vet-1'),
    getVetDailyGoalStorageKey('vet-2'),
  );
  assert.equal(parseStoredDailyConsultationGoal('15'), 15);
  assert.equal(parseStoredDailyConsultationGoal('invalid', 10), 10);

  assert.deepEqual(buildDailyGoalSelectOptions(7), [4, 6, 7, 8, 10, 12, 15, 20]);
  assert.deepEqual(buildDailyGoalSelectOptions(8), [4, 6, 8, 10, 12, 15, 20]);

  const partial = calculateDailyGoalProgress(4, 8);
  assert.deepEqual(partial, {
    goal: 8,
    todayTotal: 4,
    percent: 50,
    rawPercent: 50,
    remaining: 4,
    exceededBy: 0,
    reached: false,
  });

  const exact = calculateDailyGoalProgress(8, 8);
  assert.equal(exact.reached, true);
  assert.equal(exact.percent, 100);
  assert.equal(exact.remaining, 0);
  assert.equal(exact.exceededBy, 0);

  const exceeded = calculateDailyGoalProgress(10, 8);
  assert.equal(exceeded.reached, true);
  assert.equal(exceeded.percent, 100);
  assert.equal(exceeded.rawPercent, 125);
  assert.equal(exceeded.exceededBy, 2);
});

test('vet 30-min reminder selector filters due window, builds deduplicated keys, and escapes email HTML safely', () => {
  assert.equal(VET_REMINDER_LEAD_MINUTES, 30);
  assert.equal(normalizeVetReminderChannel('push'), 'push');
  assert.equal(normalizeVetReminderChannel('email'), 'email');
  assert.equal(normalizeVetReminderChannel('both'), 'both');
  assert.equal(normalizeVetReminderChannel('sms', 'both'), 'both');

  assert.equal(isVetAutoReminderEnabled(undefined), true);
  assert.equal(isVetAutoReminderEnabled(true), true);
  assert.equal(isVetAutoReminderEnabled(false), false);
  assert.equal(isVetAutoReminderEnabled('false'), false);

  const now = new Date('2026-11-26T15:00:00.000Z');
  const orgId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const vetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const appointments = [
    {
      id: 'apt-due-20m',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-1',
      tutor_id: 'tutor-1',
      veterinarian_id: vetId,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Dermatologia',
      starts_at: '2026-11-26T15:20:00.000Z', // +20m => due
      ends_at: '2026-11-26T15:50:00.000Z',
      pet: { id: 'pet-1', name: 'Thor', species: 'cachorro' },
    },
    {
      id: 'apt-due-grace-3m-ago',
      availability_id: 'slot-2',
      organization_id: orgId,
      pet_id: 'pet-2',
      tutor_id: 'tutor-2',
      veterinarian_id: vetId,
      kind: 'in_person' as const,
      status: 'pending' as const,
      reason: 'Retorno',
      starts_at: '2026-11-26T14:57:00.000Z', // -3m (within 5m grace) => due
      ends_at: '2026-11-26T15:27:00.000Z',
      pet: { id: 'pet-2', name: 'Mia', species: 'gato' },
    },
    {
      id: 'apt-too-far-45m',
      availability_id: 'slot-3',
      organization_id: orgId,
      pet_id: 'pet-3',
      tutor_id: 'tutor-3',
      veterinarian_id: vetId,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Ainda longe',
      starts_at: '2026-11-26T15:45:00.000Z', // +45m => excluded
      ends_at: '2026-11-26T16:15:00.000Z',
      pet: { id: 'pet-3', name: 'Luna', species: 'cachorro' },
    },
    {
      id: 'apt-too-old-10m-ago',
      availability_id: 'slot-4',
      organization_id: orgId,
      pet_id: 'pet-4',
      tutor_id: 'tutor-4',
      veterinarian_id: vetId,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Passada',
      starts_at: '2026-11-26T14:50:00.000Z', // -10m => excluded
      ends_at: '2026-11-26T15:20:00.000Z',
      pet: { id: 'pet-4', name: 'Bob', species: 'cachorro' },
    },
    {
      id: 'apt-cancelled-10m',
      availability_id: 'slot-5',
      organization_id: orgId,
      pet_id: 'pet-5',
      tutor_id: 'tutor-5',
      veterinarian_id: vetId,
      kind: 'teleconsultation' as const,
      status: 'cancelled' as const,
      reason: 'Cancelada',
      starts_at: '2026-11-26T15:10:00.000Z',
      ends_at: '2026-11-26T15:40:00.000Z',
      pet: { id: 'pet-5', name: 'Pipoca', species: 'gato' },
    },
    {
      id: 'apt-completed-10m',
      availability_id: 'slot-6',
      organization_id: orgId,
      pet_id: 'pet-6',
      tutor_id: 'tutor-6',
      veterinarian_id: vetId,
      kind: 'in_person' as const,
      status: 'completed' as const,
      reason: 'Finalizada',
      starts_at: '2026-11-26T15:10:00.000Z',
      ends_at: '2026-11-26T15:40:00.000Z',
      pet: { id: 'pet-6', name: 'Nina', species: 'cachorro' },
    },
  ];

  const due = filterAppointmentsDueForVet30MinReminder(appointments, now);
  assert.deepEqual(
    due.map((item) => item.id),
    ['apt-due-grace-3m-ago', 'apt-due-20m'],
  );

  assert.equal(
    getVet30MinReminderDedupeKey('apt-due-20m'),
    'vet-reminder-apt-due-20m-30',
  );

  assert.equal(
    escapeHtml('<script>alert("x")</script> & \'test\''),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;',
  );

  const teleContent = buildVet30MinReminderContent({
    appointment: appointments[0],
    petName: '<script>Thor</script>',
    tutorName: 'Maria & João',
    veterinarianName: 'Dra. Helena',
  });

  assert.equal(teleContent.dedupeKey, 'vet-reminder-apt-due-20m-30');
  assert.equal(teleContent.actionUrl, '/teleconsulta?appointmentId=apt-due-20m');
  assert.equal(teleContent.emailHtml.includes('<script>'), false);
  assert.equal(teleContent.emailHtml.includes('&lt;script&gt;Thor&lt;/script&gt;'), true);
  assert.equal(teleContent.emailHtml.includes('Maria &amp; João'), true);
  assert.equal(
    teleContent.emailText.includes('/teleconsulta?appointmentId=apt-due-20m'),
    true,
  );

  const inPersonContent = buildVet30MinReminderContent({
    appointment: appointments[1],
    petName: 'Mia',
  });
  assert.equal(inPersonContent.actionUrl, '/agenda');
});

test('cron secret verifier and vetReminderSettingsSchema validate tokens and strict preferences', () => {
  assert.equal(verifyCronSecretToken('cron-secret-123', 'cron-secret-123'), true);
  assert.equal(verifyCronSecretToken('cron-secret-124', 'cron-secret-123'), false);
  assert.equal(verifyCronSecretToken('', 'cron-secret-123'), false);
  assert.equal(verifyCronSecretToken(null, 'cron-secret-123'), false);
  assert.equal(verifyCronSecretToken('cron-secret-123', undefined), false);

  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'email',
      enabled: true,
      syncNow: true,
    }).success,
    true,
  );
  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'whatsapp',
      whatsappPhone: '(11) 99999-8888',
    }).success,
    true,
  );
  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'all',
      whatsappPhone: '+5511999998888',
    }).success,
    true,
  );
  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'sms',
    }).success,
    false,
  );
  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'whatsapp',
      whatsappPhone: 'invalid-phone',
    }).success,
    false,
  );
  assert.equal(
    vetReminderSettingsSchema.safeParse({
      channel: 'both',
      unexpectedField: 'tamper',
    }).success,
    false,
  );
});

test('vet offline IndexedDB cache helpers isolate veterinarian entries, prune stale dates, and support offline SOAP search', () => {
  const vetA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const vetB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const orgId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const now = new Date('2026-11-26T15:00:00.000Z');

  assert.equal(buildAppointmentCacheKey(vetA, 'apt-1'), `${vetA}:apt-1`);
  assert.equal(buildBasicRecordCacheKey(vetA, 'apt-1'), `${vetA}:apt-1`);

  const appointments = [
    {
      id: 'apt-recent-past',
      availability_id: 'slot-1',
      organization_id: orgId,
      pet_id: 'pet-1',
      tutor_id: 'tutor-1',
      veterinarian_id: vetA,
      kind: 'teleconsultation' as const,
      status: 'completed' as const,
      reason: 'Revisão dermatológica',
      starts_at: '2026-11-16T14:00:00.000Z', // 10 days ago => kept
      ends_at: '2026-11-16T14:30:00.000Z',
      pet: { id: 'pet-1', name: 'Pingo', species: 'cachorro' },
    },
    {
      id: 'apt-very-old',
      availability_id: 'slot-2',
      organization_id: orgId,
      pet_id: 'pet-2',
      tutor_id: 'tutor-2',
      veterinarian_id: vetA,
      kind: 'in_person' as const,
      status: 'completed' as const,
      reason: 'Antigo > 30 dias',
      starts_at: '2026-09-01T14:00:00.000Z', // > 30 days ago => pruned
      ends_at: '2026-09-01T14:30:00.000Z',
      pet: { id: 'pet-2', name: 'Bidu', species: 'cachorro' },
    },
    {
      id: 'apt-upcoming',
      availability_id: 'slot-3',
      organization_id: orgId,
      pet_id: 'pet-3',
      tutor_id: 'tutor-3',
      veterinarian_id: vetA,
      kind: 'in_person' as const,
      status: 'confirmed' as const,
      reason: 'Vacinação anual',
      starts_at: '2026-11-27T10:00:00.000Z',
      ends_at: '2026-11-27T10:30:00.000Z',
      pet: { id: 'pet-3', name: 'Amora', species: 'gato' },
    },
    {
      id: 'apt-other-vet',
      availability_id: 'slot-4',
      organization_id: orgId,
      pet_id: 'pet-4',
      tutor_id: 'tutor-4',
      veterinarian_id: vetB,
      kind: 'teleconsultation' as const,
      status: 'confirmed' as const,
      reason: 'Outro veterinário',
      starts_at: '2026-11-27T11:00:00.000Z',
      ends_at: '2026-11-27T11:30:00.000Z',
      pet: { id: 'pet-4', name: 'RexOutroVet', species: 'cachorro' },
    },
  ];

  const cachedAppts = pruneVetAppointmentsForCache(appointments, vetA, now);
  assert.deepEqual(
    cachedAppts.map((item) => item.id),
    ['apt-recent-past', 'apt-upcoming'],
  );
  assert.equal(cachedAppts[0]?.cache_key, `${vetA}:apt-recent-past`);

  const offlineSearchAppts = filterCachedAppointments(cachedAppts, {
    q: 'dermatologica',
    status: 'completed',
  });
  assert.deepEqual(
    offlineSearchAppts.map((item) => item.id),
    ['apt-recent-past'],
  );

  const records = [
    {
      id: 'rec-old-draft',
      appointment_id: 'apt-recent-past',
      organization_id: orgId,
      pet_id: 'pet-1',
      veterinarian_id: vetA,
      subjective: 'Prurido leve',
      objective: 'Eritema dorsal',
      assessment: 'Dermatite alérgica',
      plan: 'Hidratação e retorno em 7 dias',
      vitals: {
        weight_kg: 11.5,
        temperature_c: 38.4,
        heart_rate_bpm: 110,
        respiratory_rate_rpm: 24,
        mucous_membranes: 'Normocoradas',
        capillary_refill_seconds: 1.5,
      },
      status: 'draft' as const,
      finalized_at: null,
      created_at: '2026-11-16T14:15:00.000Z',
      updated_at: '2026-11-16T14:20:00.000Z',
      pet: { id: 'pet-1', name: 'Pingo', species: 'cachorro' },
    },
    {
      id: 'rec-newer-finalized',
      appointment_id: 'apt-recent-past',
      organization_id: orgId,
      pet_id: 'pet-1',
      veterinarian_id: vetA,
      subjective: 'Prurido resolvido',
      objective: 'Pele íntegra',
      assessment: 'Melhora clínica completa',
      plan: 'Alta ambulatorial',
      vitals: {
        weight_kg: 11.7,
        temperature_c: 38.3,
        heart_rate_bpm: 105,
        respiratory_rate_rpm: 22,
        mucous_membranes: 'Normocoradas',
        capillary_refill_seconds: 1.5,
      },
      status: 'finalized' as const,
      finalized_at: '2026-11-16T15:00:00.000Z',
      created_at: '2026-11-16T14:15:00.000Z',
      updated_at: '2026-11-16T15:00:00.000Z',
      pet: { id: 'pet-1', name: 'Pingo', species: 'cachorro' },
    },
    {
      id: 'rec-other-vet',
      appointment_id: 'apt-other-vet',
      organization_id: orgId,
      pet_id: 'pet-4',
      veterinarian_id: vetB,
      subjective: 'Outro vet',
      objective: 'Outro vet',
      assessment: 'Confidencial vet B',
      plan: 'Plano vet B',
      vitals: {
        weight_kg: null,
        temperature_c: null,
        heart_rate_bpm: null,
        respiratory_rate_rpm: null,
        mucous_membranes: null,
        capillary_refill_seconds: null,
      },
      status: 'finalized' as const,
      finalized_at: '2026-11-20T10:00:00.000Z',
      created_at: '2026-11-20T10:00:00.000Z',
      updated_at: '2026-11-20T10:00:00.000Z',
      pet: { id: 'pet-4', name: 'RexOutroVet', species: 'cachorro' },
    },
  ];

  const cachedRecords = pruneVetBasicRecordsForCache(records, vetA, now);
  assert.equal(cachedRecords.length, 1);
  assert.equal(cachedRecords[0]?.id, 'rec-newer-finalized');
  assert.equal(cachedRecords[0]?.cache_key, `${vetA}:apt-recent-past`);

  const restored = toClinicalRecordFromCached(cachedRecords[0]);
  assert.equal(restored.assessment, 'Melhora clínica completa');
  assert.equal(restored.vitals.weight_kg, 11.7);

  assert.equal(filterCachedBasicRecords(cachedRecords, 'ambulatorial').length, 1);
  assert.equal(filterCachedBasicRecords(cachedRecords, 'Confidencial').length, 0);

  const vitalsLines = formatCachedVitalsSummary(restored.vitals);
  assert.ok(vitalsLines.includes('Peso: 11.7 kg'));
  assert.ok(vitalsLines.includes('Mucosas: Normocoradas'));

  assert.equal(isLikelyOfflineError(new TypeError('Failed to fetch')), true);
  assert.equal(
    isLikelyOfflineError(
      new Error('Falha de conexão com o servidor do Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL.'),
    ),
    true,
  );
  assert.equal(
    isLikelyOfflineError(new Error('Você não tem permissão para realizar esta operação.')),
    false,
  );
});

test('Twilio WhatsApp helpers normalize phone numbers, resolve channel predicates, and safely queue when unconfigured', async () => {
  assert.equal(normalizeWhatsappPhoneToE164('(11) 99876-5432'), '+5511998765432');
  assert.equal(normalizeWhatsappPhoneToE164('5511998765432'), '+5511998765432');
  assert.equal(normalizeWhatsappPhoneToE164('+1 415 555 0199'), '+14155550199');
  assert.equal(normalizeWhatsappPhoneToE164('whatsapp:+5511988887777'), '+5511988887777');
  assert.equal(normalizeWhatsappPhoneToE164('12345'), null);
  assert.equal(normalizeWhatsappPhoneToE164('<script>alert(1)</script>'), null);

  assert.equal(
    formatTwilioWhatsappAddress('11998765432'),
    'whatsapp:+5511998765432',
  );
  assert.equal(formatTwilioWhatsappAddress('invalid'), null);

  assert.equal(normalizeVetReminderChannel('all'), 'all');
  assert.equal(normalizeVetReminderChannel('whatsapp'), 'whatsapp');
  assert.equal(normalizeVetReminderChannel('push_whatsapp'), 'push_whatsapp');
  assert.equal(normalizeVetReminderChannel('email_whatsapp'), 'email_whatsapp');

  assert.equal(shouldSendPushForChannel('all'), true);
  assert.equal(shouldSendEmailForChannel('all'), true);
  assert.equal(shouldSendWhatsappForChannel('all'), true);

  assert.equal(shouldSendPushForChannel('whatsapp'), false);
  assert.equal(shouldSendEmailForChannel('whatsapp'), false);
  assert.equal(shouldSendWhatsappForChannel('whatsapp'), true);

  assert.equal(shouldSendPushForChannel('push_whatsapp'), true);
  assert.equal(shouldSendEmailForChannel('push_whatsapp'), false);
  assert.equal(shouldSendWhatsappForChannel('push_whatsapp'), true);

  assert.equal(shouldSendPushForChannel('email_whatsapp'), false);
  assert.equal(shouldSendEmailForChannel('email_whatsapp'), true);
  assert.equal(shouldSendWhatsappForChannel('email_whatsapp'), true);

  assert.equal(describeVetReminderChannel('all'), 'Web Push, E-mail e WhatsApp');

  const content = buildVet30MinReminderContent({
    appointment: {
      id: 'apt-wa-1',
      kind: 'teleconsultation',
      status: 'confirmed',
      starts_at: '2026-11-26T15:20:00.000Z',
    },
    petName: 'Thor',
    veterinarianName: 'Dra. Helena',
  });
  assert.ok(content.whatsappText.includes('Thor'));
  assert.ok(content.whatsappText.includes('/teleconsulta?appointmentId=apt-wa-1'));

  const tutorWhatsappText = buildAppointmentWhatsappReminderText({
    title: 'Lembrete de consulta: Thor',
    body: 'Teleconsulta marcada para 26/11 às 12:20.',
    actionUrl: '/teleconsulta',
    recipientName: 'Carlos',
  });
  assert.ok(tutorWhatsappText.includes('Carlos'));
  assert.ok(tutorWhatsappText.includes('/teleconsulta'));

  assert.equal(isWhatsappProviderConfigured(), false);
  const invalidResult = await sendWhatsappReminder({
    to: 'abc',
    body: 'Teste',
  });
  assert.equal(invalidResult.sent, false);
  assert.equal(invalidResult.queued, false);
  assert.ok(invalidResult.error);

  const queuedResult = await sendWhatsappReminder({
    to: '11999998888',
    body: content.whatsappText,
  });
  assert.equal(queuedResult.sent, false);
  assert.equal(queuedResult.queued, true);
  assert.equal(queuedResult.provider, 'outbox_queue');
  assert.equal(queuedResult.normalizedTo, 'whatsapp:+5511999998888');
});






