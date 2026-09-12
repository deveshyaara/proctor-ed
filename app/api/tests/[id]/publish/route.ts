import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

// ── POST /api/tests/[id]/publish ──────────────────────────────────────────────
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;

    const test = await prisma.test.findFirst({
      where: { id, teacherId: session.user.id },
      include: { _count: { select: { questions: true } } },
    });

    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    if (test.status !== "DRAFT") {
      return NextResponse.json(errorResponse("INVALID_TRANSITION", "Only DRAFT tests can be published."), { status: 409 });
    }
    if (!test.title || !test.subject || !test.className) {
      return NextResponse.json(errorResponse("VALIDATION_ERROR", "Test must have a title, subject, and class before publishing."), { status: 400 });
    }
    if (test._count.questions === 0) {
      return NextResponse.json(errorResponse("NO_QUESTIONS", "Add at least one question before publishing."), { status: 400 });
    }

    const published = await prisma.test.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    return NextResponse.json({ test: published });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
