import { prisma } from "@/lib/db/client";
import { scoreAttempt } from "./scoring";
import type { AttemptStatus } from "@prisma/client";

export interface SubmissionResult {
  alreadySubmitted: boolean;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  status: AttemptStatus;
}

/**
 * Authoritatively and atomically submit & score an attempt.
 * Safe against concurrent invocations (conditional atomic DB update).
 * Used by both POST /submit and POST /event (on warning limit auto-termination).
 */
export async function executeAttemptSubmission(
  attemptId: string,
  targetStatus: "SUBMITTED" | "AUTO_SUBMITTED" | "TERMINATED" = "SUBMITTED"
): Promise<SubmissionResult> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      testId: true,
      status: true,
      score: true,
      maxScore: true,
      optionOrderMap: true,
    },
  });

  if (!attempt) {
    throw new Error("Attempt not found");
  }

  // If already in a terminal state, return current score idempotently
  if (attempt.status !== "IN_PROGRESS" && attempt.status !== "CREATED") {
    const percentage =
      attempt.score !== null && attempt.maxScore
        ? Math.round((attempt.score / attempt.maxScore) * 10000) / 100
        : null;

    return {
      alreadySubmitted: true,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage,
      status: attempt.status,
    };
  }

  // Transaction: atomically claim attempt status transition
  const result = await prisma.$transaction(async (tx) => {
    // Conditional update — only 1 concurrent execution will get updated.count === 1
    const updated = await tx.attempt.updateMany({
      where: { id: attemptId, status: { in: ["IN_PROGRESS", "CREATED"] } },
      data: { status: targetStatus, submittedAt: new Date() },
    });

    if (updated.count === 0) {
      // Lost race to concurrent request
      return null;
    }

    const questions = await tx.question.findMany({
      where: { testId: attempt.testId },
      select: {
        id: true,
        type: true,
        correctAnswer: true,
        marks: true,
        negativeMarks: true,
        options: true,
      },
    });

    const answers = await tx.answer.findMany({
      where: { attemptId: attemptId },
      select: { questionId: true, answer: true },
    });

    const optionOrderMap = (attempt.optionOrderMap as Record<string, number[]> | null) ?? null;

    const scoring = scoreAttempt(
      questions.map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? (q.options as string[]) : null,
        type: q.type as "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER",
      })),
      answers,
      optionOrderMap
    );

    // Bulk update answers with correctness and marks
    for (const answerResult of scoring.answers) {
      await tx.answer.updateMany({
        where: { attemptId: attemptId, questionId: answerResult.questionId },
        data: {
          isCorrect: answerResult.isCorrect,
          marksAwarded: answerResult.marksAwarded,
        },
      });
    }

    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        score: scoring.score,
        maxScore: scoring.maxScore,
      },
    });

    return {
      alreadySubmitted: false,
      score: scoring.score,
      maxScore: scoring.maxScore,
      percentage: scoring.percentage,
      status: targetStatus as AttemptStatus,
    };
  });

  if (!result) {
    // Concurrent request completed submission; fetch recorded state
    const current = await prisma.attempt.findUnique({ where: { id: attemptId } });
    const percentage =
      current?.score !== null && current?.maxScore
        ? Math.round((current.score / current.maxScore) * 10000) / 100
        : null;

    return {
      alreadySubmitted: true,
      score: current?.score ?? null,
      maxScore: current?.maxScore ?? null,
      percentage,
      status: current?.status ?? targetStatus,
    };
  }

  return result;
}
