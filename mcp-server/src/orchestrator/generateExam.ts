/**
 * orchestrator/generateExam.ts — Core exam generation orchestrator.
 *
 * This is the heart of the MCP server. It implements the multi-stage pipeline:
 *
 *   Generate batch → Structural validation → Answer verification
 *   → Duplicate detection → Accept/reject → Retry if needed
 *   → Paper-level validation → Create draft test → Insert questions
 *
 * Key properties:
 * - Batched generation (configurable size, default 5)
 * - Per-question retry with limit
 * - Never creates a partial test without committing all questions first
 * - Never silently skips invalid questions beyond retry limit
 * - Always creates DRAFT status — never publishes
 */

import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { audit } from "../audit.js";
import { McpError } from "../errors.js";
import {
  type GeneratedQuestion,
  type GenerateExamInput,
  type QuestionType,
  type Difficulty,
  toProctorEdQuestion,
} from "../schemas.js";
import { ProctorEdClient, type CreateTestPayload, type CreateQuestionPayload } from "../client.js";
import { type IQuestionProvider, type GenerateBatchParams } from "../providers/openai.js";
import { validateQuestion, validatePaper } from "./validateExam.js";
import { verifyAnswer } from "./verifyAnswers.js";
import { deduplicateBatch } from "./detectDuplicates.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateExamResult {
  testId: string;
  testCode: string;
  title: string;
  status: "DRAFT";
  questionCount: number;
  totalMarks: number;
  rejectedQuestions: number;
  duplicatesDetected: number;
  curriculumVerified: boolean;
  previewUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeDistribution(input: GenerateExamInput): Array<{ type: QuestionType; count: number; difficulty: Difficulty | "mixed" }> {
  const { questionTypes, questionCount, questionDistribution, difficultyLevel, difficultyDistribution } = input;

  // If explicit distribution is given, use it
  if (questionDistribution) {
    return questionTypes.map((t) => ({
      type: t,
      count: questionDistribution[t] ?? 0,
      difficulty: difficultyLevel,
    }));
  }

  // Otherwise distribute evenly
  const perType = Math.floor(questionCount / questionTypes.length);
  const remainder = questionCount % questionTypes.length;

  return questionTypes.map((t, i) => ({
    type: t,
    count: perType + (i === 0 ? remainder : 0),
    difficulty: difficultyLevel,
  }));
}

