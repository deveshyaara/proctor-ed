import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/student/attempts/[id]/answers/route";
import { prisma } from "@/lib/db/client";
import { hashToken, attemptCookieName } from "@/lib/exam/attemptAuth";

describe("GET /api/student/attempts/[id]/answers (GAP-1 Fix)", () => {
  const attemptId = "attempt-student-gap1";
  const testId = "test-math-gap1";
  const rawToken = "a".repeat(64);
  const validTokenHash = hashToken(rawToken);

  const mockTestBase = {
    id: testId,
    title: "Linear Polynomials Assessment",
    subject: "Mathematics",
    className: "Grade 10",
    settings: {
      showResultImmediately: true,
      showCorrectAnswers: true,
    },
  };

  const mockAttemptBase = {
    id: attemptId,
    testId,
    studentName: "Alex Doe",
    rollNumber: "ROLL-001",
    accessTokenHash: validTokenHash,
    status: "SUBMITTED",
    score: 8,
    maxScore: 10,
    startedAt: new Date("2026-09-16T10:00:00Z"),
    submittedAt: new Date("2026-09-16T10:30:00Z"),
    questionOrder: null,
    optionOrderMap: null,
  };

  const mockQuestions = [
    {
      id: "q-1",
      testId,
      order: 1,
      type: "MCQ",
      questionText: "What is the degree of a linear polynomial?",
      imageUrl: null,
      options: ["0", "1", "2", "3"],
      correctAnswer: "1", // Index 1 -> "1"
      marks: 5,
      negativeMarks: 1,
      explanation: "A linear polynomial has degree 1 by definition (e.g. ax + b).",
    },
    {
      id: "q-2",
      testId,
      order: 2,
      type: "SHORT_ANSWER",
      questionText: "What is the zero of p(x) = 2x - 4?",
      imageUrl: null,
      options: null,
      correctAnswer: "2",
      marks: 5,
      negativeMarks: 0,
      explanation: "2x - 4 = 0 => 2x = 4 => x = 2.",
    },
  ];

  const mockAnswers = [
    {
      questionId: "q-1",
      answer: "1", // selected index 1
      isCorrect: true,
      marksAwarded: 5,
      answeredAt: new Date("2026-09-16T10:05:00Z"),
    },
    {
      questionId: "q-2",
      answer: "3", // incorrect answer
      isCorrect: false,
      marksAwarded: 0,
      answeredAt: new Date("2026-09-16T10:10:00Z"),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createRequest(
    targetAttemptId: string,
    cookieToken?: string,
    cookieNameOverride?: string
  ): NextRequest {
    const req = new NextRequest(
      `http://localhost:3000/api/student/attempts/${targetAttemptId}/answers`
    );
    if (cookieToken) {
      const name = cookieNameOverride ?? attemptCookieName(targetAttemptId);
      req.cookies.set(name, cookieToken);
    }
    return req;
  }

  describe("Authentication, Authorization & Status Gating", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED when no cookie is sent", async () => {
      const req = createRequest(attemptId); // No cookie
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects cross-student IDOR requests with 401/403 when cookie belongs to a different attempt", async () => {
      // Student has cookie for attempt-other, but requests attempt-student-gap1
      const req = createRequest(attemptId, rawToken, attemptCookieName("attempt-other"));
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects forged or invalid token with 403 FORBIDDEN", async () => {
      const forgedToken = "b".repeat(64);
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue(null);

      const req = createRequest(attemptId, forgedToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("rejects non-terminal attempts (e.g. IN_PROGRESS) with 409 INVALID_TRANSITION", async () => {
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue({
        ...mockAttemptBase,
        status: "IN_PROGRESS",
      } as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe("INVALID_TRANSITION");
    });
  });

  describe("Settings Interaction: showResultImmediately x showCorrectAnswers", () => {
    it("Scenario A: showResultImmediately = false -> withholds score and answers (no leak)", async () => {
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue(mockAttemptBase as never);
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        ...mockTestBase,
        settings: {
          showResultImmediately: false,
          showCorrectAnswers: true, // Even if true, withheld must take precedence
        },
      } as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.withheld).toBe(true);
      expect(data.showResultImmediately).toBe(false);
      expect(data.attempt.score).toBeNull();
      expect(data.summary.score).toBeNull();
      expect(data.questions).toBeUndefined(); // Must NOT leak question breakdown or correct answers
    });

    it("Scenario B: showResultImmediately = true, showCorrectAnswers = false -> score only, no breakdown", async () => {
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue(mockAttemptBase as never);
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        ...mockTestBase,
        settings: {
          showResultImmediately: true,
          showCorrectAnswers: false,
        },
      } as never);
      vi.spyOn(prisma.question, "findMany").mockResolvedValue(mockQuestions as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue(mockAnswers as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.withheld).toBe(false);
      expect(data.showResultImmediately).toBe(true);
      expect(data.showCorrectAnswers).toBe(false);
      expect(data.attempt.score).toBe(8);
      expect(data.summary.score).toBe(8);
      expect(data.summary.maxScore).toBe(10);
      expect(data.summary.percentage).toBe(80);
      expect(data.questions).toBeUndefined(); // Question breakdown NOT included
    });

    it("Scenario C: showResultImmediately = true, showCorrectAnswers = true -> returns score AND full answer breakdown", async () => {
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue(mockAttemptBase as never);
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        ...mockTestBase,
        settings: {
          showResultImmediately: true,
          showCorrectAnswers: true,
        },
      } as never);
      vi.spyOn(prisma.question, "findMany").mockResolvedValue(mockQuestions as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue(mockAnswers as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.withheld).toBe(false);
      expect(data.showResultImmediately).toBe(true);
      expect(data.showCorrectAnswers).toBe(true);
      expect(data.attempt.score).toBe(8);
      expect(data.summary.totalQuestions).toBe(2);
      expect(data.summary.answeredCount).toBe(2);
      expect(data.summary.correctCount).toBe(1);
      expect(data.summary.incorrectCount).toBe(1);

      // Verify question breakdown details
      expect(data.questions).toHaveLength(2);

      const q1 = data.questions[0];
      expect(q1.id).toBe("q-1");
      expect(q1.type).toBe("MCQ");
      expect(q1.questionText).toBe("What is the degree of a linear polynomial?");
      expect(q1.isAnswered).toBe(true);
      expect(q1.isCorrect).toBe(true);
      expect(q1.marksAwarded).toBe(5);
      expect(q1.submittedOptionIndex).toBe(1);
      expect(q1.submittedOptionLetter).toBe("B");
      expect(q1.correctOptionIndex).toBe(1);
      expect(q1.correctOptionLetter).toBe("B");
      expect(q1.explanation).toContain("A linear polynomial has degree 1");

      const optB = q1.options.find((o: { letter: string }) => o.letter === "B");
      expect(optB.isCorrect).toBe(true);
      expect(optB.isSelected).toBe(true);

      const q2 = data.questions[1];
      expect(q2.id).toBe("q-2");
      expect(q2.type).toBe("SHORT_ANSWER");
      expect(q2.submittedAnswer).toBe("3");
      expect(q2.correctAnswer).toBe("2");
      expect(q2.isCorrect).toBe(false);
      expect(q2.marksAwarded).toBe(0);
      expect(q2.explanation).toContain("2x - 4 = 0");
    });
  });

  describe("Option Shuffling & Question Ordering", () => {
    it("translates shuffled visible indices back to canonical options when optionOrderMap is present", async () => {
      // Suppose options in DB are ["0", "1", "2", "3"] (indices 0, 1, 2, 3)
      // Shuffled order presented to student was: [2, 1, 3, 0]
      // Student picked position 1 (which was DB index 1: "1")
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue({
        ...mockAttemptBase,
        optionOrderMap: {
          "q-1": [2, 1, 3, 0],
        },
      } as never);
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue(mockTestBase as never);
      vi.spyOn(prisma.question, "findMany").mockResolvedValue([mockQuestions[0]] as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue([
        {
          questionId: "q-1",
          answer: "1", // student selected visible index 1
          isCorrect: true,
          marksAwarded: 5,
          answeredAt: new Date(),
        },
      ] as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      const q = data.questions[0];
      // shuffleOrder[1] = 1 -> canonicalIdx = 1
      expect(q.submittedOptionIndex).toBe(1);
      expect(q.submittedOptionLetter).toBe("B");
      expect(q.submittedAnswer).toBe("1");
    });

    it("respects attempt.questionOrder when present", async () => {
      // Questions are q-1, q-2 in DB, but student was assigned ["q-2", "q-1"]
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue({
        ...mockAttemptBase,
        questionOrder: ["q-2", "q-1"],
      } as never);
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue(mockTestBase as never);
      vi.spyOn(prisma.question, "findMany").mockResolvedValue(mockQuestions as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue(mockAnswers as never);

      const req = createRequest(attemptId, rawToken);
      const res = await GET(req, { params: Promise.resolve({ id: attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.questions[0].id).toBe("q-2");
      expect(data.questions[1].id).toBe("q-1");
    });
  });
});
