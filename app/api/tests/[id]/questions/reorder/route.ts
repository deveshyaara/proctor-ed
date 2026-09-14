import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { reorderQuestionsSchema } from "@/lib/validation/test";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;

    const test = await prisma.test.findFirst({
      where: { id, teacherId: session.user.id },
      include: {
        _count: {
          select: {
            attempts: { where: { status: { in: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"] } } },
          },
        },
      },
    });
    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    if ((test.status === "PUBLISHED" && test._count.attempts > 0) ||
        test.status === "CLOSED" || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "Cannot reorder questions on this examination."), { status: 422 });
    }

    const body = await req.json();
    const parsed = reorderQuestionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
    }

    // Verify all question IDs belong to this test and all test questions are included
    const totalQuestionsInTest = await prisma.question.count({ where: { testId: id } });
    if (parsed.data.order.length !== totalQuestionsInTest) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", `Reorder list must contain all ${totalQuestionsInTest} questions in the test.`),
        { status: 400 }
      );
    }

    const questionIds = parsed.data.order.map((o) => o.id);
    const uniqueIds = new Set(questionIds);
    if (uniqueIds.size !== questionIds.length) {
      return NextResponse.json(
        errorResponse("VALIDATION_ERROR", "Duplicate question IDs in reorder payload."),
        { status: 400 }
      );
    }

    const existing = await prisma.question.findMany({ where: { testId: id, id: { in: questionIds } } });
    if (existing.length !== questionIds.length) {
      return NextResponse.json(errorResponse("VALIDATION_ERROR", "One or more question IDs are invalid."), { status: 400 });
    }

    // Verify target orders form a valid permutation of 1..N (no duplicates, no gaps)
    const targetOrders = parsed.data.order.map((o) => o.order).sort((a, b) => a - b);
    for (let i = 0; i < targetOrders.length; i++) {
      if (targetOrders[i] !== i + 1) {
        return NextResponse.json(
          errorResponse("VALIDATION_ERROR", "Target orders must be a continuous sequence from 1 to N with no duplicates or gaps."),
          { status: 400 }
        );
      }
    }

    // Two-phase atomic transaction to prevent @@unique([testId, order]) constraint collision
    await prisma.$transaction(async (tx) => {
      // Phase 1: Assign temporary negative values to clear positive order slots
      for (let i = 0; i < parsed.data.order.length; i++) {
        const item = parsed.data.order[i];
        await tx.question.update({
          where: { id: item.id },
          data: { order: -(i + 1) },
        });
      }

      // Phase 2: Assign desired positive orders
      for (const item of parsed.data.order) {
        await tx.question.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }
    });

    return NextResponse.json({ reordered: true });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
