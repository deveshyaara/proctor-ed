import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { createQuestionSchema } from "@/lib/validation/test";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

async function getOwnedTest(teacherId: string, testId: string) {
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
  return test;
}

// ── GET /api/tests/[id]/questions ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    await getOwnedTest(session.user.id, id);

    const questions = await prisma.question.findMany({
      where: { testId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ questions });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ── POST /api/tests/[id]/questions ────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    const test = await getOwnedTest(session.user.id, id);

    // Block if published test has active/submitted attempts
    if (test.status === "PUBLISHED" && test._count.attempts > 0) {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "Cannot add questions after students have started this examination."), { status: 422 });
    }
    if (test.status === "CLOSED" || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "This examination cannot be modified."), { status: 422 });
    }

    const body = await req.json();
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const maxOrder = await prisma.question.aggregate({ where: { testId: id }, _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? 0) + 1;

    const question = await prisma.question.create({
      data: {
        testId: id,
        type: data.type as "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER",
        questionText: data.questionText,
        options: data.options ?? undefined,
        correctAnswer: data.correctAnswer,
        marks: data.marks,
        negativeMarks: data.negativeMarks,
        explanation: data.explanation,
        order: nextOrder,
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
