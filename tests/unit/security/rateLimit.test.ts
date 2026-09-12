import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/security/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to configured limit within the window", () => {
    const key = "user-123";
    const limit = 3;
    const windowMs = 1000;

    const r1 = checkRateLimit(key, limit, windowMs);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, limit, windowMs);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, limit, windowMs);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request exceeds limit
    const r4 = checkRateLimit(key, limit, windowMs);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.resetMs).toBeGreaterThan(0);
  });

  it("resets capacity after the window expires", async () => {
    const key = "ip-test";
    const limit = 2;
    const windowMs = 500;

    expect(checkRateLimit(key, limit, windowMs).allowed).toBe(true);
    expect(checkRateLimit(key, limit, windowMs).allowed).toBe(true);
    expect(checkRateLimit(key, limit, windowMs).allowed).toBe(false);

    // Advance time past the sliding window
    await vi.advanceTimersByTimeAsync(501);

    // Should be allowed again
    const refreshed = checkRateLimit(key, limit, windowMs);
    expect(refreshed.allowed).toBe(true);
    expect(refreshed.remaining).toBe(1);
  });

  it("tracks different keys independently", () => {
    const limit = 1;
    const windowMs = 1000;

    expect(checkRateLimit("client-a", limit, windowMs).allowed).toBe(true);
    expect(checkRateLimit("client-a", limit, windowMs).allowed).toBe(false);

    // client-b should not be blocked by client-a
    expect(checkRateLimit("client-b", limit, windowMs).allowed).toBe(true);
  });
});
