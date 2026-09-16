import { NextRequest, NextResponse } from "next/server";
import { attemptCookieName, errorResponse } from "@/lib/exam/attemptAuth";
import { getStudentAnswerSheet } from "@/lib/exam/studentAnswers";

type Params = { params: Promise<{ id: string }> };

// GET /api/student/attempts/[id]/answers — student question-by-question responses
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const rawToken = req.cookies.get(attemptCookieName(id))?.value;
    const data = await getStudentAnswerSheet(id, rawToken);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) {
      return NextResponse.json(errorResponse(err.code || "ERROR", err.message || "Error"), {
        status: err.status,
      });
    }
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred."),
      { status: 500 }
    );
  }
}
