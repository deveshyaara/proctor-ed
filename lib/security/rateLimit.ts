/**
 * lib/security/rateLimit.ts
 *
 * Process-local sliding-window rate limiter.
 *
 * ⚠️  ARCHITECTURE NOTE — SINGLE-INSTANCE DEPLOYMENT ONLY
 * This rate limiter uses in-process memory (Map). It is intentionally designed
 * for a single application instance serving a small private deployment
 * (~1 teacher, ~2 students). State is NOT shared between application instances.
 *
 * Before enabling horizontal scaling or multiple application instances,
 * replace this implementation with a shared store such as Redis
 * (e.g. Upstash Redis, ioredis). See SCALING_ROADMAP.md for guidance.
 *
 * Named policies are defined in lib/security/rateLimitPolicy.ts.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const CLEANUP_INTERVAL_MS = 60_000; // Clean stale entries every 60 seconds
let lastCleanup = Date.now();

function cleanupStaleBuckets(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of rateLimitMap.entries()) {
    const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);
    if (validTimestamps.length === 0) {
      rateLimitMap.delete(key);
    } else {
      record.timestamps = validTimestamps;
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the oldest request in the window expires */
  resetMs: number;
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * @param key       Unique key identifying the rate-limited resource (e.g. "ip:1.2.3.4:attempt-create")
 * @param limit     Maximum number of requests allowed within the window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number = 20,
  windowMs: number = 60_000
): RateLimitResult {
  const now = Date.now();
  cleanupStaleBuckets(windowMs);

  let record = rateLimitMap.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(key, record);
  }

  // Slide the window: drop timestamps older than windowMs
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return { allowed: false, limit, remaining: 0, resetMs };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    limit,
    remaining: limit - record.timestamps.length,
    resetMs: windowMs,
  };
}

/** Reset all rate limit counters. Used by tests and admin operations. */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}

/** Reset rate limit counter for a specific key (e.g. on successful login). */
export function resetRateLimitKey(key: string): void {
  rateLimitMap.delete(key);
}

