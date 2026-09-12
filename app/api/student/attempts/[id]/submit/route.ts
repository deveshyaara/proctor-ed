import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, errorResponse } from "@/lib/exam/attemptAuth";
import { isTerminal } from "@/lib/exam/stateMachine";
import { executeAttemptSubmission } from "@/lib/exam/submission";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const attempt = await requireAttemptOwnership(id, rawToken);

    // IDEMPOTENT: if already in terminal state, return existing result
    if (isTerminal(attempt.status)) {
      const test = await prisma.test.findUnique({ where: { id: attempt.testId }, select: { settings: true } });
      const settings = test?.settings as { showResultImmediately?: boolean } | null;
      if (settings?.showResultImmediately && attempt.score !== null) {
        return NextResponse.json({
          submitted: true,
          score: attempt.score,
          maxScore: attempt.maxScore,
          percentage: attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 10000) / 100 : 0,
        });
      }
      return NextResponse.json({ submitted: true });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json(
        errorResponse("INVALID_TRANSITION", "This examination cannot be submitted in its current state."),
        { status: 409 }
      );
    }

    const result = await executeAttemptSubmission(id, "SUBMITTED");

    const test = await prisma.test.findUnique({ where: { id: attempt.testId }, select: { settings: true } });
    const settings = test?.settings as { showResultImmediately?: boolean } | null;

    if (settings?.showResultImmediately && result.score !== null) {
      return NextResponse.json({
        submitted: true,
        score: result.score,
        maxScore: result.maxScore,
        percentage: result.percentage,
      });
    }

    return NextResponse.json({ submitted: true });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

