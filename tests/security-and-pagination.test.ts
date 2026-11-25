import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStructuredAuditEntry,
  sanitizeAuditMetadata,
} from '../src/lib/logging/audit';
import {
  matchesPeriodFilter,
  matchesTextQuery,
  paginateItems,
  parseListFilterParams,
} from '../src/lib/pagination';
import {
  SlidingWindowRateLimiter,
  buildRateLimitHeaders,
  extractClientIp,
} from '../src/lib/security/rate-limit';

test('SlidingWindowRateLimiter aplica limite por janela, isola chaves e retorna cabeçalhos HTTP 429 corretos', () => {
  const limiter = new SlidingWindowRateLimiter();
  let currentNow = 1_700_000_000_000;
  const now = () => currentNow;

  for (let i = 0; i < 3; i += 1) {
    const allowed = limiter.check('api:pets:user-1', {
      limit: 3,
      windowMs: 60_000,
      now,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.remaining, 2 - i);
  }

  const blocked = limiter.check('api:pets:user-1', {
    limit: 3,
    windowMs: 60_000,
    now,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);

  const headers = buildRateLimitHeaders(blocked);
  assert.equal(headers['X-RateLimit-Limit'], '3');
  assert.equal(headers['X-RateLimit-Remaining'], '0');
  assert.ok(Number(headers['Retry-After']) >= 1);

  // Outro usuário não é afetado
  const otherUser = limiter.check('api:pets:user-2', {
    limit: 3,
    windowMs: 60_000,
    now,
  });
  assert.equal(otherUser.allowed, true);

  // Após expiração da janela volta a permitir
  currentNow += 61_000;
  const afterWindow = limiter.check('api:pets:user-1', {
    limit: 3,
    windowMs: 60_000,
    now,
  });
  assert.equal(afterWindow.allowed, true);
});

test('extractClientIp lê x-forwarded-for e x-real-ip com fallback seguro', () => {
  assert.equal(
    extractClientIp(new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' })),
    '203.0.113.10',
  );
  assert.equal(
    extractClientIp(new Headers({ 'x-real-ip': '198.51.100.2' })),
    '198.51.100.2',
  );
  assert.equal(extractClientIp(new Headers()), 'unknown');
});

test('audit logger remove campos sensíveis e gera entrada JSON estruturada', () => {
  const sanitized = sanitizeAuditMetadata({
    appointmentId: 'abc-123',
    password: 'super-secret-password',
    token: 'jwt-secret',
    pix_payload: '000201...',
    subjective: 'Dado clínico confidencial',
    email: 'tutor@example.com',
    phone: '+5511999999999',
    tags: ['a', 'b'],
  });

  assert.equal(sanitized.appointmentId, 'abc-123');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.pix_payload, '[REDACTED]');
  assert.equal(sanitized.subjective, '[REDACTED]');
  assert.equal(sanitized.email, '[REDACTED]');
  assert.equal(sanitized.phone, '[REDACTED]');
  assert.equal(sanitized.tags, 'array(2)');

  const entry = createStructuredAuditEntry({
    event: 'pets.create_failed',
    resource: 'pets',
    action: 'create',
    outcome: 'denied',
    actorId: 'user-1',
    statusCode: 403,
    requestId: 'req-1',
    metadata: { secret: '123', scope: 'all' },
  });
  assert.equal(entry.level, 'warn');
  assert.equal(entry.metadata.secret, '[REDACTED]');
  assert.equal(entry.metadata.scope, 'all');
});

test('paginação, busca textual sem acento e filtros por período funcionam corretamente', () => {
  assert.equal(
    matchesTextQuery(['Cão SRD', 'Vacina Antirrábica'], 'antirrabica'),
    true,
  );
  assert.equal(matchesTextQuery(['Gato Siamês'], 'cachorro'), false);

  assert.equal(
    matchesPeriodFilter('2026-11-15T14:00:00Z', '2026-11-01', '2026-11-30'),
    true,
  );
  assert.equal(
    matchesPeriodFilter('2026-10-31T23:59:59Z', '2026-11-01', '2026-11-30'),
    false,
  );

  const parsed = parseListFilterParams(
    new URLSearchParams('page=-2&limit=999&q=Pipoca&from=2026-11-01'),
    { limit: 20, maxLimit: 50 },
  );
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.q, 'Pipoca');
  assert.equal(parsed.from, '2026-11-01');

  const paged = paginateItems([1, 2, 3, 4, 5], { page: 2, limit: 2 });
  assert.deepEqual(paged.items, [3, 4]);
  assert.equal(paged.pagination.total, 5);
  assert.equal(paged.pagination.totalPages, 3);
  assert.equal(paged.pagination.hasNextPage, true);
  assert.equal(paged.pagination.hasPrevPage, true);
});
