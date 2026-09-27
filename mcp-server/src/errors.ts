/**
 * errors.ts — Typed error hierarchy for the MCP server.
 *
 * All errors produce structured JSON the AI client can parse and explain.
 * Error codes are stable strings, never numeric.
 */

export type McpErrorCode =
  | "AUTHENTICATION_FAILED"
  | "FORBIDDEN"
  | "TEST_NOT_FOUND"
  | "TEST_NOT_EDITABLE"
  | "QUESTION_VALIDATION_FAILED"
  | "DUPLICATE_QUESTION"
  | "PAPER_VALIDATION_FAILED"
  | "ANSWER_VERIFICATION_FAILED"
  | "GENERATION_FAILED"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_INPUT"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export interface McpErrorDetail {
  code: McpErrorCode;
  message: string;
  retryable: boolean;
  field?: string;
  questionIndex?: number;
  details?: unknown;
}

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly retryable: boolean;
  readonly field?: string;
  readonly questionIndex?: number;
  readonly details?: unknown;

  constructor(detail: McpErrorDetail) {
    super(detail.message);
    this.name = "McpError";
    this.code = detail.code;
    this.retryable = detail.retryable;
    this.field = detail.field;
    this.questionIndex = detail.questionIndex;
    this.details = detail.details;
  }

  toJSON(): McpErrorDetail {
    const res: McpErrorDetail = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
    if (this.field !== undefined) res.field = this.field;
    if (this.questionIndex !== undefined) res.questionIndex = this.questionIndex;
    if (this.details !== undefined) res.details = this.details;
    return res;
  }
}

export function isRetryable(code: McpErrorCode): boolean {
  return ["RATE_LIMITED", "UPSTREAM_TIMEOUT", "UPSTREAM_ERROR"].includes(code);
}

/** Format a caught unknown value as a string for logging */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
