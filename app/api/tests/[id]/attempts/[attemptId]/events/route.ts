import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string; attemptId: string }> };

// GET /api/tests/[id]/attempts/[attemptId]/events — on-demand proctoring events query (teacher only)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id, attemptId } = await params;

    // Verify teacher owns the test
    const test = await prisma.test.findFirst({
      where: { id, teacherId: session.user.id },
      select: { id: true },
    });
    if (!test) {
      return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    }

    // Verify attempt belongs to this test
    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, testId: id },
      select: {
        id: true,
        studentName: true,
        rollNumber: true,
        status: true,
        score: true,
        maxScore: true,
        warningCount: true,
        riskScore: true,
      },
    });
    if (!attempt) {
      return NextResponse.json(errorResponse("ATTEMPT_NOT_FOUND", "Attempt not found for this test."), { status: 404 });
    }

    // Fetch proctoring events for this specific attempt on-demand
    const events = await prisma.proctoringEvent.findMany({
      where: { attemptId },
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        eventType: true,
        severity: true,
        description: true,
        confidence: true,
        timestamp: true,
      },
    });

    return NextResponse.json({
      attempt,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        description: e.description,
        confidence: e.confidence,
        timestamp: e.timestamp.toISOString(),
      })),
      eventCount: events.length,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
