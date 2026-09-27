/**
 * logger.ts — Structured JSON logger with requestId correlation.
 *
 * Outputs newline-delimited JSON for easy parsing by log aggregators.
 * Never logs secrets or full tokens.
 */

import { getConfig } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogContext {
  requestId?: string;
  teacherId?: string;
  toolName?: string;
  testId?: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  try {
    const config = getConfig();
    return LEVELS[level] >= LEVELS[config.log.level];
  } catch {
    return true; // fallback before config is loaded
  }
}

function write(level: LogLevel, message: string, ctx?: LogContext): void {
  if (!shouldLog(level)) return;
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  };
  // Use stderr for MCP stdio transport so it doesn't interfere with the protocol
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
};
