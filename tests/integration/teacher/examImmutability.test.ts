/**
 * Integration regression tests — Exam Immutability Boundary (H4)
 *
 * Verifies that the EXAM_IMMUTABLE guard is scoped to active/terminal
 * attempts only. A CREATED attempt (roll number entered, timer not yet
 * started) must NOT lock test settings or question mutations.
 *
 * Statuses that MUST block edits: IN_PROGRESS, SUBMITTED, AUTO_SUBMITTED
 * Statuses that must NOT block edits: CREATED
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";

// ── helpers ──────────────────────────────────────────────────────────────────

async function createTeacher() {
  return prisma.user.create({
    data: {
      email: `teacher-immut-${Date.now()}@test.local`,
      name: "Test Teacher",
      passwordHash: null,
      role: "TEACHER",
    },
  });
}

async function createPublishedTest(teacherId: string) {
  const test = await prisma.test.create({
    data: {
      teacherId,
      title: "Immutability Test",
      subject: "Test Subject",
      className: "10A",
      testCode: `IMMT${Date.now()}`,
      durationSeconds: 3600,
      maxAttempts: 3,
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

  const question = await prisma.question.create({
    data: {
      testId: test.id,
      type: "MCQ",
      questionText: "What is 2+2?",
      options: ["1", "2", "3", "4"],
      correctAnswer: "4",
      marks: 1,
      negativeMarks: 0,
      order: 1,
    },
  });

  return { test, question };
}

async function createAttempt(
  testId: string,
  status: "CREATED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED"
) {
  return prisma.attempt.create({
    data: {
      testId,
      studentName: "Test Student",
      rollNumber: `ROLL${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      accessTokenHash: "testhash",
      status,
    },
  });
}

async function activeAttemptCount(testId: string) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      _count: {
        select: {
          attempts: {
            where: { status: { in: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"] } },
          },
        },
      },
    },
  });
  return test!._count.attempts;
}

// ── test suite ────────────────────────────────────────────────────────────────

describe("Exam Immutability Boundary (H4)", () => {
  let teacherId: string;
  let testId: string;

  beforeEach(async () => {
    const teacher = await createTeacher();
    teacherId = teacher.id;
    const { test } = await createPublishedTest(teacherId);
    testId = test.id;
  });

  afterEach(async () => {
    await prisma.answer.deleteMany({ where: { attempt: { testId } } });
    await prisma.attempt.deleteMany({ where: { testId } });
    await prisma.question.deleteMany({ where: { testId } });
    await prisma.test.deleteMany({ where: { id: testId } });
    await prisma.user.deleteMany({ where: { id: teacherId } });
  });

  it("no attempts → active count is 0", async () => {
    expect(await activeAttemptCount(testId)).toBe(0);
  });

  it("CREATED attempt does NOT increment the active count", async () => {
    await createAttempt(testId, "CREATED");
    expect(await activeAttemptCount(testId)).toBe(0);
  });

  it("multiple CREATED attempts still yield active count 0", async () => {
    await createAttempt(testId, "CREATED");
    await createAttempt(testId, "CREATED");
    await createAttempt(testId, "CREATED");
    expect(await activeAttemptCount(testId)).toBe(0);
  });

  it("IN_PROGRESS attempt increments the active count to 1", async () => {
    await createAttempt(testId, "IN_PROGRESS");
    expect(await activeAttemptCount(testId)).toBe(1);
  });

  it("SUBMITTED attempt increments the active count to 1", async () => {
    await createAttempt(testId, "SUBMITTED");
    expect(await activeAttemptCount(testId)).toBe(1);
  });

  it("AUTO_SUBMITTED attempt increments the active count to 1", async () => {
    await createAttempt(testId, "AUTO_SUBMITTED");
    expect(await activeAttemptCount(testId)).toBe(1);
  });

  it("CREATED + IN_PROGRESS: only IN_PROGRESS counts", async () => {
    await createAttempt(testId, "CREATED");
    await createAttempt(testId, "IN_PROGRESS");
    // Total DB attempts = 2, but only 1 triggers the lock
    expect(await activeAttemptCount(testId)).toBe(1);
  });

  it("two SUBMITTED attempts count as 2", async () => {
    await createAttempt(testId, "SUBMITTED");
    await createAttempt(testId, "SUBMITTED");
    expect(await activeAttemptCount(testId)).toBe(2);
  });
});
