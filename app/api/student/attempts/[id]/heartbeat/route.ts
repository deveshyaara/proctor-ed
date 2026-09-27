import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const attempt = await requireAttemptOwnership(id, rawToken);

    // Allow heartbeat even if expired (client needs to know)
    const now = new Date();
    const expired = attempt.expiresAt ? now > attempt.expiresAt : false;

    if (attempt.status === "IN_PROGRESS") {
      if (expired) {
        const test = await prisma.test.findUnique({ where: { id: attempt.testId }, select: { settings: true } });
        const autoSubmit = (test?.settings as any)?.autoSubmitOnExpiry ?? true;
        
        // Dynamic import to avoid circular dependency issues if any
        const { executeAttemptSubmission } = await import("@/lib/exam/submission");
        const result = await executeAttemptSubmission(id, autoSubmit ? "AUTO_SUBMITTED" : "EXPIRED");
        
        return NextResponse.json({
          expired,
          expiresAt: attempt.expiresAt?.toISOString() ?? null,
          serverTime: now.toISOString(),
          status: result.status,
        });
      } else {
        await prisma.attempt.update({ where: { id }, data: { lastHeartbeatAt: now } });
        try {
          const body = await req.json();
          if (body?.metrics) {
            const { logger, LogEvents } = await import("@/lib/utils/logger");
            logger.info("PROCTORING_METRICS", { attemptId: id, metrics: body.metrics });
          }
        } catch {
          // Body parsing fail - ignore
        }
      }
    }

    return NextResponse.json({
      expired,
      expiresAt: attempt.expiresAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      status: attempt.status,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
