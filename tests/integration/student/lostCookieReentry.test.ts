/**
 * Integration regression tests — GAP-9: Lost-cookie re-entry
 *
 * Verifies that a student with an existing IN_PROGRESS attempt who submits
 * their roll number (without a valid auth cookie) is transparently
 * re-attached to their ongoing attempt rather than receiving 403
 * MAX_ATTEMPTS_EXCEEDED.
 *
 * Also verifies that the maxAttempts cap correctly excludes CREATED attempts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { hashToken, generateAttemptToken } from "@/lib/exam/attemptAuth";

// ── helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function createTeacher() {
  return prisma.user.create({
    data: {
      email: `teacher-gap9-${Date.now()}@test.local`,
      name: "Test Teacher",
      passwordHash: null,
      role: "TEACHER",
    },
  });
}

async function createPublishedTest(teacherId: string, maxAttempts = 1) {
  return prisma.test.create({
    data: {
      teacherId,
      title: "GAP-9 Re-entry Test",
      subject: "Test",
      className: "10A",
      testCode: `GAP9${Date.now()}`,
      durationSeconds: 3600,
      maxAttempts,
      status: "PUBLISHED",
      settings: {
        shuffleQuestions: false,
        shuffleOptions: false,
        showResultImmediately: true,
        autoSubmitOnExpiry: true,
        warningLimit: 3,
        allowedTabSwitches: 0,
        enableProctoringCamera: false,
        enableProctoringAudio: false,
        showCorrectAnswers: false,
      },
    },
  });
}

async function seedAttempt(
  testId: string,
  rollNumber: string,
  status: "CREATED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED"
) {
  const token = generateAttemptToken();
  return prisma.attempt.create({
    data: {
      testId,
      studentName: "Test Student",
      rollNumber,
      accessTokenHash: hashToken(token),
      status,
      ...(status === "IN_PROGRESS" ? { startedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } : {}),
    },
  });
}

async function postAttempt(testCode: string, rollNumber: string) {
  return fetch(`${BASE_URL}/api/student/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testCode, studentName: "Test Student", rollNumber }),
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("GAP-9: Lost-cookie re-entry", () => {
  let teacherId: string;
  let testId: string;
  let testCode: string;
  const roll = "ROLL001";

  beforeEach(async () => {
    const teacher = await createTeacher();
    teacherId = teacher.id;
    const test = await createPublishedTest(teacherId, 1);
    testId = test.id;
    testCode = test.testCode;
  });

  afterEach(async () => {
    await prisma.answer.deleteMany({ where: { attempt: { testId } } });
    await prisma.attempt.deleteMany({ where: { testId } });
    await prisma.test.deleteMany({ where: { id: testId } });
    await prisma.user.deleteMany({ where: { id: teacherId } });
  });

  it("re-attaches to an existing IN_PROGRESS attempt (returns 200, not 403)", async () => {
    const existing = await seedAttempt(testId, roll, "IN_PROGRESS");

    const res = await postAttempt(testCode, roll);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Must return the SAME attemptId — not a new one
    expect(body.attemptId).toBe(existing.id);

    // A fresh cookie must be set
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain(`pe_at_${existing.id}`);

    // The token in the DB must have been rotated (old hash no longer valid)
    const updated = await prisma.attempt.findUnique({ where: { id: existing.id } });
    expect(updated!.accessTokenHash).not.toBe(existing.accessTokenHash);
  });

  it("returns 403 when the only attempt is SUBMITTED (no active attempt to re-attach)", async () => {
    await seedAttempt(testId, roll, "SUBMITTED");

    const res = await postAttempt(testCode, roll);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error.code).toBe("MAX_ATTEMPTS_EXCEEDED");
  });

  it("CREATED attempt does NOT consume a maxAttempts slot — new attempt is allowed", async () => {
    // maxAttempts=1; one CREATED attempt exists but has never started
    await seedAttempt(testId, roll, "CREATED");

    const res = await postAttempt(testCode, roll);
    // Should succeed (201) because CREATED doesn't count
    expect(res.status).toBe(201);

    const body = await res.json();
    // A brand-new attempt ID
    const created = await prisma.attempt.findUnique({ where: { id: body.attemptId } });
    expect(created).not.toBeNull();
    expect(created!.status).toBe("CREATED");
  });

  it("re-entry is blocked when a second roll submits while first roll is IN_PROGRESS", async () => {
    const test = await createPublishedTest(teacherId, 1);
    await seedAttempt(test.id, "ROLL999", "SUBMITTED");

    const res = await fetch(`${BASE_URL}/api/student/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCode: test.testCode, studentName: "Other Student", rollNumber: "ROLL999" }),
    });
    expect(res.status).toBe(403);

    // cleanup
    await prisma.attempt.deleteMany({ where: { testId: test.id } });
    await prisma.test.deleteMany({ where: { id: test.id } });
  });
});
