import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { createTestSchema } from "@/lib/validation/test";
import { generateTestCode } from "@/lib/engines/testCode";
import { errorResponse } from "@/lib/exam/attemptAuth";

// ── GET /api/tests — list teacher's tests ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireTeacherApi();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = 20;

    const where: Record<string, unknown> = { teacherId: session.user.id };
    if (status && status !== "ALL") where.status = status;

    const tests = await prisma.test.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { attempts: true, questions: true } } },
    });

    const hasMore = tests.length > limit;
    const items = hasMore ? tests.slice(0, limit) : tests;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({ tests: items, nextCursor });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ── POST /api/tests — create test ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireTeacherApi();
    const body = await req.json();
    const parsed = createTestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: parsed.error.flatten().fieldErrors } },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Generate unique test code with collision retry
    let testCode = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateTestCode(data.subject);
      const existing = await prisma.test.findUnique({ where: { testCode: candidate } });
      if (!existing) { testCode = candidate; break; }
    }
    if (!testCode) {
      return NextResponse.json(errorResponse("CODE_GENERATION_FAILED", "Could not generate a unique test code. Please try again."), { status: 500 });
    }

    const test = await prisma.test.create({
      data: {
        teacherId: session.user.id,
        title: data.title,
        subject: data.subject,
        className: data.className,
        description: data.description,
        testCode,
        durationSeconds: data.durationSeconds,
        maxAttempts: data.maxAttempts,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        settings: data.settings,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ test }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
