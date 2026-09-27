/**
 * providers/openai.ts — OpenAI LLM provider abstraction.
 *
 * All OpenAI API calls are isolated here. The orchestrator depends on the
 * provider's interface, not OpenAI SDK internals, making it easy to swap
 * providers (Anthropic, local models) without rewriting orchestrator logic.
 *
 * Uses Structured Outputs (json_schema response_format) for deterministic
 * JSON parsing — no fragile regex or `JSON.parse(content)` guesswork.
 */

import OpenAI from "openai";
import { z } from "zod";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { McpError } from "../errors.js";
import type { GeneratedQuestion, Difficulty, QuestionType, VerificationResult } from "../schemas.js";

// ── LLM JSON shapes (what we ask OpenAI to return) ───────────────────────────

// Single batch response
interface LlmQuestionBatch {
  questions: LlmQuestion[];
}

type LlmQuestion =
  | { type: "MCQ"; questionText: string; options: string[]; correctOptionIndex: number; marks: number; negativeMarks: number; explanation?: string; difficulty: Difficulty }
  | { type: "TRUE_FALSE"; questionText: string; correctAnswer: boolean; marks: number; negativeMarks: number; explanation?: string; difficulty: Difficulty }
  | { type: "NUMERICAL"; questionText: string; correctAnswer: number; tolerance?: number; unit?: string; marks: number; negativeMarks: number; explanation?: string; difficulty: Difficulty }
  | { type: "SHORT_ANSWER"; questionText: string; expectedAnswer: string; acceptableAnswers?: string[]; marks: number; negativeMarks: number; explanation?: string; difficulty: Difficulty };

interface LlmVerifyResponse {
  valid: boolean;
  confidence: number;
  issue?: string;
}

// ── JSON Schema for structured output ────────────────────────────────────────

const QUESTION_BATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, enum: ["MCQ", "TRUE_FALSE", "NUMERICAL", "SHORT_ANSWER"] },
          questionText: { type: "string" as const },
          options: { type: "array" as const, items: { type: "string" as const } },
          correctOptionIndex: { type: "integer" as const },
          correctAnswer: {},
          tolerance: { type: "number" as const },
          unit: { type: "string" as const },
          expectedAnswer: { type: "string" as const },
          acceptableAnswers: { type: "array" as const, items: { type: "string" as const } },
          marks: { type: "number" as const },
          negativeMarks: { type: "number" as const },
          explanation: { type: "string" as const },
          difficulty: { type: "string" as const, enum: ["easy", "medium", "hard"] },
        },
        required: ["type", "questionText", "marks", "negativeMarks", "difficulty"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions" as const],
  additionalProperties: false,
};

const VERIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    valid: { type: "boolean" as const },
    confidence: { type: "number" as const },
    issue: { type: "string" as const },
  },
  required: ["valid", "confidence"] as const,
  additionalProperties: false,
};

// ── Provider interface ────────────────────────────────────────────────────────

export interface IQuestionProvider {
  generateBatch(params: GenerateBatchParams): Promise<GeneratedQuestion[]>;
  verifyQuestion(question: GeneratedQuestion, context: VerifyContext): Promise<VerificationResult>;
}

export interface GenerateBatchParams {
  subject: string;
  topic: string;
  className: string;
  board?: string;
  curriculum?: string;
  academicYear?: string;
  chapter?: string;
  learningObjectives?: string[];
  questionType: QuestionType;
  difficulty: Difficulty | "mixed";
  count: number;
  marksPerQuestion: number;
  negativeMarks: number;
  language?: string;
  requestId?: string;
}

export interface VerifyContext {
  subject: string;
  topic: string;
  requestId?: string;
}

// ── OpenAI implementation ─────────────────────────────────────────────────────

