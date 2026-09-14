import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, isAttemptExpired, errorResponse } from "@/lib/exam/attemptAuth";
import { proctoringEventSchema } from "@/lib/validation/test";
import { executeAttemptSubmission } from "@/lib/exam/submission";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rateLimitPolicy";

const AUTHORITATIVE_SEVERITIES: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
  TAB_SWITCH: "HIGH",
  FULLSCREEN_EXIT: "HIGH",
  CAMERA_DISCONNECTED: "HIGH",
  CAMERA_RECONNECTED: "LOW",
  PERSON_MISSING: "MEDIUM",
  MULTIPLE_PEOPLE: "HIGH",
  PHONE_DETECTED: "HIGH",
  FACE_NOT_VISIBLE: "LOW",
  SUSPICIOUS_OBJECT: "HIGH",
  COPY_PASTE_DETECTED: "MEDIUM",
  PRINT_ATTEMPTED: "MEDIUM",
  PROLONGED_GAZE_DEVIATION: "MEDIUM", // Behavioral signal indicates potential looking at off-screen resources
  CAMERA_CONDITION_WARNING: "LOW", // Quality/UX nudge, not a behavioral signal
  OTHER: "LOW",
};

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rateCheck = checkRateLimit(
      `event_ingest:${id}`,
      RATE_LIMIT_POLICIES.EVENT_INGEST.limit,
      RATE_LIMIT_POLICIES.EVENT_INGEST.windowMs
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(errorResponse("RATE_LIMITED", "Too many events reported."), { status: 429 });
    }

    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const attempt = await requireAttemptOwnership(id, rawToken, "IN_PROGRESS");

    if (isAttemptExpired(attempt)) {
      return NextResponse.json(errorResponse("ATTEMPT_EXPIRED", "This examination has expired."), { status: 403 });
    }

    const body = await req.json();
    const parsed = proctoringEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
    }

    const { eventType, description, confidence, metadata } = parsed.data;
    // Server enforces authoritative severity — client cannot downgrade HIGH violations
    const authoritativeSeverity = AUTHORITATIVE_SEVERITIES[eventType] ?? parsed.data.severity;

    // Server records authoritative receipt timestamp — never trust client
    const serverTimestamp = new Date();

    const test = await prisma.test.findUnique({ where: { id: attempt.testId }, select: { settings: true } });
    const settings = test?.settings as { warningLimit?: number } | null;
    const warningLimit = settings?.warningLimit ?? 3;

      // Use atomic transaction to prevent race condition on warning increments
      const result = await prisma.$transaction(async (tx) => {
        const event = await tx.proctoringEvent.create({
          data: {
            attemptId: id,
            eventType,
            severity: authoritativeSeverity,
            description,
            confidence,
            metadata,
            timestamp: serverTimestamp,
          },
        });

        let warningCount = attempt.warningCount;
        let autoTerminated = false;
        let terminalScore: number | null = null;
        let terminalMaxScore: number | null = null;

        // Increment warning count for HIGH severity events (atomic)
        if (authoritativeSeverity === "HIGH") {
          const updated = await tx.attempt.update({
            where: { id },
            data: { warningCount: { increment: 1 } },
            select: { warningCount: true },
          });
          warningCount = updated.warningCount;

          // Check limit and auto-submit if reached (all in transaction)
          if (warningCount >= warningLimit) {
            const submission = await executeAttemptSubmission(id, "AUTO_SUBMITTED");
            autoTerminated = true;
            terminalScore = submission.score;
            terminalMaxScore = submission.maxScore;
          }
        }

        return { event, warningCount, autoTerminated, terminalScore, terminalMaxScore };
      });

      const { event, warningCount, autoTerminated, terminalScore, terminalMaxScore } = result;

    return NextResponse.json({
      logged: true,
      eventId: event.id,
      warningCount,
      warningLimit,
      autoTerminated,
      ...(autoTerminated && { status: "AUTO_SUBMITTED", score: terminalScore, maxScore: terminalMaxScore }),
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
