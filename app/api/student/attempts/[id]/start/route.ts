import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, errorResponse, isAttemptExpired } from "@/lib/exam/attemptAuth";
import { assertLegalTransition } from "@/lib/exam/stateMachine";
import { toStudentQuestions, shuffleQuestionIds, shuffleOptionMap } from "@/lib/exam/questions";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    // Allow either CREATED or IN_PROGRESS for start idempotency
    const attempt = await requireAttemptOwnership(id, rawToken, ["CREATED", "IN_PROGRESS"]);

    const test = await prisma.test.findUnique({
      where: { id: attempt.testId },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    if (test.status !== "PUBLISHED") {
      return NextResponse.json(
        errorResponse("TEST_CLOSED", "This examination is no longer available."),
        { status: 403 }
      );
    }

    // Re-check the availability window here, not only when the attempt is
    // created. A student may open the identity form before the window ends
    // and otherwise start the timer after the test has closed.
    const availabilityNow = new Date();
    if (test.startAt && availabilityNow < test.startAt) {
      return NextResponse.json(
        errorResponse("TEST_NOT_STARTED", "This examination has not started yet."),
        { status: 403 }
      );
    }
    if (test.endAt && availabilityNow > test.endAt) {
      return NextResponse.json(
        errorResponse("TEST_ENDED", "This examination window has closed."),
        { status: 403 }
      );
    }

    // IDEMPOTENCY HANDLER: If already IN_PROGRESS, return existing state deterministically
    if (attempt.status === "IN_PROGRESS") {
      if (isAttemptExpired(attempt)) {
        return NextResponse.json(errorResponse("ATTEMPT_EXPIRED", "This examination time limit has expired."), { status: 409 });
      }

      const existingQuestionOrder = (attempt.questionOrder as string[]) || test.questions.map((q) => q.id);
      const existingOptionOrderMap = (attempt.optionOrderMap as Record<string, number[]>) || {};

      const studentQuestions = toStudentQuestions(test.questions, existingQuestionOrder, existingOptionOrderMap);

      return NextResponse.json({
        questions: studentQuestions,
        expiresAt: attempt.expiresAt!.toISOString(),
        startedAt: attempt.startedAt!.toISOString(),
      });
    }

    // Attempt is CREATED -> Initialize examination
    const body = await req.json().catch(() => ({}));
    const fullscreenConfirmed = Boolean(body?.fullscreenConfirmed);
    const settings = test.settings as {
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      fullscreenRequired?: boolean;
    };

    // Generate and persist shuffle orders server-side
    const questionIds = test.questions.map((q) => q.id);
    const questionOrder = settings.randomizeQuestions ? shuffleQuestionIds(questionIds) : questionIds;
    const optionOrderMap = settings.randomizeOptions ? shuffleOptionMap(test.questions) : {};

    const now = new Date();
    const expiresAt = new Date(now.getTime() + test.durationSeconds * 1000);

    assertLegalTransition(attempt.status, "IN_PROGRESS");

    await prisma.attempt.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        expiresAt,
        questionOrder: questionOrder,
        optionOrderMap: optionOrderMap,
        lastHeartbeatAt: now,
      },
    });

    // Server-side integrity check: log if student started without client fullscreen verification
    if (settings.fullscreenRequired !== false && !fullscreenConfirmed) {
      await prisma.proctoringEvent.create({
        data: {
          attemptId: id,
          eventType: "FULLSCREEN_EXIT",
          severity: "MEDIUM",
          description: "Attempt started without client fullscreen confirmation.",
        },
      });
    }

    const studentQuestions = toStudentQuestions(test.questions, questionOrder, optionOrderMap);

    return NextResponse.json({
      questions: studentQuestions,
      expiresAt: expiresAt.toISOString(),
      startedAt: now.toISOString(),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
