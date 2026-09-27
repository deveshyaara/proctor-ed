/**
 * tools/previewPaper.ts — MCP Tool: preview_paper
 *
 * Returns a structured preview of a test. Answers are hidden by default.
 * Teachers can request answers via includeAnswers=true.
 */

import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";

const InputSchema = z.object({
  testId: z.string().min(1),
  includeAnswers: z.boolean().optional().default(false),
  includeExplanations: z.boolean().optional().default(false),
});

export const previewPaperTool = {
  name: "preview_paper",
  description: "Get a structured preview of an exam paper. By default, correct answers are hidden.",

  inputSchema: {
    type: "object" as const,
    properties: {
      testId: { type: "string", description: "ID of the test to preview" },
      includeAnswers: { type: "boolean", description: "Include correct answers (default: false)" },
      includeExplanations: { type: "boolean", description: "Include explanations (default: false)" },
    },
    required: ["testId"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "preview_paper", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: "testId is required", retryable: false });
    }

    const { testId, includeAnswers, includeExplanations } = parsed.data;
    const client = new ProctorEdClient();

    const [test, rawQuestions] = await Promise.all([
      client.getTest(testId),
      client.getQuestions(testId),
    ]);

    const questions = rawQuestions.map((q, i) => {
      const base = {
        number: i + 1,
        type: q.type,
        questionText: q.questionText,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        ...(q.type === "MCQ" && Array.isArray(q.options) ? { options: q.options } : {}),
      };

      if (includeAnswers) {
        Object.assign(base, { correctAnswer: q.correctAnswer });
      }
      if (includeExplanations && q.explanation) {
        Object.assign(base, { explanation: q.explanation });
      }

      return base;
    });

    const totalMarks = rawQuestions.reduce((s, q) => s + q.marks, 0);

    return {
      testId: test.id,
      title: test.title,
      subject: test.subject,
      className: test.className,
      durationMinutes: Math.round(test.durationSeconds / 60),
      totalMarks,
      questionCount: rawQuestions.length,
      status: test.status,
      testCode: test.testCode,
      createdAt: test.createdAt,
      publishedAt: test.publishedAt ?? null,
      questions,
      note: !includeAnswers ? "Correct answers are hidden. Pass includeAnswers=true to reveal them." : undefined,
    };
  },
};
