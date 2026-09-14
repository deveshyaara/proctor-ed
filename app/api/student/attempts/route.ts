import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { studentIdentitySchema } from "@/lib/validation/test";
import { normalizeTestCode } from "@/lib/engines/testCode";
import {
  generateAttemptToken,
  hashToken,
  attemptCookieName,
  errorResponse,
} from "@/lib/exam/attemptAuth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rateLimitPolicy";

// POST /api/student/attempts — create a new attempt
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const rateCheck = checkRateLimit(
      `attempt_create:${ip}`,
      RATE_LIMIT_POLICIES.ATTEMPT_CREATE.limit,
      RATE_LIMIT_POLICIES.ATTEMPT_CREATE.windowMs
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        errorResponse("RATE_LIMITED", "Too many attempt requests. Please wait a moment before trying again."),
        { status: 429 }
      );
    }

    const body = await req.json();
    const { testCode, ...identity } = body;

    if (!testCode || typeof testCode !== "string") {
      return NextResponse.json(errorResponse("VALIDATION_ERROR", "Test code is required."), { status: 400 });
    }

    const parsed = studentIdentitySchema.safeParse(identity);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const code = normalizeTestCode(testCode);
    const test = await prisma.test.findUnique({ where: { testCode: code } });

    if (!test || test.status === "ARCHIVED" || test.status === "DRAFT") {
      return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test code not found."), { status: 404 });
    }
    if (test.status === "CLOSED") {
      return NextResponse.json(errorResponse("TEST_CLOSED", "This examination has ended."), { status: 403 });
    }

    // Time window verification
    const now = new Date();
    if (test.startAt && now < new Date(test.startAt)) {
      return NextResponse.json(errorResponse("TEST_NOT_STARTED", "This examination has not started yet."), { status: 403 });
    }
    if (test.endAt && now > new Date(test.endAt)) {
      return NextResponse.json(errorResponse("TEST_ENDED", "This examination window has closed."), { status: 403 });
    }

    const normalizedRoll = parsed.data.rollNumber.trim().toUpperCase();
    const normalizedName = parsed.data.studentName.trim();

    // ── GAP-9 fix: re-attach to an existing IN_PROGRESS attempt if the cookie was lost ──
    const activeAttempt = await prisma.attempt.findFirst({
      where: { testId: test.id, rollNumber: normalizedRoll, status: "IN_PROGRESS" },
    });

    if (activeAttempt) {
      // Re-issue a fresh token for the existing attempt so the student can re-enter
      const freshRawToken = generateAttemptToken();
      const freshHash = hashToken(freshRawToken);
      await prisma.attempt.update({
        where: { id: activeAttempt.id },
        data: { accessTokenHash: freshHash },
      });

      const cookieName = attemptCookieName(activeAttempt.id);
      const isSecure = process.env.NODE_ENV === "production" || req.headers.get("x-forwarded-proto") === "https";

      const reattachResponse = NextResponse.json(
        { attemptId: activeAttempt.id, testTitle: test.title, durationSeconds: test.durationSeconds },
        { status: 200 }
      );
      reattachResponse.cookies.set(cookieName, freshRawToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "strict",
        maxAge: 60 * 60 * 6,
        path: "/",
      });
      return reattachResponse;
    }

    // Transactional maxAttempts check and creation
    // Only count active/terminal attempts (IN_PROGRESS, SUBMITTED, AUTO_SUBMITTED) — CREATED
    // attempts have no answers and do not represent a meaningful prior attempt.
    const rawToken = generateAttemptToken();
    const accessTokenHash = hashToken(rawToken);

    const attemptResult = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.attempt.count({
        where: {
          testId: test.id,
          rollNumber: normalizedRoll,
          status: { in: ["IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"] },
        },
      });

      if (existingCount >= test.maxAttempts) {
        return { error: "MAX_ATTEMPTS_EXCEEDED" as const, maxAttempts: test.maxAttempts };
      }

      const newAttempt = await tx.attempt.create({
        data: {
          testId: test.id,
          studentName: normalizedName,
          rollNumber: normalizedRoll,
          accessTokenHash,
          status: "CREATED",
        },
      });

      return { attempt: newAttempt };
    });

    if ("error" in attemptResult && attemptResult.error === "MAX_ATTEMPTS_EXCEEDED") {
      return NextResponse.json(
        errorResponse(
          "MAX_ATTEMPTS_EXCEEDED",
          `Maximum attempts (${attemptResult.maxAttempts}) reached for roll number ${normalizedRoll}.`
        ),
        { status: 403 }
      );
    }

    const attempt = attemptResult.attempt!;
    const cookieName = attemptCookieName(attempt.id);

    const response = NextResponse.json(
      { attemptId: attempt.id, testTitle: test.title, durationSeconds: test.durationSeconds },
      { status: 201 }
    );

    const isSecure = process.env.NODE_ENV === "production" || req.headers.get("x-forwarded-proto") === "https";

    response.cookies.set(cookieName, rawToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "strict",
      maxAge: 60 * 60 * 6, // 6 hours max
      path: "/",
    });

    return response;
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
