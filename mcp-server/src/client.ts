/**
 * client.ts — Typed ProctorED REST API client.
 *
 * Single-responsibility: all HTTP communication with ProctorED goes here.
 * Handles: auth headers, retries, timeouts, idempotency, typed responses,
 * and mapping HTTP errors → McpError.
 *
 * Never spreads raw fetch() calls across tool files.
 */

import { getConfig } from "./config.js";
import { McpError, type McpErrorCode } from "./errors.js";
import { logger } from "./logger.js";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  requestId?: string;
}

interface ApiResponse<T> {
  data: T;
  status: number;
}

// Upstream error shape from ProctorED
interface UpstreamError {
  error?: { code?: string; message?: string };
}

/** Map ProctorED error codes to MCP error codes */
function mapUpstreamCode(code: string | undefined): McpErrorCode {
  const map: Record<string, McpErrorCode> = {
    UNAUTHORIZED: "AUTHENTICATION_FAILED",
    FORBIDDEN: "FORBIDDEN",
    TEST_NOT_FOUND: "TEST_NOT_FOUND",
    EXAM_IMMUTABLE: "TEST_NOT_EDITABLE",
    NO_QUESTIONS: "PAPER_VALIDATION_FAILED",
    INVALID_TRANSITION: "TEST_NOT_EDITABLE",
    RATE_LIMITED: "RATE_LIMITED",
  };
  return map[code ?? ""] ?? "UPSTREAM_ERROR";
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, requestId?: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof McpError && !err.retryable) throw err;
      if (attempt < maxAttempts) {
        const delay = 300 * Math.pow(2, attempt - 1);
        logger.warn(`API request failed, retrying (${attempt}/${maxAttempts})`, { requestId });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export class ProctorEdClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor() {
    const cfg = getConfig();
    this.baseUrl = cfg.api.baseUrl;
    this.token = cfg.api.serviceToken;
    this.timeoutMs = cfg.api.timeoutMs;
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = "GET", body, idempotencyKey, requestId } = opts;
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      "X-Request-ID": requestId ?? crypto.randomUUID(),
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new McpError({ code: "UPSTREAM_ERROR", message: `Non-JSON response from ${method} ${path}`, retryable: false });
      }

      if (!res.ok) {
        const err = json as UpstreamError;
        const code = mapUpstreamCode(err.error?.code);
        const message = err.error?.message ?? `API error ${res.status} on ${method} ${path}`;
        throw new McpError({ code, message, retryable: isRetryableStatus(res.status) });
      }

      return { data: json as T, status: res.status };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof McpError) throw err;
      if ((err as { name?: string }).name === "AbortError") {
        throw new McpError({ code: "UPSTREAM_TIMEOUT", message: `Request timed out: ${method} ${path}`, retryable: true });
      }
      throw new McpError({ code: "UPSTREAM_ERROR", message: String(err), retryable: true });
    }
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  async listTests(status?: string, cursor?: string, limit = 20): Promise<{ tests: ProctorTest[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    params.set("limit", String(limit));
    const res = await withRetry(() => this.request<{ tests: ProctorTest[]; nextCursor: string | null }>(`/api/tests?${params.toString()}`));
    return res.data;
  }

  async getTest(testId: string): Promise<ProctorTest> {
    const res = await withRetry(() => this.request<{ test: ProctorTest }>(`/api/tests/${testId}`));
    return res.data.test;
  }

  async createTest(payload: CreateTestPayload, idempotencyKey?: string): Promise<ProctorTest> {
    const res = await withRetry(() =>
      this.request<{ test: ProctorTest }>("/api/tests", {
        method: "POST",
        body: payload,
        idempotencyKey,
      })
    );
    return res.data.test;
  }

  async getQuestions(testId: string): Promise<ProctorQuestion[]> {
    const res = await withRetry(() => this.request<{ questions: ProctorQuestion[] }>(`/api/tests/${testId}/questions`));
    return res.data.questions;
  }

  async createQuestion(testId: string, payload: CreateQuestionPayload): Promise<ProctorQuestion> {
    const res = await withRetry(() =>
      this.request<{ question: ProctorQuestion }>(`/api/tests/${testId}/questions`, {
        method: "POST",
        body: payload,
      })
    );
    return res.data.question;
  }

  async bulkCreateQuestions(testId: string, questions: CreateQuestionPayload[]): Promise<{ created: number }> {
    const res = await withRetry(() =>
      this.request<{ created: number }>(`/api/tests/${testId}/questions/bulk`, {
        method: "POST",
        body: { questions },
      })
    );
    return res.data;
  }

  async publishTest(testId: string): Promise<ProctorTest> {
    const res = await withRetry(() =>
      this.request<{ test: ProctorTest }>(`/api/tests/${testId}/publish`, { method: "POST" })
    );
    return res.data.test;
  }

  async deleteTest(testId: string): Promise<void> {
    await withRetry(() => this.request(`/api/tests/${testId}`, { method: "DELETE" }));
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

// ── Domain types mirroring Prisma output ────────────────────────────────────

export interface ProctorTest {
  id: string;
  title: string;
  subject: string;
  className: string;
  description?: string | null;
  testCode: string;
  durationSeconds: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  maxAttempts: number;
  startAt?: string | null;
  endAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { questions: number; attempts: number };
}

export interface ProctorQuestion {
  id: string;
  testId: string;
  type: string;
  questionText: string;
  options?: unknown;
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
  explanation?: string | null;
  order: number;
}

export interface CreateTestPayload {
  title: string;
  subject: string;
  className: string;
  description?: string;
  durationSeconds: number;
  maxAttempts?: number;
  settings: {
    cameraRequired: boolean;
    fullscreenRequired: boolean;
    tabSwitchDetection: boolean;
    warningLimit: number;
    autoSubmitOnExpiry: boolean;
    showResultImmediately: boolean;
    showCorrectAnswers: boolean;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    gazeDetectionEnabled: boolean;
  };
}

export interface CreateQuestionPayload {
  type: string;
  questionText: string;
  options?: string[];
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
  explanation?: string;
}
