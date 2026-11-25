import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canManagePartnerOrganization } from '../src/lib/auth/guards';
import {
  buildCanonicalPrescriptionManifest,
  computePrescriptionDigestHex,
  evaluateDigitalSignatureReadiness,
} from '../src/lib/clinical/prescription-digest';
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
  createAdCampaignSchema,
  createPartnerListingSchema,
  deleteAvailabilitySchema,
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
  vetProfileSettingsSchema,
} from '../src/lib/validations';

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

