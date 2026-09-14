import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { updateTestSchema } from "@/lib/validation/test";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

async function getOwnedTest(teacherId: string, testId: string) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      _count: {
        select: {
          attempts: { where: { status: { in: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"] } } },
          questions: true,
        },
      },
    },
  });
  if (!test) throw { status: 404, code: "TEST_NOT_FOUND", message: "Test not found." };
  if (test.teacherId !== teacherId) {
    throw { status: 403, code: "FORBIDDEN", message: "Access denied. You do not own this examination." };
  }
  return test;
}

// ── GET /api/tests/[id] ───────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    const test = await getOwnedTest(session.user.id, id);
    return NextResponse.json({ test });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ── PATCH /api/tests/[id] ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    const test = await getOwnedTest(session.user.id, id);

    // Check immutability: published test with attempts cannot change duration or settings
    if (test.status === "CLOSED" || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("EXAM_IMMUTABLE", "This examination cannot be modified."), { status: 422 });
    }
    if (test.status === "PUBLISHED" && test._count.attempts > 0) {
      return NextResponse.json(
        errorResponse("EXAM_IMMUTABLE", "Cannot modify examination configuration while student attempts exist."),
        { status: 422 }
      );
    }

    const body = await req.json();
    const parsed = updateTestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updated = await prisma.test.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.subject && { subject: data.subject }),
        ...(data.className && { className: data.className }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.durationSeconds && { durationSeconds: data.durationSeconds }),
        ...(data.maxAttempts && { maxAttempts: data.maxAttempts }),
        ...(data.startAt !== undefined && { startAt: data.startAt ? new Date(data.startAt) : null }),
        ...(data.endAt !== undefined && { endAt: data.endAt ? new Date(data.endAt) : null }),
        ...(data.settings && { settings: data.settings }),
      },
    });

    return NextResponse.json({ test: updated });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ── DELETE /api/tests/[id] ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;
    const test = await getOwnedTest(session.user.id, id);

    // Guard: Cannot delete a test that is currently LIVE
    if (test.status === "PUBLISHED") {
      return NextResponse.json(
        errorResponse("TEST_IS_LIVE", "Cannot delete an examination that is currently live. Close the examination first."),
        { status: 409 }
      );
    }

    const attemptCount = await prisma.attempt.count({ where: { testId: id } });

    // Submissions protection: If attempts exist, require typed confirmation
    if (attemptCount > 0) {
      const body = await req.json().catch(() => ({}));
      const confirmationCode = typeof body?.confirmationCode === "string" ? body.confirmationCode.trim().toUpperCase() : null;

      if (!confirmationCode || confirmationCode !== test.testCode.toUpperCase()) {
        return NextResponse.json(
          errorResponse(
            "CONFIRMATION_REQUIRED",
            `This examination has ${attemptCount} recorded student submission${attemptCount === 1 ? "" : "s"}. To permanently delete it, provide confirmationCode matching "${test.testCode}", or archive it instead.`
          ),
          { status: 422 }
        );
      }
    }

    // Atomic transaction: cascade deletion in strict FK order
    await prisma.$transaction(async (tx) => {
      // 1. Delete answers for all attempts of this test
      await tx.answer.deleteMany({
        where: { attempt: { testId: id } },
      });

      // 2. Delete proctoring events for all attempts of this test
      await tx.proctoringEvent.deleteMany({
        where: { attempt: { testId: id } },
      });

      // 3. Delete attempts
      await tx.attempt.deleteMany({
        where: { testId: id },
      });

      // 4. Delete questions
      await tx.question.deleteMany({
        where: { testId: id },
      });

      // 5. Create audit log entry
      await tx.auditLog.create({
        data: {
          action: "TEST_DELETED",
          actorId: session.user.id,
          entityType: "Test",
          entityId: id,
          details: {
            testCode: test.testCode,
            title: test.title,
            subject: test.subject,
            className: test.className,
            submissionCount: attemptCount,
            questionsCount: test._count.questions,
            status: test.status,
          },
        },
      });

      // 6. Delete test record
      await tx.test.delete({
        where: { id },
      });
    });

    // Structured server audit log
    console.log(
      JSON.stringify({
        level: "AUDIT",
        action: "TEST_DELETED",
        actorId: session.user.id,
        testId: id,
        testCode: test.testCode,
        submissionCount: attemptCount,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json({
      deleted: true,
      testId: id,
      testCode: test.testCode,
      title: test.title,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