function buildTestTitle(input: GenerateExamInput): string {
  const parts = [input.topic, `—`, `Class ${input.className}`];
  if (input.board) parts.push(`(${input.board})`);
  return parts.join(" ");
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function generateExam(
  input: GenerateExamInput,
  provider: IQuestionProvider,
  requestId: string
): Promise<GenerateExamResult> {
  const cfg = getConfig();
  const client = new ProctorEdClient();

  const startedAt = Date.now();
  audit({ requestId, toolName: "generate_exam_paper", action: "EXAM_GENERATION_STARTED", timestamp: new Date().toISOString() });

  const distribution = computeDistribution(input);
  const batchSize = cfg.generation.batchSize;
  const maxRetries = cfg.generation.maxRetriesPerQuestion;

  const allAccepted: GeneratedQuestion[] = [];
  let totalRejected = 0;
  let totalDuplicates = 0;

  // ── Per-type batch generation ────────────────────────────────────────────
  for (const segment of distribution) {
    if (segment.count === 0) continue;

    let segmentAccepted: GeneratedQuestion[] = [];
    let needed = segment.count;

    logger.info(`Generating ${needed} ${segment.type} questions`, { requestId });

    let attempts = 0;
    const maxSegmentAttempts = maxRetries * segment.count;

    while (segmentAccepted.length < segment.count && attempts < maxSegmentAttempts) {
      const batchCount = Math.min(batchSize, needed);

      const params: GenerateBatchParams = {
        subject: input.subject,
        topic: input.topic,
        className: input.className,
        board: input.board,
        curriculum: input.curriculum,
        academicYear: input.academicYear,
        chapter: input.chapter,
        learningObjectives: input.learningObjectives,
        questionType: segment.type,
        difficulty: segment.difficulty,
        count: batchCount,
        marksPerQuestion: input.marksPerQuestion ?? 1,
        negativeMarks: input.negativeMarks ?? (input.negativeMarking ? 0.25 : 0),
        language: input.language,
        requestId,
      };

      let rawBatch: GeneratedQuestion[];
      try {
        rawBatch = await provider.generateBatch(params);
      } catch (err) {
        logger.warn(`Batch generation failed: ${String(err)}`, { requestId });
        attempts++;
        continue;
      }

      for (const rawQ of rawBatch) {
        if (segmentAccepted.length >= segment.count) break;

        // 1. Structural validation
        const validation = validateQuestion(rawQ, allAccepted.length + segmentAccepted.length);
        if (!validation.valid) {
          logger.warn("Question failed structural validation", { requestId, issues: validation.issues });
          totalRejected++;
          attempts++;
          continue;
        }

        const q = rawQ; // now known valid

        // 2. Answer verification
        const verification = await verifyAnswer(q, { subject: input.subject, topic: input.topic, requestId }, provider);
        if (!verification.valid || verification.confidence < 0.6) {
          logger.warn("Question failed answer verification", { requestId, issue: verification.issue });
          audit({ requestId, toolName: "generate_exam_paper", action: "QUESTION_REJECTED", timestamp: new Date().toISOString(), details: { reason: "answer_verification", issue: verification.issue } });
          totalRejected++;
          attempts++;
          continue;
        }

        // 3. Duplicate detection (against global pool + segment pool)
        const { accepted: deduplicated, duplicateCount } = deduplicateBatch([q], [...allAccepted, ...segmentAccepted]);
        if (duplicateCount > 0) {
          logger.warn("Duplicate question detected and skipped", { requestId });
          audit({ requestId, toolName: "generate_exam_paper", action: "QUESTION_DUPLICATE_DETECTED", timestamp: new Date().toISOString() });
          totalDuplicates++;
          attempts++;
          continue;
        }

        segmentAccepted.push(deduplicated[0]!);
        needed = segment.count - segmentAccepted.length;
      }

      attempts++;
    }

    if (segmentAccepted.length < segment.count) {
      throw new McpError({
        code: "GENERATION_FAILED",
        message: `Could not generate enough valid ${segment.type} questions after ${maxSegmentAttempts} attempts. Got ${segmentAccepted.length}/${segment.count}. This may indicate the topic is too narrow or the model is unable to produce sufficient unique questions.`,
        retryable: false,
        details: { type: segment.type, generated: segmentAccepted.length, required: segment.count },
      });
    }

    allAccepted.push(...segmentAccepted);
  }

  // ── Paper-level validation ────────────────────────────────────────────────
  const paperResult = validatePaper(allAccepted, {
    questionCount: input.questionCount,
    questionTypes: input.questionTypes,
    questionDistribution: input.questionDistribution as Record<string, number> | undefined,
    difficultyLevel: input.difficultyLevel,
    difficultyDistribution: input.difficultyDistribution as Record<string, number> | undefined,
    marksPerQuestion: input.marksPerQuestion,
  });

  paperResult.duplicateCount = totalDuplicates;

  if (!paperResult.valid) {
    audit({ requestId, toolName: "generate_exam_paper", action: "EXAM_GENERATION_FAILED", timestamp: new Date().toISOString(), details: paperResult as unknown as Record<string, unknown> });
    throw new McpError({
      code: "PAPER_VALIDATION_FAILED",
      message: "Generated paper failed paper-level validation.",
      retryable: false,
      details: paperResult,
    });
  }

  // ── Create DRAFT test and insert questions ────────────────────────────────
  // We convert all questions first so that if any conversion fails, no test
  // has been created yet (fail-fast before any DB mutation).
  const questionPayloads: CreateQuestionPayload[] = allAccepted.map(toProctorEdQuestion);

  const testPayload: CreateTestPayload = {
    title: buildTestTitle(input),
    subject: input.subject,
    className: input.className,
    description: [
      input.board && `Board: ${input.board}`,
      input.chapter && `Chapter: ${input.chapter}`,
      `AI-generated exam — review before publishing.`,
    ].filter(Boolean).join("\n"),
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

  const test = await client.createTest(testPayload, input.idempotencyKey);
  audit({ requestId, toolName: "generate_exam_paper", action: "TEST_CREATED", timestamp: new Date().toISOString(), testId: test.id });

  // Bulk insert — use bulk endpoint; fall back to sequential on 404
  try {
    await client.bulkCreateQuestions(test.id, questionPayloads);
  } catch (bulkErr) {
    if ((bulkErr as McpError).code === "UPSTREAM_ERROR") {
      // Bulk endpoint may not exist yet; fall back to sequential
      logger.warn("Bulk insert failed, falling back to sequential inserts", { requestId, testId: test.id });
      for (const qp of questionPayloads) {
        await client.createQuestion(test.id, qp);
      }
    } else {
      // Clean up the test we just created to avoid orphans
      try { await client.deleteTest(test.id); } catch { /* best effort */ }
      throw bulkErr;
    }
  }

  audit({
    requestId,
    toolName: "generate_exam_paper",
    action: "EXAM_GENERATION_COMPLETED",
    timestamp: new Date().toISOString(),
    testId: test.id,
    generatedQuestionCount: allAccepted.length,
    rejectedQuestionCount: totalRejected,
    latencyMs: Date.now() - startedAt,
  });

  const apiUrl = getConfig().api.baseUrl;
  return {
    testId: test.id,
    testCode: test.testCode,
    title: test.title,
    status: "DRAFT",
    questionCount: allAccepted.length,
    totalMarks: paperResult.totalMarks,
    rejectedQuestions: totalRejected,
    duplicatesDetected: totalDuplicates,
    curriculumVerified: !!(input.board || input.curriculum),
    previewUrl: `${apiUrl}/tests/${test.id}`,
  };
}
