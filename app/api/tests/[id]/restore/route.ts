import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;

    const test = await prisma.test.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } } },
    });

    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    if (test.teacherId !== session.user.id) {
      return NextResponse.json(errorResponse("FORBIDDEN", "Access denied. You do not own this examination."), { status: 403 });
    }
    if (test.status !== "ARCHIVED") {
      return NextResponse.json(errorResponse("INVALID_TRANSITION", "Only ARCHIVED examinations can be restored."), { status: 409 });
    }

    // Restore to CLOSED if attempts exist, or DRAFT if empty/unattempted
    const targetStatus = test._count.attempts > 0 ? "CLOSED" : "DRAFT";

    const restored = await prisma.$transaction(async (tx) => {
      const updated = await tx.test.update({
        where: { id },
        data: { status: targetStatus },
      });

      await tx.auditLog.create({
        data: {
          action: "TEST_RESTORED",
          actorId: session.user.id,
          entityType: "Test",
          entityId: id,
          details: {
            testCode: test.testCode,
            title: test.title,
            targetStatus,
            submissionCount: test._count.attempts,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ restored: true, test: restored });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
