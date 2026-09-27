/**
 * tools/addQuestionsToTest.ts — MCP Tool: add_questions_to_test
 *
 * Generates and inserts additional questions into an existing DRAFT test.
 * Validates test ownership, editability, and question quality before insertion.
 */

import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";
import { logger } from "../logger.js";
import { OpenAIProvider } from "../providers/openai.js";
import { validateQuestion } from "../orchestrator/validateExam.js";
import { verifyAnswer } from "../orchestrator/verifyAnswers.js";
import { deduplicateBatch } from "../orchestrator/detectDuplicates.js";
import { toProctorEdQuestion, type GeneratedQuestion } from "../schemas.js";
import { getConfig } from "../config.js";
import type { GenerateBatchParams } from "../providers/openai.js";

const InputSchema = z.object({
  testId: z.string().min(1),
  topic: z.string().min(1).max(200),
  count: z.number().int().min(1).max(50),
  type: z.enum(["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional().default("medium"),
  marksPerQuestion: z.number().positive().max(100).optional().default(1),
  negativeMarks: z.number().min(0).max(100).optional().default(0),
});

export const addQuestionsToTestTool = {
  name: "add_questions_to_test",
  description: "Add AI-generated questions to an existing DRAFT test. Cannot modify published or closed tests.",

  inputSchema: {
    type: "object" as const,
    properties: {
      testId: { type: "string", description: "ID of the draft test to add questions to" },
      topic: { type: "string", description: "Topic for the new questions" },
      count: { type: "number", description: "Number of questions to add (1-50)" },
      type: { type: "string", enum: ["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"], description: "Question type" },
      difficulty: { type: "string", enum: ["easy", "medium", "hard", "mixed"], description: "Difficulty level (default: medium)" },
      marksPerQuestion: { type: "number", description: "Marks per question (default: 1)" },
      negativeMarks: { type: "number", description: "Negative marks per wrong answer (default: 0)" },
    },
    required: ["testId", "topic", "count", "type"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "add_questions_to_test", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: parsed.error.errors.map((e) => e.message).join("; "), retryable: false });
    }

    const { testId, topic, count, type, difficulty, marksPerQuestion, negativeMarks } = parsed.data;
    const client = new ProctorEdClient();
    const cfg = getConfig();
    const provider = new OpenAIProvider();

    // Verify test is editable
    const test = await client.getTest(testId);
    if (test.status === "PUBLISHED" || test.status === "CLOSED" || test.status === "ARCHIVED") {
      throw new McpError({
        code: "TEST_NOT_EDITABLE",
        message: `Cannot add questions to a ${test.status} test. Only DRAFT tests are editable.`,
        retryable: false,
      });
    }

    // Fetch existing questions for duplicate detection
    const existingRaw = await client.getQuestions(testId);
    const existingQuestions: GeneratedQuestion[] = existingRaw.map((q) => ({
      type: q.type as "MCQ",
      questionText: q.questionText,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      correctOptionIndex: 0,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      difficulty: "medium",
    }));

    const params: GenerateBatchParams = {
      subject: test.subject,
      topic,
      className: test.className,
      questionType: type,
      difficulty: difficulty === "mixed" ? "mixed" : difficulty,
      count: Math.min(cfg.generation.batchSize, count),
      marksPerQuestion,
      negativeMarks,
      requestId,
    };

    const accepted: GeneratedQuestion[] = [];
    const pool = [...existingQuestions];
    let attempts = 0;
    const maxAttempts = cfg.generation.maxRetriesPerQuestion * count;

    while (accepted.length < count && attempts < maxAttempts) {
      const needed = Math.min(cfg.generation.batchSize, count - accepted.length);
      params.count = needed;

      let batch: GeneratedQuestion[];
      try {
        batch = await provider.generateBatch(params);
      } catch {
        attempts++;
        continue;
      }

      for (const rawQ of batch) {
        if (accepted.length >= count) break;

        const validation = validateQuestion(rawQ);
        if (!validation.valid) { attempts++; continue; }

        const verify = await verifyAnswer(rawQ, { subject: test.subject, topic, requestId }, provider);
        if (!verify.valid || verify.confidence < 0.6) { attempts++; continue; }

        const { accepted: deduped, duplicateCount } = deduplicateBatch([rawQ], pool);
        if (duplicateCount > 0) { attempts++; continue; }

        accepted.push(deduped[0]!);
        pool.push(deduped[0]!);
      }

      attempts++;
    }

    if (accepted.length < count) {
      throw new McpError({
        code: "GENERATION_FAILED",
        message: `Could only generate ${accepted.length}/${count} valid unique questions for topic "${topic}".`,
        retryable: false,
      });
    }

    const payloads = accepted.map(toProctorEdQuestion);
    for (const payload of payloads) {
      await client.createQuestion(testId, payload);
    }

    audit({ requestId, toolName: "add_questions_to_test", action: "QUESTIONS_INSERTED", timestamp: new Date().toISOString(), testId, generatedQuestionCount: accepted.length });

    return {
      success: true,
      testId,
      addedCount: accepted.length,
      message: `Added ${accepted.length} ${type} questions to "${test.title}".`,
    };
  },
};
