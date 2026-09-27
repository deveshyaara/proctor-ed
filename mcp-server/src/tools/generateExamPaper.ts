/**
 * tools/generateExamPaper.ts — MCP Tool: generate_exam_paper
 *
 * Validates input → orchestrates generation → returns draft test info.
 * NEVER publishes automatically.
 */

import { z } from "zod";
import { GenerateExamInputSchema, type GenerateExamInput } from "../schemas.js";
import { generateExam } from "../orchestrator/generateExam.js";
import { OpenAIProvider } from "../providers/openai.js";
import { McpError } from "../errors.js";
import { logger } from "../logger.js";
import { audit } from "../audit.js";

export const generateExamPaperTool = {
  name: "generate_exam_paper",
  description: `Generate a complete exam paper and save it as a DRAFT in ProctorED.

The paper is NEVER published automatically. After reviewing, use publish_test to publish.

Returns: testId, testCode, title, questionCount, totalMarks, previewUrl.`,

  inputSchema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "Subject area (e.g. Biology, Mathematics)" },
      topic: { type: "string", description: "Specific topic (e.g. Photosynthesis, Quadratic Equations)" },
      className: { type: "string", description: "Target class or grade (e.g. 10, XI)" },
      board: { type: "string", description: "Curriculum board (e.g. CBSE, ICSE, IB)" },
      curriculum: { type: "string", description: "Curriculum name or framework" },
      academicYear: { type: "string", description: "Academic year (e.g. 2026-27)" },
      chapter: { type: "string", description: "Specific chapter within the topic" },
      learningObjectives: { type: "array", items: { type: "string" }, description: "Learning objectives to target" },
      questionCount: { type: "number", description: "Total number of questions (1-100)" },
      questionTypes: { type: "array", items: { type: "string", enum: ["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"] }, description: "Types of questions to include" },
      questionDistribution: { type: "object", description: "Exact count per question type" },
      durationMinutes: { type: "number", description: "Exam duration in minutes (5-180)" },
      difficultyLevel: { type: "string", enum: ["easy", "medium", "hard", "mixed"], description: "Overall difficulty level" },
      difficultyDistribution: { type: "object", description: "Exact count per difficulty level" },
      marksPerQuestion: { type: "number", description: "Marks per question (default: 1)" },
      negativeMarking: { type: "boolean", description: "Enable negative marking" },
      negativeMarks: { type: "number", description: "Marks deducted per wrong answer" },
      language: { type: "string", description: "Question language (default: English)" },
      idempotencyKey: { type: "string", description: "Unique key to prevent duplicate creation on retry" },
    },
    required: ["subject", "topic", "className", "questionCount", "questionTypes", "durationMinutes", "difficultyLevel"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "generate_exam_paper", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = GenerateExamInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({
        code: "INVALID_INPUT",
        message: "Invalid input: " + parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        retryable: false,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const input: GenerateExamInput = parsed.data;
    const provider = new OpenAIProvider();

    try {
      const result = await generateExam(input, provider, requestId);

      return {
        success: true,
        ...result,
        message: [
          `✅ Created draft exam: "${result.title}"`,
          `📋 ${result.questionCount} questions | ${result.totalMarks} marks | Status: DRAFT`,
          `🔗 Preview: ${result.previewUrl}`,
          ``,
          `⚠️  This paper has NOT been published. Review it and call publish_test to make it live.`,
          result.curriculumVerified ? `✅ Curriculum context provided.` : `⚠️  No board/curriculum provided — content is not syllabus-certified.`,
          result.rejectedQuestions > 0 ? `ℹ️  ${result.rejectedQuestions} questions were rejected and regenerated during quality checks.` : "",
        ].filter(Boolean).join("\n"),
      };
    } catch (err) {
      audit({ requestId, toolName: "generate_exam_paper", action: "TOOL_FAILED", timestamp: new Date().toISOString(), result: String(err) });
      throw err;
    }
  },
};
