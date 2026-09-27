import { z } from "zod";
import { CreateExamInputSchema, type CreateExamInput, toProctorEdQuestion, type GeneratedQuestion } from "../schemas.js";
import { ProctorEdClient, type CreateTestPayload, type CreateQuestionPayload } from "../client.js";
import { validateQuestion, validatePaper } from "../orchestrator/validateExam.js";
import { deduplicateBatch } from "../orchestrator/detectDuplicates.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";
import { getConfig } from "../config.js";

export const createExamPaperTool = {
  name: "create_exam_paper",
  description: `Create a complete exam paper and save it as a DRAFT in ProctorED.
You must provide the fully formed array of questions yourself.
The paper is NEVER published automatically. After reviewing, use publish_test to publish.

Returns: testId, testCode, title, questionCount, totalMarks, previewUrl.`,

  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Optional title for the exam" },
      subject: { type: "string", description: "Subject area (e.g. Biology, Mathematics)" },
      className: { type: "string", description: "Target class or grade (e.g. 10, XI)" },
      description: { type: "string", description: "Optional description for the exam" },
      durationMinutes: { type: "number", description: "Exam duration in minutes (5-180)" },
      questions: {
        type: "array",
        description: "The complete list of fully-formed questions.",
        items: {
          type: "object",
          description: "A question object matching the required schema. Ensure you provide type, questionText, marks, negativeMarks, difficulty, and correctAnswer / correctOptionIndex as appropriate."
        }
      }
    },
    required: ["subject", "className", "durationMinutes", "questions"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "create_exam_paper", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = CreateExamInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({
        code: "INVALID_INPUT",
        message: "Invalid input: " + parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        retryable: false,
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const input: CreateExamInput = parsed.data;
    const client = new ProctorEdClient();

    // 1. Structural Validation
    const validationIssues: Array<{ questionIndex?: number; message: string }> = [];
    const validQuestions: GeneratedQuestion[] = [];
    
    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i]!;
      const validation = validateQuestion(q, i);
      if (!validation.valid) {
        validationIssues.push(...validation.issues);
      } else {
        validQuestions.push(q);
      }
    }

    if (validationIssues.length > 0) {
       throw new McpError({
        code: "PAPER_VALIDATION_FAILED",
        message: "Generated paper failed structural validation.",
        retryable: false,
        details: { issues: validationIssues },
      });
    }

    // 2. Duplicate Detection
    const { accepted: deduped, duplicateCount } = deduplicateBatch(validQuestions, []);
    
    // 3. Paper-level Validation
    const paperResult = validatePaper(deduped, {
      questionCount: deduped.length,
      questionTypes: Array.from(new Set(deduped.map(q => q.type))),
      difficultyLevel: "mixed"
    });
    
    paperResult.duplicateCount = duplicateCount;

    if (!paperResult.valid) {
      audit({ requestId, toolName: "create_exam_paper", action: "EXAM_GENERATION_FAILED", timestamp: new Date().toISOString(), details: paperResult as unknown as Record<string, unknown> });
      throw new McpError({
        code: "PAPER_VALIDATION_FAILED",
        message: "Generated paper failed paper-level validation.",
        retryable: false,
        details: paperResult,
      });
    }

    const title = input.title || `${input.subject} Exam — Class ${input.className}`;

    // 4. Create DRAFT test
    const questionPayloads: CreateQuestionPayload[] = deduped.map(toProctorEdQuestion);

    const testPayload: CreateTestPayload = {
      title,
      subject: input.subject,
      className: input.className,
      description: input.description || "AI-generated exam — review before publishing.",
      durationSeconds: input.durationMinutes * 60,
      settings: {
        cameraRequired: true,
        fullscreenRequired: true,
        tabSwitchDetection: true,
        warningLimit: 3,
        autoSubmitOnExpiry: true,
        showResultImmediately: true,
        showCorrectAnswers: false,
        randomizeQuestions: false,
        randomizeOptions: false,
        gazeDetectionEnabled: true,
      },
    };

    const test = await client.createTest(testPayload);
    audit({ requestId, toolName: "create_exam_paper", action: "TEST_CREATED", timestamp: new Date().toISOString(), testId: test.id });

    // 5. Bulk insert
    try {
      await client.bulkCreateQuestions(test.id, questionPayloads);
    } catch (bulkErr) {
      if ((bulkErr as McpError).code === "UPSTREAM_ERROR") {
        for (const qp of questionPayloads) {
          await client.createQuestion(test.id, qp);
        }
      } else {
        try { await client.deleteTest(test.id); } catch { /* best effort */ }
        throw bulkErr;
      }
    }

    audit({
      requestId,
      toolName: "create_exam_paper",
      action: "EXAM_CREATION_COMPLETED",
      timestamp: new Date().toISOString(),
      testId: test.id,
      generatedQuestionCount: deduped.length,
    });

    const apiUrl = getConfig().api.baseUrl;
    return {
      success: true,
      testId: test.id,
      testCode: test.testCode,
      title: test.title,
      status: "DRAFT",
      questionCount: deduped.length,
      totalMarks: paperResult.totalMarks,
      duplicatesRemoved: duplicateCount,
      previewUrl: `${apiUrl}/tests/${test.id}`,
      message: [
        `✅ Created draft exam: "${test.title}"`,
        `📋 ${deduped.length} questions | ${paperResult.totalMarks} marks | Status: DRAFT`,
        `🔗 Preview: ${apiUrl}/tests/${test.id}`,
        ``,
        `⚠️  This paper has NOT been published. Review it and call publish_test to make it live.`,
      ].filter(Boolean).join("\n"),
    };
  },
};
