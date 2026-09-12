import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import type { AttemptStatus, Attempt } from "@prisma/client";
import { isTerminal } from "./stateMachine";

/** Cookie name prefix — append attemptId for per-attempt isolation */
export const ATTEMPT_TOKEN_COOKIE = "pe_at";

/** Generate a cryptographically random token (32 bytes = 256 bits) */
export function generateAttemptToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a raw token for safe DB storage */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Cookie name for a given attempt */
export function attemptCookieName(attemptId: string): string {
  return `${ATTEMPT_TOKEN_COOKIE}_${attemptId}`;
}

/**
 * Verify that the request owns this attempt.
 * Checks: attempt exists, token hash matches, optional status requirement.
 * Throws ApiError on any failure to prevent IDOR.
 */
export async function requireAttemptOwnership(
  attemptId: string,
  rawToken: string | undefined,
  requiredStatus?: AttemptStatus | AttemptStatus[]
): Promise<Attempt> {
  if (!rawToken) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  }

  // Validate the cookie boundary before hashing. The hashing utility itself
  // intentionally remains usable for arbitrary deterministic strings.
  if (!/^[a-f0-9]{64}$/.test(rawToken)) {
    throw new ApiError(403, "FORBIDDEN", "Access denied.");
  }

  const tokenHash = hashToken(rawToken);

  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, accessTokenHash: tokenHash },
  });

  if (!attempt) {
    throw new ApiError(403, "FORBIDDEN", "Access denied.");
  }

  if (requiredStatus) {
    const allowed = Array.isArray(requiredStatus) ? requiredStatus : [requiredStatus];
    if (!allowed.includes(attempt.status)) {
      if (isTerminal(attempt.status)) {
        throw new ApiError(
          409,
          "ATTEMPT_ALREADY_SUBMITTED",
          "This examination has already been submitted."
        );
      }
      throw new ApiError(
        409,
        "INVALID_TRANSITION",
        "This action is not permitted in the current state."
      );
    }
  }

  return attempt;
}

/**
 * Check if attempt timer has expired server-side.
 */
export function isAttemptExpired(attempt: Attempt): boolean {
  if (!attempt.expiresAt) return false;
  return new Date() > attempt.expiresAt;
}

/** Structured API error for consistent JSON error responses */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Create a structured error response body */
export function errorResponse(code: string, message: string) {
  return { error: { code, message } };
}
