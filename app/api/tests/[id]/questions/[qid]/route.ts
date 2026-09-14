import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { updateQuestionSchema } from "@/lib/validation/test";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string; qid: string }> };

async function getOwnedQuestion(teacherId: string, testId: string, qid: string) {
  const test = await prisma.test.findFirst({
    where: { id: testId, teacherId },
    include: {
      _count: {
        select: {
          attempts: { where: { status: { in: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"] } } },
        },
      },
    },
  });
  if (!test) throw { status: 404, code: "TEST_NOT_FOUND", message: "Test not found." };

  const question = await prisma.question.findFirst({ where: { id: qid, testId } });
  if (!question) throw { status: 404, code: "QUESTION_NOT_FOUND", message: "Question not found." };

  return { test, question };
}

// ── PATCH /api/tests/[id]/questions/[qid] ────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id, qid } = await params;
    const { test } = await getOwnedQuestion(session.user.id, id, qid);

    if ((test.status === "PUBLISHED" && test._count.attempts > 0) ||
        test.status === "CLOSED" || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "This examination cannot be modified."), { status: 422 });
    }

    const body = await req.json();
    const parsed = updateQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updated = await prisma.question.update({
      where: { id: qid },
      data: {
        ...(data.type && { type: data.type as "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER" }),
        ...(data.questionText && { questionText: data.questionText }),
        ...(data.options !== undefined && { options: data.options ?? null }),
        ...(data.correctAnswer && { correctAnswer: data.correctAnswer }),
        ...(data.marks !== undefined && { marks: data.marks }),
        ...(data.negativeMarks !== undefined && { negativeMarks: data.negativeMarks }),
        ...(data.explanation !== undefined && { explanation: data.explanation }),
      },
    });

    return NextResponse.json({ question: updated });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ── DELETE /api/tests/[id]/questions/[qid] ───────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id, qid } = await params;
    const { test, question } = await getOwnedQuestion(session.user.id, id, qid);

    // Verify question belongs to this test (defense in depth)
    if (question.testId !== id) {
      return NextResponse.json(errorResponse("QUESTION_NOT_FOUND", "Question not found in this test."), { status: 404 });
    }

    if ((test.status === "PUBLISHED" && test._count.attempts > 0) ||
        test.status === "CLOSED" || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "Cannot delete questions from this examination."), { status: 422 });
    }

    // Delete and reorder remaining questions in a two-phase transaction
    await prisma.$transaction(async (tx) => {
      await tx.question.delete({ where: { id: qid } });
      const remaining = await tx.question.findMany({
        where: { testId: id },
        orderBy: { order: "asc" },
      });
      // Phase 1: temporary negative slots
      for (let i = 0; i < remaining.length; i++) {
        await tx.question.update({ where: { id: remaining[i].id }, data: { order: -(i + 1) } });
      }
      // Phase 2: final positive slots
      for (let i = 0; i < remaining.length; i++) {
        await tx.question.update({ where: { id: remaining[i].id }, data: { order: i + 1 } });
      }
    });

    // Return deleted order so client can re-sync
    return NextResponse.json({ deleted: true, deletedOrder: question.order });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
