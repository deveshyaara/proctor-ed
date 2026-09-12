import { describe, it, expect } from "vitest";
import {
  generateAttemptToken,
  hashToken,
  attemptCookieName,
  isAttemptExpired,
  ATTEMPT_TOKEN_COOKIE,
} from "@/lib/exam/attemptAuth";
import type { Attempt } from "@prisma/client";

describe("Attempt Auth Utilities", () => {
  it("generates 32-byte cryptographically random hex token with high entropy", () => {
    const token1 = generateAttemptToken();
    const token2 = generateAttemptToken();
    expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it("produces deterministic SHA-256 hash for raw token", () => {
    const raw = "test-token-12345";
    const hash1 = hashToken(raw);
    const hash2 = hashToken(raw);
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    // Altering token produces completely different hash
    expect(hashToken("test-token-12346")).not.toBe(hash1);
  });

  it("creates scoped attempt cookie names", () => {
    const attemptId = "att_987654";
    const cookieName = attemptCookieName(attemptId);
    expect(cookieName).toBe(`${ATTEMPT_TOKEN_COOKIE}_att_987654`);
  });

  it("detects expired attempts accurately", () => {
    const past = new Date(Date.now() - 5000);
    const future = new Date(Date.now() + 5000);

    const expiredAttempt = {
      expiresAt: past,
    } as Attempt;

    const activeAttempt = {
      expiresAt: future,
    } as Attempt;

    const noExpiryAttempt = {
      expiresAt: null,
    } as Attempt;

    expect(isAttemptExpired(expiredAttempt)).toBe(true);
    expect(isAttemptExpired(activeAttempt)).toBe(false);
    expect(isAttemptExpired(noExpiryAttempt)).toBe(false);
  });
});
