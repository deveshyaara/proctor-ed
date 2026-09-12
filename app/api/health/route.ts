/**
 * GET /api/health
 *
 * Operational health check for ProctorED.
 *
 * Architecture note:
 * This endpoint checks only the database because ProctorED intentionally
 * uses a single-instance deployment with PostgreSQL as its only external
 * dependency. Redis is not checked because it is not used at this scale.
 * See SCALING_ROADMAP.md.
 *
 * Response:
 *   200 { status: "healthy", checks: { db: "ok" } }
 *   200 { status: "degraded", checks: { db: "error: ..." } }
 *
 * Does NOT expose: database URLs, connection strings, secrets, stack traces.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";
// No caching — health check must always be fresh
export const revalidate = 0;

export async function GET() {
  const checks: Record<string, string> = {};
  let overallStatus: "healthy" | "degraded" = "healthy";

  // ── Database check ─────────────────────────────────────────────────────────
  try {
    // Raw SQL ping — minimal overhead, verifies connection pool is alive
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    // Log server-side with details, expose only a safe summary to callers
    console.error("[health] database check failed:", message);
    checks.db = "error: connection failed";
    overallStatus = "degraded";
  }

  const httpStatus = overallStatus === "healthy" ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus }
  );
}
