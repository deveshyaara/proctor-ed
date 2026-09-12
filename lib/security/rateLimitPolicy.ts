/**
 * lib/security/rateLimitPolicy.ts
 *
 * Centralized rate limit policy definitions.
 * Configured appropriately for a small private deployment (1 teacher, ~2 students).
 *
 * For single-instance production, these limits prevent brute force and abuse
 * while remaining generous enough not to disrupt legitimate users.
 */

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  description: string;
}

export const RATE_LIMIT_POLICIES = {
  /**
   * Teacher login attempts: 5 requests per 15 minutes per IP.
   * Prevents brute-force password guessing.
   */
  LOGIN: {
    limit: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    description: "Teacher login attempts",
  },

  /**
   * Student test code validation: 30 requests per minute per IP.
   * Prevents automated enumeration of valid test codes.
   */
  TEST_CODE_VALIDATE: {
    limit: 30,
    windowMs: 60 * 1000, // 1 minute
    description: "Test code validation / lookup",
  },

  /**
   * Exam attempt creation: 10 attempts per minute per IP.
   * Prevents duplicate/spam attempt creations.
   */
  ATTEMPT_CREATE: {
    limit: 10,
    windowMs: 60 * 1000,
    description: "Exam attempt initialization",
  },

  /**
   * Answer saving: 120 requests per minute per attempt.
   * Generous enough for rapid multiple-choice answering and autosave.
   */
  ANSWER_SYNC: {
    limit: 120,
    windowMs: 60 * 1000,
    description: "Student answer submission / autosave",
  },

  /**
   * Proctoring telemetry events: 120 requests per minute per attempt.
   * Accommodates periodic heartbeat and visibility/fullscreen change bursts.
   */
  EVENT_INGEST: {
    limit: 120,
    windowMs: 60 * 1000,
    description: "Proctoring telemetry event ingestion",
  },

  /**
   * General API endpoints fallback: 60 requests per minute per IP.
   */
  DEFAULT: {
    limit: 60,
    windowMs: 60 * 1000,
    description: "General API traffic",
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;
