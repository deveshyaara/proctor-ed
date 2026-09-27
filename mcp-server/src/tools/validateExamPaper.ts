/**
 * tools/validateExamPaper.ts — MCP Tool: validate_exam_paper
 *
 * Reads an existing test + its questions and runs the full validation pipeline.
 * Read-only: never modifies the test.
 */

import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";
import { validateQuestion, validatePaper } from "../orchestrator/validateExam.js";
import { deduplicateBatch } from "../orchestrator/detectDuplicates.js";
import type { GeneratedQuestion } from "../schemas.js";
import type { ProctorQuestion } from "../client.js";

const InputSchema = z.object({
  testId: z.string().min(1),
});

export function toGeneratedQuestion(q: ProctorQuestion): GeneratedQuestion | null {
  if (q.type === "MCQ") {
    const options = Array.isArray(q.options) ? (q.options as string[]) : [];
    const correctIdx = parseInt(q.correctAnswer, 10);
    return {
      type: "MCQ",
      questionText: q.questionText,
      options,
      correctOptionIndex: correctIdx,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation ?? undefined,
      difficulty: "medium", // not stored in ProctorED schema
    };
  }
  if (q.type === "TRUE_FALSE") {
    return {
      type: "TRUE_FALSE",
      questionText: q.questionText,
      correctAnswer: q.correctAnswer.toLowerCase() === "true",
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation ?? undefined,
      difficulty: "medium",
    };
  }
  if (q.type === "NUMERICAL") {
    const num = parseFloat(q.correctAnswer);
    if (isNaN(num)) return null;
    return {
      type: "NUMERICAL",
      questionText: q.questionText,
      correctAnswer: num,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation ?? undefined,
      difficulty: "medium",
    };
  }
  if (q.type === "SHORT_ANSWER") {
    return {
      type: "SHORT_ANSWER",
      questionText: q.questionText,
      expectedAnswer: q.correctAnswer,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation ?? undefined,
      difficulty: "medium",
    };
  }
  return null;
}

export const validateExamPaperTool = {
  name: "validate_exam_paper",
  description: "Validate an existing exam paper. Returns structural, semantic, and distribution errors. Never modifies the test.",

  inputSchema: {
    type: "object" as const,
    properties: {
      testId: { type: "string", description: "ID of the test to validate" },
    },
    required: ["testId"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "validate_exam_paper", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: "testId is required", retryable: false });
    }

    const { testId } = parsed.data;
    const client = new ProctorEdClient();

    const [test, rawQuestions] = await Promise.all([
      client.getTest(testId),
      client.getQuestions(testId),
    ]);

    const structuralErrors: Array<{ questionIndex?: number; field?: string; message: string }> = [];

    const questions: GeneratedQuestion[] = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      const raw = rawQuestions[i];
      if (!raw) continue;
      const converted = toGeneratedQuestion(raw);
      if (!converted) {
        structuralErrors.push({ questionIndex: i, message: `Unknown question type: ${raw.type}` });
        continue;
      }

      const validation = validateQuestion(converted, i);
      if (!validation.valid) structuralErrors.push(...validation.issues);
      else questions.push(converted);
    }

    const { accepted, duplicateCount } = deduplicateBatch(questions, []);
    const paperResult = validatePaper(accepted, {
      questionCount: rawQuestions.length,
      questionTypes: [...new Set(rawQuestions.map((q) => q.type))],
      difficultyLevel: "mixed",
    });

    paperResult.duplicateCount = duplicateCount;
    paperResult.structuralErrors.push(...structuralErrors);
    paperResult.valid = paperResult.structuralErrors.length === 0 &&
      paperResult.semanticErrors.length === 0 &&
      paperResult.answerErrors.length === 0 &&
      paperResult.distributionErrors.length === 0;

    audit({ requestId, toolName: "validate_exam_paper", action: "VALIDATION_COMPLETED", timestamp: new Date().toISOString(), testId });

    return {
      testId,
      title: test.title,
      status: test.status,
      ...paperResult,
    };
  },
};
