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

export const GenerateExamInputSchema = z.object({
  subject: z.string().min(1).max(100),
  topic: z.string().min(1).max(200),
  className: z.string().min(1).max(50),

  board: z.string().max(50).optional(),
  curriculum: z.string().max(100).optional(),
  academicYear: z.string().max(20).optional(),
  chapter: z.string().max(200).optional(),
  learningObjectives: z.array(z.string().max(300)).max(10).optional(),

  questionCount: z.number().int().min(1).max(100),
  questionTypes: z.array(z.enum(["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"])).min(1),

  questionDistribution: z.object({
    MCQ: z.number().int().min(0).optional(),
    TRUE_FALSE: z.number().int().min(0).optional(),
    NUMERICAL: z.number().int().min(0).optional(),
    SHORT_ANSWER: z.number().int().min(0).optional(),
  }).optional(),

  durationMinutes: z.number().int().min(5).max(180),

  difficultyLevel: z.enum(["easy", "medium", "hard", "mixed"]),

  difficultyDistribution: z.object({
    easy: z.number().int().min(0).optional(),
    medium: z.number().int().min(0).optional(),
    hard: z.number().int().min(0).optional(),
  }).optional(),

  marksPerQuestion: z.number().positive().max(100).optional(),
  negativeMarking: z.boolean().optional(),
  negativeMarks: z.number().min(0).max(100).optional(),
  language: z.string().max(30).optional(),

  idempotencyKey: z.string().max(128).optional(),
});

export type GenerateExamInput = z.infer<typeof GenerateExamInputSchema>;

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

// ── Answer verification result ────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean;
  confidence: number;
  issue?: string;
}
