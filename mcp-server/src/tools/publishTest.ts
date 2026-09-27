/**
 * tools/publishTest.ts — MCP Tool: publish_test
 *
 * PRIVILEGED OPERATION. Publishes a DRAFT test.
 *
 * Safety properties:
 * - Runs full validation before publishing
 * - Requires confirmation flag to prevent accidental publishing
 * - Logs audit trail
 * - Never auto-publishes from generate_exam_paper
 */

import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";
import { validateQuestion, validatePaper } from "../orchestrator/validateExam.js";
import { toGeneratedQuestion } from "./validateExamPaper.js";

const InputSchema = z.object({
  testId: z.string().min(1),
  confirmPublish: z.boolean().optional(),
});

// Re-export the helper from validateExamPaper
export { toGeneratedQuestion };

export const publishTestTool = {
  name: "publish_test",
  description: `Publish a DRAFT exam paper. This is a privileged operation.

IMPORTANT: You MUST set confirmPublish=true to actually publish. Without it, only a pre-flight validation runs.

The test must:
- Be in DRAFT status
- Have at least 1 question
- Pass structural validation

Once published, students can access the test.`,

  inputSchema: {
    type: "object" as const,
    properties: {
      testId: { type: "string", description: "ID of the draft test to publish" },
      confirmPublish: { type: "boolean", description: "Set to true to confirm publishing (required to actually publish)" },
    },
    required: ["testId"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "publish_test", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: "testId is required", retryable: false });
    }

    const { testId, confirmPublish } = parsed.data;
    const client = new ProctorEdClient();

    // Always run validation regardless of confirmPublish
    const [test, rawQuestions] = await Promise.all([
      client.getTest(testId),
      client.getQuestions(testId),
    ]);

    if (test.status !== "DRAFT") {
      throw new McpError({
        code: "TEST_NOT_EDITABLE",
        message: `Cannot publish — test is ${test.status}. Only DRAFT tests can be published.`,
        retryable: false,
      });
    }

    if (rawQuestions.length === 0) {
      throw new McpError({ code: "PAPER_VALIDATION_FAILED", message: "Cannot publish an exam with no questions.", retryable: false });
    }

    // Validate all questions structurally
    const validationIssues: Array<{ questionIndex?: number; field?: string; message: string }> = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      const raw = rawQuestions[i]!;
      const converted = toGeneratedQuestion(raw);
      if (!converted) {
        validationIssues.push({ questionIndex: i, message: `Unknown question type: ${raw.type}` });
        continue;
      }
      const v = validateQuestion(converted, i);
      if (!v.valid) validationIssues.push(...v.issues);
    }

    if (validationIssues.length > 0) {
      throw new McpError({
        code: "PAPER_VALIDATION_FAILED",
        message: `${validationIssues.length} validation issue(s) found. Fix them before publishing.`,
        retryable: false,
        details: { issues: validationIssues },
      });
    }

    // If no explicit confirmation, return preflight result only
    if (!confirmPublish) {
      return {
        success: false,
        preflightPassed: true,
        testId,
        title: test.title,
        questionCount: rawQuestions.length,
        message: `Pre-flight validation passed. To publish, set confirmPublish=true. The exam has ${rawQuestions.length} questions and ${rawQuestions.reduce((s, q) => s + q.marks, 0)} total marks.`,
      };
    }

    // Publish via ProctorED API
    const published = await client.publishTest(testId);

    audit({
      requestId,
      toolName: "publish_test",
      action: "TEST_PUBLISHED",
      timestamp: new Date().toISOString(),
      testId,
      publishedBy: "mcp_service",
    });

    return {
      success: true,
      testId: published.id,
      testCode: published.testCode,
      title: published.title,
      status: published.status,
      questionCount: rawQuestions.length,
      message: [
        `✅ Published successfully!`,
        `Test: "${published.title}"`,
        `Code: ${published.testCode}`,
        `${rawQuestions.length} questions | ${rawQuestions.reduce((s, q) => s + q.marks, 0)} marks`,
        `Students can now access this exam using code: ${published.testCode}`,
      ].join("\n"),
    };
  },
};
