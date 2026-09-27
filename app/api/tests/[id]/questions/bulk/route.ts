import { NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { createQuestionSchema } from "@/lib/validation/test";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireTeacherApi();
    const resolvedParams = await params;
    const testId = resolvedParams.id;

    // Verify test ownership and state
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { _count: { select: { questions: true } } },
    });

    if (!test) {
      return NextResponse.json({ error: { code: "TEST_NOT_FOUND", message: "Test not found." } }, { status: 404 });
    }

    if (test.teacherId !== session.user.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Forbidden." } }, { status: 403 });
    }

    if (test.status !== "DRAFT") {
      return NextResponse.json(
        { error: { code: "EXAM_IMMUTABLE", message: "Questions can only be added to DRAFT tests." } },
        { status: 400 }
      );
    }

    const body = await req.json();
    if (!body.questions || !Array.isArray(body.questions)) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Missing or invalid 'questions' array." } }, { status: 400 });
    }

    const questionsToCreate = [];
    let currentOrder = test._count.questions;

    for (let i = 0; i < body.questions.length; i++) {
      const parsed = createQuestionSchema.safeParse(body.questions[i]);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "QUESTION_VALIDATION_FAILED", message: `Validation failed at index ${i}`, details: parsed.error.format() } },
          { status: 400 }
        );
      }

      questionsToCreate.push({
        testId,
        type: parsed.data.type,
        questionText: parsed.data.questionText,
        options: parsed.data.options ?? undefined,
        correctAnswer: parsed.data.correctAnswer,
        marks: parsed.data.marks,
        negativeMarks: parsed.data.negativeMarks,
        explanation: parsed.data.explanation,
        order: currentOrder++,
      });
    }

    await prisma.question.createMany({
      data: questionsToCreate,
    });

    return NextResponse.json({ created: questionsToCreate.length });
  } catch (error: any) {
    if (error.statusCode) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    console.error("[BulkQuestion] Error:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, { status: 500 });
  }
}
