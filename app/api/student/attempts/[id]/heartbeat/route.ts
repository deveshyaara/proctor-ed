import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, attemptCookieName, errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const attempt = await requireAttemptOwnership(id, rawToken);

    // Allow heartbeat even if expired (client needs to know)
    const now = new Date();
    const expired = attempt.expiresAt ? now > attempt.expiresAt : false;

    if (attempt.status === "IN_PROGRESS") {
      await prisma.attempt.update({ where: { id }, data: { lastHeartbeatAt: now } });
    }

    return NextResponse.json({
      expired,
      expiresAt: attempt.expiresAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      status: attempt.status,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    return NextResponse.json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
