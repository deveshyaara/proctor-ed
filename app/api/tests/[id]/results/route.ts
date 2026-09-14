import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

// GET /api/tests/[id]/results  — summary + paginated attempts (teacher only)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = 50;

    const test = await prisma.test.findFirst({ where: { id, teacherId: session.user.id } });
    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });

    const attempts = await prisma.attempt.findMany({
      where: { testId: id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        studentName: true,
        rollNumber: true,
        status: true,
        score: true,
        maxScore: true,
        riskScore: true,
        warningCount: true,
        startedAt: true,
        submittedAt: true,
        _count: { select: { proctoringEvents: true } },
      },
    });

    const hasMore = attempts.length > limit;
    const items = hasMore ? attempts.slice(0, limit) : attempts;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Summary stats — calculated from ALL attempts, not just current page
    const allAttempts = await prisma.attempt.findMany({
      where: { testId: id },
      select: { id: true, score: true, status: true },
    });
    const submitted = allAttempts.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED");
    const scores = submitted.map((a) => a.score ?? 0);
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    const highest = scores.length ? Math.max(...scores) : null;
    const lowest = scores.length ? Math.min(...scores) : null;

    return NextResponse.json({
      test: { id: test.id, title: test.title, subject: test.subject, className: test.className, durationSeconds: test.durationSeconds },
      summary: { totalAttempts: allAttempts.length, avg, highest, lowest },
      attempts: items,
      nextCursor,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
