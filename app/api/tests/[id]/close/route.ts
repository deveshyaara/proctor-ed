import { NextRequest, NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

// ── POST /api/tests/[id]/close ────────────────────────────────────────────────
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireTeacherApi();
    const { id } = await params;

    const test = await prisma.test.findFirst({ where: { id, teacherId: session.user.id } });
    if (!test) return NextResponse.json(errorResponse("TEST_NOT_FOUND", "Test not found."), { status: 404 });
    if (test.status !== "PUBLISHED") {
      return NextResponse.json(errorResponse("INVALID_TRANSITION", "Only PUBLISHED tests can be closed."), { status: 409 });
    }

    // Close: no new attempts allowed, existing IN_PROGRESS can still submit
    const closed = await prisma.test.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    return NextResponse.json({ test: closed });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
