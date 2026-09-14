import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/tests/[id]/attempts/[attemptId]/answers/route";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/exam/attemptAuth";

vi.mock("@/lib/auth/helpers", () => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
      this.name = "ApiError";
    }
  }
  return {
    requireTeacherApi: vi.fn(),
    ApiError,
  };
});

import { requireTeacherApi } from "@/lib/auth/helpers";

describe("GET /api/tests/[id]/attempts/[attemptId]/answers", () => {
  const teacherId = "teacher-owner-1";
  const testId = "test-physics-101";
  const attemptId = "attempt-student-1";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireTeacherApi).mockResolvedValue({
      user: {
        id: teacherId,
        name: "Dr. Walter",
        email: "walter@physics.edu",
        role: "TEACHER",
      },
      session: {} as never,
    });
  });

  describe("Authentication & Authorization (Condition 3: Standardized Status Codes)", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      vi.mocked(requireTeacherApi).mockRejectedValueOnce(
        new ApiError(401, "UNAUTHORIZED", "Authentication required.")
      );

      const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/attempts/${attemptId}/answers`);
      const res = await GET(req, { params: Promise.resolve({ id: testId, attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects student / non-teacher accounts with 404 TEST_NOT_FOUND (standardized to avoid leaking test existence)", async () => {
      vi.mocked(requireTeacherApi).mockRejectedValueOnce(
        new ApiError(403, "FORBIDDEN", "Teacher privileges required.")
      );

      const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/attempts/${attemptId}/answers`);
      const res = await GET(req, { params: Promise.resolve({ id: testId, attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe("TEST_NOT_FOUND");
    });

    it("rejects when the requesting teacher does not own the test with 404 TEST_NOT_FOUND", async () => {
      vi.spyOn(prisma.test, "findFirst").mockResolvedValue(null);

      const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/attempts/${attemptId}/answers`);
      const res = await GET(req, { params: Promise.resolve({ id: testId, attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe("TEST_NOT_FOUND");
    });

    it("rejects when the attempt belongs to a different test with 404 ATTEMPT_NOT_FOUND", async () => {
      vi.spyOn(prisma.test, "findFirst").mockResolvedValue({
        id: testId,
        title: "Physics Mechanics",
        subject: "Physics",
        className: "Grade 11",
      } as never);

      // Attempt not found under this testId
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue(null);

      const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/attempts/${attemptId}/answers`);
      const res = await GET(req, { params: Promise.resolve({ id: testId, attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error.code).toBe("ATTEMPT_NOT_FOUND");
    });
  });

  describe("Answer Data Resolution & Scoring Reconciliation", () => {
    it("successfully returns ordered responses, resolves MCQ options, and handles unanswered questions", async () => {
      vi.spyOn(prisma.test, "findFirst").mockResolvedValue({
        id: testId,
        title: "Physics Mechanics",
        subject: "Physics",
        className: "Grade 11",
      } as never);

      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValue({
        id: attemptId,
        studentName: "John Doe",
        rollNumber: "PH-042",
        status: "SUBMITTED",
        score: 6,
        maxScore: 10,
        optionOrderMap: {
          "q-mcq": [1, 0, 2, 3], // option 0 was displayed at index 1, etc.
        },
        startedAt: new Date("2026-09-14T10:00:00Z"),
        submittedAt: new Date("2026-09-14T10:45:00Z"),
      } as never);

      // 4 questions covering all types: MCQ, TRUE_FALSE, NUMERICAL, SHORT_ANSWER
      vi.spyOn(prisma.question, "findMany").mockResolvedValue([
        {
          id: "q-mcq",
          order: 1,
          type: "MCQ",
          questionText: "What is the SI unit of force?",
          imageUrl: null,
          options: ["Newton", "Joule", "Pascal", "Watt"],
          correctAnswer: "0", // Newton
          marks: 4,
          negativeMarks: 1,
          explanation: "Force is measured in Newtons (N = kg*m/s^2).",
        },
        {
          id: "q-tf",
          order: 2,
          type: "TRUE_FALSE",
          questionText: "Energy cannot be created or destroyed.",
          imageUrl: null,
          options: null,
          correctAnswer: "true",
          marks: 2,
          negativeMarks: 0,
          explanation: "Law of conservation of energy.",
        },
        {
          id: "q-num",
          order: 3,
          type: "NUMERICAL",
          questionText: "What is the gravitational acceleration on Earth (m/s^2)?",
          imageUrl: null,
          options: null,
          correctAnswer: "9.8",
          marks: 2,
          negativeMarks: 0,
          explanation: "Standard acceleration due to gravity is approximately 9.8 m/s^2.",
        },
        {
          id: "q-short",
          order: 4,
          type: "SHORT_ANSWER",
          questionText: "What is defined as mass per unit volume?",
          imageUrl: null,
          options: null,
          correctAnswer: "Density",
          marks: 2,
          negativeMarks: 0,
          explanation: "Density is mass divided by volume.",
        },
      ] as never);

      // Student answers:
      // q-mcq: student selected visible option "1". With optionOrderMap [1, 0, 2, 3], index 1 -> canonical 0 ("Newton") -> CORRECT
      // q-tf: student answered "true" -> CORRECT
      // q-num: student answered "10" -> INCORRECT (0 marks)
      // q-short: student left UNANSWERED (no Answer record)
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue([
        {
          questionId: "q-mcq",
          answer: "1",
          isCorrect: true,
          marksAwarded: 4,
          answeredAt: new Date("2026-09-14T10:10:00Z"),
        },
        {
          questionId: "q-tf",
          answer: "true",
          isCorrect: true,
          marksAwarded: 2,
          answeredAt: new Date("2026-09-14T10:15:00Z"),
        },
        {
          questionId: "q-num",
          answer: "10",
          isCorrect: false,
          marksAwarded: 0,
          answeredAt: new Date("2026-09-14T10:20:00Z"),
        },
      ] as never);

      const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/attempts/${attemptId}/answers`);
      const res = await GET(req, { params: Promise.resolve({ id: testId, attemptId }) });
      const data = await res.json();

      expect(res.status).toBe(200);

      // Verify Attempt & Summary
      expect(data.attempt.studentName).toBe("John Doe");
      expect(data.attempt.rollNumber).toBe("PH-042");
      expect(data.attempt.score).toBe(6);
      expect(data.attempt.maxScore).toBe(10);
      expect(data.summary.totalQuestions).toBe(4);
      expect(data.summary.answeredCount).toBe(3);
      expect(data.summary.unansweredCount).toBe(1);
      expect(data.summary.correctCount).toBe(2);
      expect(data.summary.incorrectCount).toBe(1);

      // Total marks reconciliation
      const totalMarksTally = data.questions.reduce((sum: number, q: { marksAwarded: number }) => sum + q.marksAwarded, 0);
      expect(totalMarksTally).toBe(data.attempt.score);

      // Verify Condition 1: NO speculative parentGroupId or subPart placeholders
      for (const q of data.questions) {
        expect(q).not.toHaveProperty("parentGroupId");
        expect(q).not.toHaveProperty("subPart");
      }

      // Verify Question 1 (MCQ) option mapping
      const q1 = data.questions[0];
      expect(q1.id).toBe("q-mcq");
      expect(q1.type).toBe("MCQ");
      expect(q1.isAnswered).toBe(true);
      expect(q1.isCorrect).toBe(true);
      expect(q1.marksAwarded).toBe(4);
      expect(q1.submittedOptionIndex).toBe(0); // Translated from visible 1 through map [1, 0, 2, 3]
      expect(q1.submittedOptionLetter).toBe("A");
      expect(q1.submittedAnswer).toBe("Newton");
      expect(q1.correctAnswer).toBe("Newton");
      expect(q1.correctOptionLetter).toBe("A");
      expect(q1.explanation).toBe("Force is measured in Newtons (N = kg*m/s^2).");
      expect(q1.options).toHaveLength(4);
      expect(q1.options[0]).toMatchObject({ letter: "A", text: "Newton", isCorrect: true, isSelected: true });
      expect(q1.options[1]).toMatchObject({ letter: "B", text: "Joule", isCorrect: false, isSelected: false });

      // Verify Question 2 (TRUE_FALSE)
      const q2 = data.questions[1];
      expect(q2.type).toBe("TRUE_FALSE");
      expect(q2.isAnswered).toBe(true);
      expect(q2.isCorrect).toBe(true);
      expect(q2.marksAwarded).toBe(2);
      expect(q2.submittedAnswer).toBe("true");
      expect(q2.correctAnswer).toBe("true");
      expect(q2.explanation).toBe("Law of conservation of energy.");

      // Verify Question 3 (NUMERICAL) - Incorrect
      const q3 = data.questions[2];
      expect(q3.type).toBe("NUMERICAL");
      expect(q3.isAnswered).toBe(true);
      expect(q3.isCorrect).toBe(false);
      expect(q3.marksAwarded).toBe(0);
      expect(q3.submittedAnswer).toBe("10");
      expect(q3.correctAnswer).toBe("9.8");
      expect(q3.explanation).toBe("Standard acceleration due to gravity is approximately 9.8 m/s^2.");

      // Verify Question 4 (SHORT_ANSWER) - Unanswered
      const q4 = data.questions[3];
      expect(q4.type).toBe("SHORT_ANSWER");
      expect(q4.isAnswered).toBe(false);
      expect(q4.isCorrect).toBeNull();
      expect(q4.marksAwarded).toBe(0);
      expect(q4.submittedAnswer).toBeNull();
      expect(q4.correctAnswer).toBe("Density");
      expect(q4.explanation).toBe("Density is mass divided by volume.");
    });
  });
});
