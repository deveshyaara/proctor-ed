/**
 * orchestrator/validateExam.ts — Structural + semantic question validation.
 *
 * Validates questions against the domain schemas and additional
 * semantic rules that Zod alone cannot check.
 */

import {
  GeneratedQuestionSchema,
  type GeneratedQuestion,
  type ValidationIssue,
  type PaperValidationResult,
} from "../schemas.js";

// ── Per-question structural validation ───────────────────────────────────────

export interface QuestionValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validateQuestion(q: unknown, index?: number): QuestionValidationResult {
  const parsed = GeneratedQuestionSchema.safeParse(q);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.errors.map((e) => ({
        questionIndex: index,
        field: e.path.join("."),
        message: e.message,
      })),
    };
  }

  // Semantic checks beyond Zod
  const issues: ValidationIssue[] = [];
  const data = parsed.data;

  // Check: question text is not too short (min meaningful length)
  if (data.questionText.trim().length < 10) {
    issues.push({ questionIndex: index, field: "questionText", message: "Question text is too short to be meaningful." });
  }

  // Check: question does not contain "Correct answer is" (answer embedded)
  if (/correct answer is/i.test(data.questionText)) {
    issues.push({ questionIndex: index, field: "questionText", message: "Question text appears to embed the correct answer." });
  }

  // MCQ-specific: check answer not embedded in options via obvious cues
  if (data.type === "MCQ") {
    const correctOpt = data.options[data.correctOptionIndex];
    if (correctOpt === undefined) {
      issues.push({ questionIndex: index, field: "correctOptionIndex", message: "Correct option index points to non-existent option." });
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Paper-level validation ────────────────────────────────────────────────────

interface PaperConstraints {
  questionCount: number;
  questionTypes: string[];
  questionDistribution?: Record<string, number>;
  difficultyLevel: string;
  difficultyDistribution?: Record<string, number>;
  marksPerQuestion?: number;
}

export function validatePaper(
  questions: GeneratedQuestion[],
  constraints: PaperConstraints
): PaperValidationResult {
  const structuralErrors: ValidationIssue[] = [];
  const semanticErrors: ValidationIssue[] = [];
  const answerErrors: ValidationIssue[] = [];
  const distributionErrors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Question count
  if (questions.length !== constraints.questionCount) {
    structuralErrors.push({
      message: `Expected ${constraints.questionCount} questions, got ${questions.length}.`,
    });
  }

  // 2. No empty question texts
  questions.forEach((q, i) => {
    if (!q.questionText?.trim()) {
      structuralErrors.push({ questionIndex: i, field: "questionText", message: "Empty question text." });
    }
  });

  // 3. Type distribution
  const typeCounts: Record<string, number> = {};
  for (const q of questions) {
    const type = (q as GeneratedQuestion).type;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  if (constraints.questionDistribution) {
    for (const [type, expected] of Object.entries(constraints.questionDistribution)) {
      const actual = typeCounts[type] ?? 0;
      if (actual !== expected) {
        distributionErrors.push({
          message: `Expected ${expected} ${type} questions, got ${actual}.`,
        });
      }
    }
  }

  // 4. Difficulty distribution
  const diffCounts: Record<string, number> = {};
  for (const q of questions) {
    const diff = (q as { difficulty?: string }).difficulty ?? "unknown";
    diffCounts[diff] = (diffCounts[diff] ?? 0) + 1;
  }

  if (constraints.difficultyLevel !== "mixed" && questions.length > 0) {
    const expected = constraints.difficultyLevel;
    const actual = diffCounts[expected] ?? 0;
    if (actual !== questions.length) {
      warnings.push({
        message: `Difficulty level "${expected}" requested but only ${actual}/${questions.length} questions match.`,
      });
    }
  }

  if (constraints.difficultyDistribution) {
    for (const [diff, expected] of Object.entries(constraints.difficultyDistribution)) {
      const actual = diffCounts[diff] ?? 0;
      if (actual < expected) {
        distributionErrors.push({
          message: `Expected at least ${expected} "${diff}" questions, got ${actual}.`,
        });
      }
    }
  }

  // 5. Marks consistency
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  if (constraints.marksPerQuestion) {
    const expected = constraints.marksPerQuestion * constraints.questionCount;
    if (Math.abs(totalMarks - expected) > 0.01) {
      warnings.push({ message: `Total marks ${totalMarks} differs from expected ${expected}.` });
    }
  }

  // 6. Negative marks sanity
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q && q.negativeMarks > q.marks) {
      structuralErrors.push({ questionIndex: i, field: "negativeMarks", message: "negativeMarks exceeds marks." });
    }
  }

  const valid =
    structuralErrors.length === 0 &&
    semanticErrors.length === 0 &&
    answerErrors.length === 0 &&
    distributionErrors.length === 0;

  return {
    valid,
    questionCount: questions.length,
    totalMarks,
    duplicateCount: 0, // Set externally after deduplication
    structuralErrors,
    semanticErrors,
    answerErrors,
    distributionErrors,
    warnings,
  };
}
