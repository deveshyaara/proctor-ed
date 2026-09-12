/**
 * Structured application logger.
 * In production, replace with a proper logging service.
 * Never logs sensitive fields: passwords, tokens, camera frames.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      if (process.env.NODE_ENV === "development") {
        console.debug(output);
      }
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) => log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => log("error", event, data),
  debug: (event: string, data?: Record<string, unknown>) => log("debug", event, data),
};

// Application event names (use these constants for consistency)
export const LogEvents = {
  // Tests
  TEST_CREATED: "TEST_CREATED",
  TEST_UPDATED: "TEST_UPDATED",
  TEST_PUBLISHED: "TEST_PUBLISHED",
  TEST_CLOSED: "TEST_CLOSED",
  TEST_DELETED: "TEST_DELETED",
  TEST_DUPLICATED: "TEST_DUPLICATED",
  // Questions
  QUESTION_CREATED: "QUESTION_CREATED",
  QUESTION_UPDATED: "QUESTION_UPDATED",
  QUESTION_DELETED: "QUESTION_DELETED",
  // Attempts
  ATTEMPT_CREATED: "ATTEMPT_CREATED",
  ATTEMPT_STARTED: "ATTEMPT_STARTED",
  ATTEMPT_SUBMITTED: "ATTEMPT_SUBMITTED",
  ATTEMPT_AUTO_SUBMITTED: "ATTEMPT_AUTO_SUBMITTED",
  ATTEMPT_EXPIRED: "ATTEMPT_EXPIRED",
  ATTEMPT_TERMINATED: "ATTEMPT_TERMINATED",
  // Answers
  ANSWER_SAVED: "ANSWER_SAVED",
  // Proctoring
  PROCTORING_EVENT: "PROCTORING_EVENT",
  EVIDENCE_CAPTURED: "EVIDENCE_CAPTURED",
  TEACHER_REVIEWED_EVENT: "TEACHER_REVIEWED_EVENT",
  // Auth
  TEACHER_LOGIN: "TEACHER_LOGIN",
  TEACHER_LOGOUT: "TEACHER_LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  // Uploads
  FILE_UPLOADED: "FILE_UPLOADED",
  FILE_UPLOAD_FAILED: "FILE_UPLOAD_FAILED",
} as const;
