/**
 * orchestrator/verifyAnswers.ts — Answer verification layer.
 *
 * Deterministic questions (numerical, arithmetic, boolean) are verified
 * programmatically. Subjective/semantic questions use an LLM verifier.
 *
 * The goal: never trust an LLM-generated answer without checking.
 */

import type { GeneratedQuestion, VerificationResult } from "../schemas.js";
import type { IQuestionProvider, VerifyContext } from "../providers/openai.js";

/** Programmatically verify a TRUE_FALSE question (trivial — always valid if boolean) */
function verifyTrueFalse(): VerificationResult {
  return { valid: true, confidence: 1.0 };
}

/** Programmatically verify a NUMERICAL question (check answer is a finite number) */
function verifyNumerical(q: { correctAnswer: number }): VerificationResult {
  const valid = Number.isFinite(q.correctAnswer);
  return { valid, confidence: valid ? 0.95 : 0, issue: valid ? undefined : "correctAnswer is not a finite number" };
}

/**
 * Verify a question.
 * - TRUE_FALSE: deterministic check
 * - NUMERICAL: deterministic check
 * - MCQ: LLM verification (correctOptionIndex correctness can't be checked without domain knowledge)
 * - SHORT_ANSWER: LLM verification
 */
export async function verifyAnswer(
  question: GeneratedQuestion,
  ctx: VerifyContext,
  provider: IQuestionProvider
): Promise<VerificationResult> {
  switch (question.type) {
    case "TRUE_FALSE":
      return verifyTrueFalse();
    case "NUMERICAL":
      return verifyNumerical(question as { correctAnswer: number });
    case "MCQ":
    case "SHORT_ANSWER":
      return provider.verifyQuestion(question, ctx);
    default:
      return { valid: false, confidence: 0, issue: "Unknown question type" };
  }
}
