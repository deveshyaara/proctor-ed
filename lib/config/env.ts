/**
 * lib/config/env.ts
 *
 * Centralized environment variable validation for ProctorED.
 *
 * Architecture note:
 * This deployment intentionally uses a single application instance with
 * PostgreSQL as the only external dependency. Redis, S3, and distributed
 * infrastructure are not required at this scale (1 teacher, ~2 students).
 * See SCALING_ROADMAP.md for when to introduce additional infrastructure.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Server-only environment schema
// These variables must NEVER be exposed in client bundles.
// ---------------------------------------------------------------------------
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Neon Auth environment variables
  NEON_AUTH_BASE_URL: z.string().url("NEON_AUTH_BASE_URL must be a valid URL"),
  NEON_AUTH_COOKIE_SECRET: z
    .string()
    .min(32, "NEON_AUTH_COOKIE_SECRET must be at least 32 characters"),
  NEON_AUTH_JWKS_URL: z.string().url("NEON_AUTH_JWKS_URL must be a valid URL").optional(),

  // Legacy NextAuth environment variables (kept temporarily during transition)
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_URL: z.string().url().optional(),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

// ---------------------------------------------------------------------------
// Client-safe environment schema
// Only values genuinely safe for browser bundles.
// ---------------------------------------------------------------------------
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .default("http://localhost:3000"),
});

// ---------------------------------------------------------------------------
// Validation — runs at module import time (server startup)
// ---------------------------------------------------------------------------
function validateEnv() {
  const isTest = process.env.NODE_ENV === "test";

  const serverResult = serverEnvSchema.safeParse(process.env);

  if (!serverResult.success) {
    const errors = serverResult.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    const message = `\n\n🔴 ProctorED — Missing or invalid environment variables:\n${errors}\n\nCheck your .env file. See .env.example for reference.\n`;

    if (!isTest) {
      console.error(message);
      throw new Error("Environment validation failed. Server cannot start.");
    }
    // In test mode: soft warn (unit tests mock specific vars as needed)
    console.warn("⚠️  ENV WARNING (test mode):", errors);
  }

  const clientResult = clientEnvSchema.safeParse(process.env);
  if (!clientResult.success && !isTest) {
    console.warn("⚠️  Client env validation warning:", clientResult.error.message);
  }

  // ⚠️  Runtime architecture warning: in-process rate limiting not suitable for multi-instance deployments
  if (!isTest && process.env.NODE_ENV === "production") {
    // If you're deploying with multiple app instances, rate limiting will fail silently
    // Consider this a reminder to migrate to Redis before scaling
    console.warn(
      "⚠️  ARCHITECTURE WARNING: ProctorED uses in-process rate limiting (Map storage). " +
        "This only works for single-instance deployments. Before enabling horizontal scaling or " +
        "multiple app instances, replace with a shared store (e.g., Upstash Redis, ioredis)."
    );
  }

  return {
    server: serverResult.success
      ? serverResult.data
      : (process.env as unknown as z.infer<typeof serverEnvSchema>),
    client: clientResult.success
      ? clientResult.data
      : { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
  };
}

const validated = validateEnv();

/** Validated server-only environment variables. Import in server code only. */
export const serverEnv = validated.server;

/** Validated client-safe environment variables. Safe for server + client. */
export const clientEnv = validated.client;

/** Combined convenience object. */
export const env = { ...validated.server, ...validated.client };
