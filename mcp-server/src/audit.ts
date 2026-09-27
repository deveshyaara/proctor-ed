/**
 * audit.ts — Audit log for all significant MCP operations.
 *
 * Records: generation, validation, creation, publishing, failures.
 * Logs to stderr as structured JSON. Can be extended to write to DB.
 * Never logs secrets or full tokens.
 */

import { logger } from "./logger.js";

export type AuditAction =
  | "EXAM_GENERATION_STARTED"
  | "EXAM_GENERATION_COMPLETED"
  | "EXAM_GENERATION_FAILED"
  | "QUESTION_REJECTED"
  | "QUESTION_DUPLICATE_DETECTED"
  | "TEST_CREATED"
  | "QUESTIONS_INSERTED"
  | "TEST_PUBLISHED"
  | "TEST_PUBLISH_FAILED"
  | "VALIDATION_COMPLETED"
  | "AUTHORIZATION_FAILED"
  | "TOOL_CALLED"
  | "TOOL_FAILED";

export interface AuditEntry {
  requestId: string;
  teacherId?: string;
  toolName: string;
  action: AuditAction;
  timestamp: string;
  testId?: string;
  modelProvider?: string;
  modelName?: string;
  generatedQuestionCount?: number;
  rejectedQuestionCount?: number;
  publishedBy?: string;
  result?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export function audit(entry: AuditEntry): void {
  logger.info(`AUDIT:${entry.action}`, {
    ...entry,
    message: undefined, // avoid duplicate key
  } as Record<string, unknown>);
}
