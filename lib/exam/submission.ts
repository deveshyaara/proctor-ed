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
 *
 * Architecture:
 * 1. Pre-fetch: all reads (questions, answers) happen OUTSIDE the transaction,
 *    in parallel, so the transaction body is pure writes only.
 * 2. Transaction: exactly 2 writes — conditional status claim + score update.
 *    Kept intentionally minimal (~2 round-trips) so it works reliably regardless
 *    of connection pooler configuration.
 * 3. Post-transaction: answer isCorrect/marksAwarded written in parallel after
 *    the transaction commits. Idempotent — safe to retry if interrupted. Does not
 *    affect submission atomicity (status + score are already committed).
 */
export async function executeAttemptSubmission(
  attemptId: string,
  targetStatus: "SUBMITTED" | "AUTO_SUBMITTED" | "TERMINATED" | "EXPIRED" = "SUBMITTED"
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

  // ── PRE-FETCH: reads outside the transaction ─────────────────────────────
  // Questions are immutable after publish; student answers are stable by
  // submission time (written by a separate per-question sync endpoint).
  // Fetching here keeps the transaction body to 2 pure writes, minimising
  // lock hold time and eliminating N+1 latency accumulation inside the tx.
  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { testId: attempt.testId },
      select: {
        id: true,
        type: true,
        correctAnswer: true,
        marks: true,
        negativeMarks: true,
        options: true,
      },
    }),
    prisma.answer.findMany({
      where: { attemptId },
      select: { questionId: true, answer: true },
    }),
  ]);

  const optionOrderMap =
    (attempt.optionOrderMap as Record<string, number[]> | null) ?? null;

  const scoring = scoreAttempt(
    questions.map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
      type: q.type as "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER",
    })),
    answers,
    optionOrderMap
  );

  // ── TRANSACTION: atomic status claim + score (2 writes only) ─────────────
  // Conditional update — only 1 concurrent execution will get count === 1.
  // Score is committed atomically with status so the attempt is never SUBMITTED
  // without a score.
  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.attempt.updateMany({
      where: { id: attemptId, status: { in: ["IN_PROGRESS", "CREATED"] } },
      data: { status: targetStatus, submittedAt: new Date() },
    });

    if (updated.count === 0) {
      return null; // Lost race to concurrent request
    }

    await tx.attempt.update({
      where: { id: attemptId },
      data: { score: scoring.score, maxScore: scoring.maxScore },
    });

    return scoring;
  });

  if (!claimed) {
    // Concurrent request completed submission; fetch the recorded state
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

  // ── POST-TRANSACTION: write answer scoring results in parallel ────────────
  // Runs after the transaction commits — the attempt is already SUBMITTED.
  // Idempotent: SET to the same computed value on any retry. Running via
  // Promise.allSettled with retry collapses N serial round-trips into 1
  // concurrent batch and recovers from transient DB hiccups without affecting
  // the already-committed attempt score.
  const writeAnswerScores = async (retries = 2): Promise<void> => {
    const results = await Promise.allSettled(
      claimed.answers.map((ar) =>
        prisma.answer.updateMany({
          where: { attemptId, questionId: ar.questionId },
          data: { isCorrect: ar.isCorrect, marksAwarded: ar.marksAwarded },
        })
      )
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0 && retries > 0) {
      // Brief pause before retry to let transient DB issues recover
      await new Promise((resolve) => setTimeout(resolve, 500));
      return writeAnswerScores(retries - 1);
    }

    if (failed.length > 0) {
      // Log persistent failures — attempt score is already committed, so this
      // is a cosmetic inconsistency (null isCorrect on the results view) that
      // can be resolved by a background reconciliation job.
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "ANSWER_SCORE_WRITE_FAILED",
          attemptId,
          failCount: failed.length,
          timestamp: new Date().toISOString(),
        })
      );
    }
  };

  await writeAnswerScores();

  return {
    alreadySubmitted: false,
    score: claimed.score,
    maxScore: claimed.maxScore,
    percentage: claimed.percentage,
    status: targetStatus as AttemptStatus,
  };
}
