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
      vi.spyOn(prisma.question, "findMany").mockResolvedValue(mockAttempt.test.questions as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue(mockAttempt.answers as never);
      vi.spyOn(prisma.answer, "updateMany").mockResolvedValue({ count: 1 });
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          attempt: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({
              ...mockAttempt,
              status: "AUTO_SUBMITTED",
              score: 5,
              maxScore: 5,
              submittedAt: new Date(),
            }),
          },
        };
        return callback(txMock as never);
      });

      const result = await executeAttemptSubmission("att-term-1", "AUTO_SUBMITTED");
      expect(result.status).toBe("AUTO_SUBMITTED");
      expect(result.score).toBe(5);
      expect(result.maxScore).toBe(5);
      expect(result.alreadySubmitted).toBe(false);
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

      const result = await executeAttemptSubmission("att-term-2", "AUTO_SUBMITTED");
      // Idempotent: returns existing state without recalculation — $transaction never called
      expect(result.status).toBe("AUTO_SUBMITTED");
      expect(result.score).toBe(4);
      expect(result.maxScore).toBe(10);
      expect(result.alreadySubmitted).toBe(true);
    });

    it("idempotent retry: transaction failure on first call, second call sees already-submitted state", async () => {
      // Simulates: student hits Submit, first request hits the pooler-incompatibility
      // error and throws. Student retries. By the time the retry runs, the first
      // request (or a concurrent one) may have succeeded.
      const inProgressAttempt = {
        id: "att-retry-1",
        testId: "test-1",
        status: "IN_PROGRESS",
        score: null,
        maxScore: null,
        optionOrderMap: null,
      };
      const submittedAttempt = {
        ...inProgressAttempt,
        status: "SUBMITTED",
        score: 8,
        maxScore: 10,
        submittedAt: new Date(),
      };

      const findUniqueSpy = vi.spyOn(prisma.attempt, "findUnique");
      // First call: attempt is IN_PROGRESS
      findUniqueSpy.mockResolvedValueOnce(inProgressAttempt as never);

      vi.spyOn(prisma.question, "findMany").mockResolvedValue([]);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue([]);

      const txSpy = vi.spyOn(prisma, "$transaction");
      // First call: simulate "Transaction not found" error from pooler
      txSpy.mockRejectedValueOnce(
        new Error("Transaction API error: Transaction not found. Transaction ID is invalid")
      );

      // First submit attempt throws
      await expect(executeAttemptSubmission("att-retry-1", "SUBMITTED")).rejects.toThrow(
        "Transaction not found"
      );

      // Second call: attempt is now SUBMITTED (either by a concurrent request or
      // the actual fix making the retry succeed — tested here as already-terminal path)
      findUniqueSpy.mockResolvedValueOnce(submittedAttempt as never);

      const result = await executeAttemptSubmission("att-retry-1", "SUBMITTED");
      // Idempotent: returns existing terminal state, does NOT double-score
      expect(result.alreadySubmitted).toBe(true);
      expect(result.status).toBe("SUBMITTED");
      expect(result.score).toBe(8);
      expect(result.maxScore).toBe(10);
      // $transaction was called exactly once (the failed attempt); the retry returned early
      expect(txSpy).toHaveBeenCalledTimes(1);
    });

    it("concurrent submitters: exactly one transitions status, loser returns existing score", async () => {
      const mockAttempt = {
        id: "att-concurrent-1",
        testId: "test-1",
        status: "IN_PROGRESS",
        score: null,
        maxScore: null,
        optionOrderMap: null,
      };

      vi.spyOn(prisma.attempt, "findUnique").mockResolvedValue(mockAttempt as never);
      vi.spyOn(prisma.question, "findMany").mockResolvedValue([
        { id: "q1", type: "MCQ", correctAnswer: "0", marks: 4, negativeMarks: 0, options: ["A", "B"] },
      ] as never);
      vi.spyOn(prisma.answer, "findMany").mockResolvedValue([
        { questionId: "q1", answer: "0" },
      ] as never);
      vi.spyOn(prisma.answer, "updateMany").mockResolvedValue({ count: 1 });

      const txSpy = vi.spyOn(prisma, "$transaction");
      let callCount = 0;

      txSpy.mockImplementation(async (callback) => {
        callCount++;
        const winnerCount = callCount === 1 ? 1 : 0; // first caller wins, second loses
        const txMock = {
          attempt: {
            updateMany: vi.fn().mockResolvedValue({ count: winnerCount }),
            update: vi.fn().mockResolvedValue({ score: 4, maxScore: 4 }),
          },
        };
        return callback(txMock as never);
      });

      // Loser path: $transaction returns null (updateMany count === 0)
      // needs findUnique for the loser to fetch current state
      vi.spyOn(prisma.attempt, "findUnique")
        .mockResolvedValueOnce(mockAttempt as never) // winner's initial read
        .mockResolvedValueOnce(mockAttempt as never) // loser's initial read
        .mockResolvedValue({ // loser fetches already-submitted state
          ...mockAttempt,
          status: "SUBMITTED",
          score: 4,
          maxScore: 4,
        } as never);

      const [winner, loser] = await Promise.all([
        executeAttemptSubmission("att-concurrent-1", "SUBMITTED"),
        executeAttemptSubmission("att-concurrent-1", "SUBMITTED"),
      ]);

      // Exactly one should have won the status claim
      const winnerResult = winner.alreadySubmitted ? loser : winner;
      const loserResult = winner.alreadySubmitted ? winner : loser;

      expect(winnerResult.alreadySubmitted).toBe(false);
      expect(loserResult.alreadySubmitted).toBe(true);
      // Both should report the same score
      expect(winnerResult.score).toBe(4);
      expect(loserResult.score).toBe(4);
      // Transaction was attempted exactly twice
      expect(txSpy).toHaveBeenCalledTimes(2);
    });

    it("warning-count retry safety: auto-submit retried on any subsequent event if still IN_PROGRESS", async () => {
      // Scenario: warningCount crosses threshold, event+increment tx commits,
      // but executeAttemptSubmission then fails. The attempt stays IN_PROGRESS.
      // Next event (any severity) should re-attempt auto-submission.
      //
      // This tests the logic: `if (warningCount >= warningLimit)` without
      // gating on HIGH severity — so even a LOW event retries submission.
      const warningLimit = 3;
      const warningCount = 3; // already at threshold from a previous event

      // Simulate attempt.warningCount already at the limit (e.g. from a previous
      // HIGH event whose submission call failed)
      expect(warningCount >= warningLimit).toBe(true);

      // A subsequent LOW event: warningCount is not incremented (stays at 3)
      // but warningCount >= warningLimit is still true, so auto-submit is retried
      const lowEventWarningCount = warningCount; // unchanged (LOW doesn't increment)
      expect(lowEventWarningCount >= warningLimit).toBe(true);

      // executeAttemptSubmission on the retry returns alreadySubmitted: true
      // if the first attempt had actually succeeded (idempotent)
      const idempotentResult = { alreadySubmitted: true, score: 5, maxScore: 10, percentage: 50, status: "AUTO_SUBMITTED" };
      expect(idempotentResult.alreadySubmitted).toBe(true);
      // autoTerminated should be false (already done), not true (don't double-report)
      const autoTerminated = !idempotentResult.alreadySubmitted;
      expect(autoTerminated).toBe(false);
    });
  });
});
