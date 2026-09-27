/**
 * schemas.ts — Shared domain contracts for the MCP server.
 *
 * These schemas mirror ProctorED's lib/validation/test.ts but extend them
 * with MCP-specific fields (difficulty, curriculum metadata, etc.).
 * They are the SINGLE source of truth within the MCP server.
 *
 * Note: correctAnswer uses the same encoding as ProctorED:
 *   MCQ        → string-encoded index ("0", "1", ...)
 *   TRUE_FALSE → "true" | "false"
 *   NUMERICAL  → string-encoded number ("42.5")
 *   SHORT_ANSWER → expected answer text
 */

import { z } from "zod";

// ── Difficulty ────────────────────────────────────────────────────────────────

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

// ── MCQ ───────────────────────────────────────────────────────────────────────

export const McqQuestionSchema = z.object({
  type: z.literal("MCQ"),
  questionText: z.string().min(5).max(5000),
  options: z
    .array(z.string().min(1).max(500))
    .min(2)
    .max(6),
  correctOptionIndex: z.number().int().min(0),
  marks: z.number().positive().max(100),
  negativeMarks: z.number().min(0).max(100),
  explanation: z.string().max(2000).optional(),
  difficulty: DifficultySchema,
});

export type McqQuestion = z.infer<typeof McqQuestionSchema>;

// ── TRUE_FALSE ────────────────────────────────────────────────────────────────

export const TrueFalseQuestionSchema = z.object({
  type: z.literal("TRUE_FALSE"),
  questionText: z.string().min(5).max(5000),
  correctAnswer: z.boolean(),
  marks: z.number().positive().max(100),
  negativeMarks: z.number().min(0).max(100),
  explanation: z.string().max(2000).optional(),
  difficulty: DifficultySchema,
});

export type TrueFalseQuestion = z.infer<typeof TrueFalseQuestionSchema>;

// ── NUMERICAL ─────────────────────────────────────────────────────────────────

export const NumericalQuestionSchema = z.object({
  type: z.literal("NUMERICAL"),
  questionText: z.string().min(5).max(5000),
  correctAnswer: z.number().finite(),
  tolerance: z.number().min(0).optional(),
  unit: z.string().max(30).optional(),
  marks: z.number().positive().max(100),
  negativeMarks: z.number().min(0).max(100),
  explanation: z.string().max(2000).optional(),
  difficulty: DifficultySchema,
});

export type NumericalQuestion = z.infer<typeof NumericalQuestionSchema>;

// ── SHORT_ANSWER ──────────────────────────────────────────────────────────────

export const ShortAnswerQuestionSchema = z.object({
  type: z.literal("SHORT_ANSWER"),
  questionText: z.string().min(5).max(5000),
  expectedAnswer: z.string().min(1).max(500),
  acceptableAnswers: z.array(z.string().min(1).max(500)).optional(),
  marks: z.number().positive().max(100),
  negativeMarks: z.number().min(0).max(100),
  explanation: z.string().max(2000).optional(),
  difficulty: DifficultySchema,
});

export type ShortAnswerQuestion = z.infer<typeof ShortAnswerQuestionSchema>;

// ── Discriminated union ───────────────────────────────────────────────────────

export const GeneratedQuestionSchema = z.discriminatedUnion("type", [
  McqQuestionSchema,
  TrueFalseQuestionSchema,
  NumericalQuestionSchema,
  ShortAnswerQuestionSchema,
]);

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
export type QuestionType = GeneratedQuestion["type"];

// ── ProctorED-compatible wire format ─────────────────────────────────────────
// Converts our rich schema to what POST /api/tests/:id/questions expects.

export function toProctorEdQuestion(q: GeneratedQuestion): {
  type: string;
  questionText: string;
  options?: string[];
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
  explanation?: string;
} {
  const base = {
    type: q.type as string,
    questionText: q.questionText,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    explanation: q.explanation,
  };

  switch (q.type) {
    case "MCQ":
      return { ...base, options: q.options, correctAnswer: String(q.correctOptionIndex) };
    case "TRUE_FALSE":
      return { ...base, correctAnswer: String(q.correctAnswer) };
    case "NUMERICAL":
      return { ...base, correctAnswer: String(q.correctAnswer) };
    case "SHORT_ANSWER":
      return { ...base, correctAnswer: q.expectedAnswer };
  }
  return base as any;
}

// ── Generation input schema ───────────────────────────────────────────────────

export const CreateExamInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(100),
  className: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(5).max(180),
  questions: z.array(GeneratedQuestionSchema).min(1).max(100),
});

export type CreateExamInput = z.infer<typeof CreateExamInputSchema>;



// ── Paper validation result ───────────────────────────────────────────────────

export interface ValidationIssue {
  questionIndex?: number;
  field?: string;
  message: string;
}

export interface PaperValidationResult {
  valid: boolean;
  questionCount: number;
  totalMarks: number;
  duplicateCount: number;
  structuralErrors: ValidationIssue[];
  semanticErrors: ValidationIssue[];
  answerErrors: ValidationIssue[];
  distributionErrors: ValidationIssue[];
  warnings: ValidationIssue[];
}

