import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, isAttemptExpired, errorResponse } from "@/lib/exam/attemptAuth";
import { studentAnswerSchema } from "@/lib/validation/test";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rateLimitPolicy";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Rate limiting per attempt
    const rateCheck = checkRateLimit(
      `answer_sync:${id}`,
      RATE_LIMIT_POLICIES.ANSWER_SYNC.limit,
      RATE_LIMIT_POLICIES.ANSWER_SYNC.windowMs
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        errorResponse("RATE_LIMITED", "Too many answer updates. Please wait a moment."),
        { status: 429 }
      );
    }

    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const attempt = await requireAttemptOwnership(id, rawToken, "IN_PROGRESS");

    if (isAttemptExpired(attempt)) {
      return NextResponse.json(errorResponse("ATTEMPT_EXPIRED", "This examination has expired."), { status: 403 });
    }

    const body = await req.json();
    const parsed = studentAnswerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
    }

    const { questionId, answer } = parsed.data;

    // Verify question belongs to this test
    const question = await prisma.question.findFirst({ where: { id: questionId, testId: attempt.testId } });
    if (!question) {
      return NextResponse.json(errorResponse("QUESTION_NOT_FOUND", "Question not found."), { status: 404 });
    }

    // Upsert answer — idempotent
    await prisma.answer.upsert({
      where: { attemptId_questionId: { attemptId: id, questionId } },
      update: { answer, answeredAt: new Date() },
      create: { attemptId: id, questionId, answer, answeredAt: new Date() },
    });

    return NextResponse.json({ saved: true });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
