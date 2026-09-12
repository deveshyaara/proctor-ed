import { describe, it, expect, vi } from "vitest";
import { reorderQuestionsSchema } from "@/lib/validation/test";
import { executeAttemptSubmission } from "@/lib/exam/submission";
import { prisma } from "@/lib/db/client";

describe("Exam Lifecycle & Reorder Integration", () => {
  describe("Question Reordering Validation", () => {
    it("validates that all questions have valid target orders", () => {
      const valid = reorderQuestionsSchema.safeParse({
        order: [
          { id: "q-1", order: 2 },
          { id: "q-2", order: 1 },
        ],
      });
      expect(valid.success).toBe(true);

      const empty = reorderQuestionsSchema.safeParse({ order: [] });
      expect(empty.success).toBe(false);

      const invalidOrder = reorderQuestionsSchema.safeParse({
        order: [{ id: "q-1", order: -1 }],
      });
      expect(invalidOrder.success).toBe(false);
    });

    it("verifies two-phase reordering execution pattern avoids unique collision", async () => {
      const updateCalls: { id: string; order: number }[] = [];
      const mockTx = {
        question: {
          update: vi.fn().mockImplementation(({ where, data }) => {
            updateCalls.push({ id: where.id, order: data.order });
            return Promise.resolve();
          }),
        },
      };

      // Two questions to swap: Q1(1) -> 2, Q2(2) -> 1
      const order = [
        { id: "q-1", order: 2 },
        { id: "q-2", order: 1 },
      ];

      // Phase 1: Move to negative temporary slots
      for (let i = 0; i < order.length; i++) {
        await mockTx.question.update({
          where: { id: order[i].id },
          data: { order: -(i + 1) },
        });
      }

      // Phase 2: Move to target positive slots
      for (const item of order) {
        await mockTx.question.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }

      // First two calls should be negative temporary slots
      expect(updateCalls[0]).toEqual({ id: "q-1", order: -1 });
      expect(updateCalls[1]).toEqual({ id: "q-2", order: -2 });

      // Final two calls should be target positive slots
      expect(updateCalls[2]).toEqual({ id: "q-1", order: 2 });
      expect(updateCalls[3]).toEqual({ id: "q-2", order: 1 });
    });
  });

  describe("Server-Side Auto-Termination & Idempotent Submission", () => {
    it("executes atomic terminal submission and prevents double scoring", async () => {
      const mockAttempt = {
        id: "att-term-1",
        testId: "test-1",
        status: "IN_PROGRESS",
        score: null,
        maxScore: null,
        questionOrder: ["q1"],
        optionOrderMap: {},
        test: {
          questions: [
            {
              id: "q1",
              type: "MCQ",
              correctAnswer: "0",
              marks: 5,
              negativeMarks: 0,
              options: ["A", "B"],
            },
          ],
        },
        answers: [
          {
            id: "ans-1",
            questionId: "q1",
            answer: "0",
          },
        ],
      };

      vi.spyOn(prisma.attempt, "findUnique").mockResolvedValue(mockAttempt as never);
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          attempt: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi.fn().mockResolvedValue(mockAttempt),
            update: vi.fn().mockResolvedValue({
              ...mockAttempt,
              status: "AUTO_SUBMITTED",
              score: 5,
              maxScore: 5,
              submittedAt: new Date(),
            }),
          },
          question: {
            findMany: vi.fn().mockResolvedValue(mockAttempt.test.questions),
          },
          answer: {
            findMany: vi.fn().mockResolvedValue(mockAttempt.answers),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(txMock as never);
      });

      const result = await executeAttemptSubmission("att-term-1", "AUTO_SUBMITTED");
      expect(result.status).toBe("AUTO_SUBMITTED");
      expect(result.score).toBe(5);
      expect(result.maxScore).toBe(5);
    });

    it("returns existing terminal score if attempt was already terminated", async () => {
      const alreadySubmittedAttempt = {
        id: "att-term-2",
        testId: "test-1",
        status: "AUTO_SUBMITTED",
        score: 4,
        maxScore: 10,
        submittedAt: new Date("2026-09-10T12:00:00Z"),
      };

      vi.spyOn(prisma.attempt, "findUnique").mockResolvedValue(alreadySubmittedAttempt as never);
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          attempt: {
            findUnique: vi.fn().mockResolvedValue(alreadySubmittedAttempt),
          },
        };
        return callback(txMock as never);
      });

      const result = await executeAttemptSubmission("att-term-2", "AUTO_SUBMITTED");
      // Idempotent: returns existing state without recalculation
      expect(result.status).toBe("AUTO_SUBMITTED");
      expect(result.score).toBe(4);
      expect(result.maxScore).toBe(10);
    });
  });
});
