import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";
import { validateQuestion } from "../orchestrator/validateExam.js";
import { deduplicateBatch } from "../orchestrator/detectDuplicates.js";
import { toProctorEdQuestion, GeneratedQuestionSchema, type GeneratedQuestion } from "../schemas.js";

const InputSchema = z.object({
  testId: z.string().min(1),
  questions: z.array(GeneratedQuestionSchema).min(1).max(50),
});

export const addQuestionsToTestTool = {
  name: "add_questions_to_test",
  description: "Add a complete list of fully-formed questions to an existing DRAFT test. Cannot modify published or closed tests. You must provide the questions array.",

  inputSchema: {
    type: "object" as const,
    properties: {
      testId: { type: "string", description: "ID of the draft test to add questions to" },
      questions: {
        type: "array",
        description: "The complete list of fully-formed questions.",
        items: {
          type: "object",
          description: "A question object matching the required schema. Ensure you provide type, questionText, marks, negativeMarks, difficulty, and correctAnswer / correctOptionIndex as appropriate."
        }
      }
    },
    required: ["testId", "questions"],
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "add_questions_to_test", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: parsed.error.errors.map((e) => e.message).join("; "), retryable: false });
    }

    const { testId, questions } = parsed.data;
    const client = new ProctorEdClient();

    // Verify test is editable
    const test = await client.getTest(testId);
    if (test.status === "PUBLISHED" || test.status === "CLOSED" || test.status === "ARCHIVED") {
      throw new McpError({
        code: "TEST_NOT_EDITABLE",
        message: `Cannot add questions to a ${test.status} test. Only DRAFT tests are editable.`,
        retryable: false,
      });
    }

    // Structural Validation
    const validationIssues: Array<{ questionIndex?: number; message: string }> = [];
    const validQuestions: GeneratedQuestion[] = [];
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
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
        message: "Questions failed structural validation.",
        retryable: false,
        details: { issues: validationIssues },
      });
    }

    // Duplicate detection against existing questions
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

    const { accepted: deduped, duplicateCount } = deduplicateBatch(validQuestions, existingQuestions);

    if (deduped.length === 0) {
      throw new McpError({
        code: "PAPER_VALIDATION_FAILED",
        message: "All provided questions were detected as duplicates.",
        retryable: false,
      });
    }

    const payloads = deduped.map(toProctorEdQuestion);
    try {
      await client.bulkCreateQuestions(testId, payloads);
    } catch (bulkErr) {
      if ((bulkErr as McpError).code === "UPSTREAM_ERROR") {
        for (const payload of payloads) {
          await client.createQuestion(testId, payload);
        }
      } else {
        throw bulkErr;
      }
    }

    audit({ requestId, toolName: "add_questions_to_test", action: "QUESTIONS_INSERTED", timestamp: new Date().toISOString(), testId, generatedQuestionCount: deduped.length });

    return {
      success: true,
      testId,
      addedCount: deduped.length,
      duplicatesRemoved: duplicateCount,
      message: `Added ${deduped.length} questions to "${test.title}".`,
    };
  },
};