export class OpenAIProvider implements IQuestionProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly verifierModel: string;

  constructor() {
    const cfg = getConfig();
    this.client = new OpenAI({ apiKey: cfg.openai.apiKey });
    this.model = cfg.openai.model;
    this.verifierModel = cfg.openai.verifierModel;
  }

  async generateBatch(params: GenerateBatchParams): Promise<GeneratedQuestion[]> {
    const systemPrompt = buildSystemPrompt(params);
    const userPrompt = buildUserPrompt(params);

    logger.debug("OpenAI generate batch", { requestId: params.requestId, model: this.model, count: params.count, type: params.questionType });

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "question_batch",
            strict: true,
            schema: QUESTION_BATCH_SCHEMA,
          },
        },
        temperature: 0.7,
      });
    } catch (err) {
      throw new McpError({ code: "GENERATION_FAILED", message: `OpenAI API error: ${String(err)}`, retryable: true });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new McpError({ code: "GENERATION_FAILED", message: "OpenAI returned empty content", retryable: true });
    }

    let batch: LlmQuestionBatch;
    try {
      batch = JSON.parse(content) as LlmQuestionBatch;
    } catch {
      throw new McpError({ code: "GENERATION_FAILED", message: "OpenAI returned invalid JSON", retryable: true });
    }

    return batch.questions as GeneratedQuestion[];
  }

  async verifyQuestion(question: GeneratedQuestion, ctx: VerifyContext): Promise<VerificationResult> {
    const prompt = buildVerifyPrompt(question, ctx);

    logger.debug("OpenAI verify question", { requestId: ctx.requestId, model: this.verifierModel });

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create({
        model: this.verifierModel,
        messages: [
          {
            role: "system",
            content: "You are an exam quality checker. Verify that the question is correct, unambiguous, and has an unequivocal answer. Respond only with the JSON schema provided.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "verify_result",
            strict: true,
            schema: VERIFY_SCHEMA,
          },
        },
        temperature: 0.1,
      });
    } catch (err) {
      throw new McpError({ code: "ANSWER_VERIFICATION_FAILED", message: `Verifier API error: ${String(err)}`, retryable: true });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) return { valid: false, confidence: 0, issue: "Verifier returned empty response" };

    try {
      return JSON.parse(content) as VerificationResult;
    } catch {
      return { valid: false, confidence: 0, issue: "Verifier returned invalid JSON" };
    }
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildSystemPrompt(p: GenerateBatchParams): string {
  return `You are an expert exam question writer.

STRICT RULES:
- Generate ONLY questions strictly within the provided subject, topic, and curriculum context.
- Do NOT invent syllabus requirements or go outside the topic.
- Ensure every MCQ has exactly ONE correct answer. All options must be unique.
- Avoid ambiguous questions. Every question must have one clear, unequivocal answer.
- Do NOT embed the answer in the question text.
- Do NOT repeat the same question with minor wording changes.
- Return ONLY valid JSON. No explanation or preamble outside the JSON.

Difficulty rubric:
- easy: direct recall or single-step application
- medium: multi-step application  
- hard: multi-step reasoning or synthesis`.trim();
}

function buildUserPrompt(p: GenerateBatchParams): string {
  const curriculum = [
    p.board && `Board: ${p.board}`,
    p.curriculum && `Curriculum: ${p.curriculum}`,
    p.academicYear && `Academic Year: ${p.academicYear}`,
    p.chapter && `Chapter: ${p.chapter}`,
    p.learningObjectives?.length && `Learning Objectives: ${p.learningObjectives.join("; ")}`,
  ].filter(Boolean).join("\n");

  return `Generate ${p.count} ${p.questionType} questions.

Subject: ${p.subject}
Topic: ${p.topic}
Class: ${p.className}
${curriculum ? curriculum + "\n" : ""}Difficulty: ${p.difficulty}
Marks per question: ${p.marksPerQuestion}
Negative marks per question: ${p.negativeMarks}
${p.language ? `Language: ${p.language}` : ""}

Return a JSON object with key "questions" containing an array of exactly ${p.count} questions.`.trim();
}

function buildVerifyPrompt(q: GeneratedQuestion, ctx: VerifyContext): string {
  return `Verify this ${q.type} exam question for subject "${ctx.subject}", topic "${ctx.topic}".

Question: ${JSON.stringify(q, null, 2)}

Check:
1. Is the question clear and unambiguous?
2. Is the stated correct answer actually correct?
3. For MCQ: is there EXACTLY one correct option?
4. Is the question on-topic for "${ctx.topic}"?

Return: { "valid": boolean, "confidence": 0.0-1.0, "issue": "..." (only if invalid) }`;
}
