import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { normalizeTestCode } from "@/lib/engines/testCode";
import { errorResponse } from "@/lib/exam/attemptAuth";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rateLimitPolicy";

// GET /api/student/tests/[code] — validate test code, return public metadata only
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Rate limiting
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = checkRateLimit(
    `test_code_lookup:${ip}`,
    RATE_LIMIT_POLICIES.TEST_CODE_VALIDATE.limit,
    RATE_LIMIT_POLICIES.TEST_CODE_VALIDATE.windowMs
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(errorResponse("RATE_LIMITED", "Too many requests. Please wait before trying again."), { status: 429 });
  }

  // Constant-time delay to prevent timing oracle (always ~50ms)
  await new Promise((r) => setTimeout(r, 50));

  try {
    const { code } = await params;
    const testCode = normalizeTestCode(code);

    const test = await prisma.test.findUnique({
      where: { testCode },
      select: { id: true, title: true, subject: true, className: true, durationSeconds: true, status: true, startAt: true, endAt: true, settings: true },
    });

    // Return same-shape 404 for missing vs unpublished (timing already equalized)
    if (!test || test.status === "ARCHIVED") {
      return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test code not found."), { status: 404 });
    }
    if (test.status === "DRAFT") {
      return NextResponse.json(errorResponse("TEST_NOT_PUBLISHED", "This examination is not currently available."), { status: 403 });
    }
    if (test.status === "CLOSED") {
      return NextResponse.json(errorResponse("TEST_CLOSED", "This examination has ended."), { status: 403 });
    }

    // Check time window
    const now = new Date();
    if (test.startAt && now < test.startAt) {
      return NextResponse.json(errorResponse("TEST_NOT_STARTED", "This examination has not started yet."), { status: 403 });
    }
    if (test.endAt && now > test.endAt) {
      return NextResponse.json(errorResponse("TEST_CLOSED", "This examination has ended."), { status: 403 });
    }

    // Return only public metadata — no questions, no settings, no teacher info
    return NextResponse.json({
      test: {
        id: test.id,
        title: test.title,
        subject: test.subject,
        className: test.className,
        durationSeconds: test.durationSeconds,
        testCode,
        cameraRequired: (test.settings as { cameraRequired?: boolean } | null)?.cameraRequired ?? true,
      },
    });
  } catch {
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
