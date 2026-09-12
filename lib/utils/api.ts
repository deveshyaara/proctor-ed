import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PermissionError } from "@/lib/auth/permissions";

/**
 * Creates a standardized JSON success response.
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Creates a standardized JSON error response.
 */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Centralized API error handler.
 * Converts known error types to appropriate HTTP responses.
 * Never exposes raw stack traces or database errors to clients.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const message = error.issues.map((e: { message: string }) => e.message).join(", ");
    return apiError(message, 422);
  }

  if (error instanceof PermissionError) {
    return apiError(error.message, 403);
  }

  if (error instanceof Error) {
    // Log the full error server-side but return a generic message
    console.error("[API Error]", error.message, error.stack);
    return apiError("An unexpected error occurred. Please try again.", 500);
  }

  return apiError("An unexpected error occurred.", 500);
}

  /**
   * Generate or extract request ID for correlation logging.
   * @param req Optional Next.js request object to check for existing ID
   * @returns Unique request identifier
   */
  export function getOrCreateRequestId(req?: unknown): string {
    // Check if request already has x-request-id header
    if (typeof req === "object" && req !== null && "headers" in req) {
      const headers = (req as { headers?: { get?: (name: string) => string | null } }).headers;
      if (typeof headers?.get === "function") {
        const existing = headers.get("x-request-id");
        if (existing) return existing;
      }
    }
    // Generate new UUID-like ID for this request
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log structured error with correlation ID for production tracing.
   * @param requestId Correlation ID for request tracing
   * @param message Error message
   * @param error Error object
   */
  export function logError(requestId: string, message: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(
      JSON.stringify({
        level: "ERROR",
        timestamp: new Date().toISOString(),
        requestId,
        message,
        error: errorMessage,
        stack: errorStack,
      })
    );
  }
