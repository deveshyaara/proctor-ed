import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { normalizeTestCode } from "@/lib/engines/testCode";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { RATE_LIMIT_POLICIES } from "@/lib/security/rateLimitPolicy";

/**
 * GET /api/student/tests/[code]/validate
 *
 * Validates a test code and returns safe public test information.
 * Never returns: correct answers, teacher info, internal IDs, private settings.
 *
 * Migrated from [testCode]/validate → [code]/validate to resolve the
 * Next.js slug collision: sibling dynamic routes must share the same param name.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = checkRateLimit(
    `validate_code:${ip}`,
    RATE_LIMIT_POLICIES.TEST_CODE_VALIDATE.limit,
    RATE_LIMIT_POLICIES.TEST_CODE_VALIDATE.windowMs
  );

  if (!rateCheck.allowed) {
    return apiError("Too many requests. Please wait before trying again.", 429);
  }

  const { code: rawCode } = await params;
  const code = normalizeTestCode(rawCode);

  const test = await prisma.test.findUnique({
    where: { testCode: code },
    select: {
      id: true,
      title: true,
      subject: true,
      className: true,
      description: true,
      status: true,
      durationSeconds: true,
      startAt: true,
      endAt: true,
      maxAttempts: true,
      settings: true,
      _count: { select: { questions: true } },
    },
  });

  if (!test) {
    return apiError("Test not found. Please check your code.", 404);
  }

  if (test.status !== "PUBLISHED") {
    return apiError("This test is not currently available.", 403);
  }

  const now = new Date();

  if (test.startAt && now < test.startAt) {
    return apiError(
      `This test will be available from ${test.startAt.toLocaleString()}.`,
      403
    );
  }

  if (test.endAt && now > test.endAt) {
    return apiError("This test has expired and is no longer accepting submissions.", 403);
  }

  // Return only safe public data
  return apiSuccess({
    testCode: code,
    title: test.title,
    subject: test.subject,
    className: test.className,
    description: test.description,
    durationSeconds: test.durationSeconds,
    questionCount: test._count.questions,
    // Only expose settings the student needs to know before entering
    cameraRequired: (test.settings as Record<string, unknown>)?.cameraRequired ?? true,
    fullscreenRequired: (test.settings as Record<string, unknown>)?.fullscreenRequired ?? true,
  });
}
