export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

interface BucketEntry {
  timestamps: number[];
  expiresAt: number;
}

export class SlidingWindowRateLimiter {
  private readonly store = new Map<string, BucketEntry>();
  private ops = 0;

  check(key: string, config: RateLimitConfig): RateLimitResult {
    const now = config.now ? config.now() : Date.now();
    const windowStart = now - config.windowMs;

    this.ops += 1;
    if (this.ops % 250 === 0) {
      this.cleanup(now);
    }

    const existing = this.store.get(key);
    const active = existing
      ? existing.timestamps.filter((ts) => ts > windowStart)
      : [];

    if (active.length >= config.limit) {
      const oldest = active[0] ?? now;
      const resetAt = oldest + config.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      this.store.set(key, { timestamps: active, expiresAt: resetAt });
      return {
        allowed: false,
        limit: config.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds,
      };
    }

    active.push(now);
    const resetAt = (active[0] ?? now) + config.windowMs;
    this.store.set(key, { timestamps: active, expiresAt: resetAt });

    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.max(0, config.limit - active.length),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  private cleanup(now: number) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  reset() {
    this.store.clear();
  }
}

export const globalApiRateLimiter = new SlidingWindowRateLimiter();

export function extractClientIp(
  headers: { get(name: string): string | null },
): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 64);
  return 'unknown';
}

export function buildRateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }
  return headers;
}
