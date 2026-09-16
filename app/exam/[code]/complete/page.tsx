import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { normalizeTestCode } from "@/lib/engines/testCode";
import { ATTEMPT_TOKEN_COOKIE, hashToken } from "@/lib/exam/attemptAuth";
import { getStudentAnswerSheet, type StudentAnswerSheetResult } from "@/lib/exam/studentAnswers";
import { StudentAnswerBreakdown } from "@/components/exam/StudentAnswerBreakdown";
import { Button } from "@/components/ui/Button";

export default async function ExamCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { code } = await params;
  const { auto } = await searchParams;
  const isAuto = auto === "true";

  const testCode = normalizeTestCode(code);
  const test = await prisma.test.findUnique({
    where: { testCode },
  });

  const cookieStore = await cookies();
  // Find attempt cookie
  const allCookies = cookieStore.getAll();
  const attemptCookie = allCookies.find((c) => c.name.startsWith(ATTEMPT_TOKEN_COOKIE));

  const settings = (test?.settings as Record<string, unknown>) || {};
  const showResult = Boolean(settings.showResultImmediately ?? true);
  const showCorrectAnswers = Boolean(settings.showCorrectAnswers ?? false);

  let attemptScore: number | null = null;
  let maxScore: number | null = null;
  let studentName: string | null = null;
  let answerSheet: StudentAnswerSheetResult | null = null;

  if (attemptCookie && test) {
    const tokenHash = hashToken(attemptCookie.value);
    const attempt = await prisma.attempt.findFirst({
      where: { testId: test.id, accessTokenHash: tokenHash },
      select: { id: true, score: true, maxScore: true, studentName: true },
    });
    if (attempt) {
      attemptScore = attempt.score;
      maxScore = attempt.maxScore;
      studentName = attempt.studentName;

      if (showResult && showCorrectAnswers) {
        try {
          answerSheet = await getStudentAnswerSheet(attempt.id, attemptCookie.value);
        } catch (e) {
          console.error("Failed to load student answer breakdown:", e);
        }
      }
    }
  }

  const percentage =
    attemptScore !== null && maxScore
      ? Math.round((attemptScore / maxScore) * 100)
      : null;

  const hasAnswerBreakdown = Boolean(
    answerSheet?.questions && answerSheet.questions.length > 0
  );

  return (
    <div className="min-h-screen bg-[#11110F] flex items-center justify-center p-4 sm:p-6 my-auto">
      <div
        className={`bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[20px] p-6 sm:p-10 w-full text-center space-y-6 shadow-xl my-8 transition-all ${
          hasAnswerBreakdown ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-[#7A9E7E]/15 text-[#7A9E7E] flex items-center justify-center text-3xl mx-auto border border-[#7A9E7E]/30">
          ✓
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-[22px] sm:text-[26px] font-bold text-[#F4F0E7] tracking-tight">
            Examination Completed
          </h1>
          <p className="text-[14px] text-[#AAA69B]">
            {studentName ? `Thank you, ${studentName}. ` : ""}
            Your examination has been successfully submitted and logged.
          </p>
          {isAuto && (
            <p className="text-[12px] text-[#E4572E] bg-[#E4572E]/10 py-1.5 px-3 rounded-full inline-block font-medium">
              Note: This exam was auto-submitted due to timer expiry or proctoring policy.
            </p>
          )}
        </div>

        {/* Exam metadata */}
        {test && (
          <div className="p-4 rounded-[12px] bg-[#22211C] border border-[rgba(244,240,231,0.06)] text-left space-y-1">
            <span className="text-[11px] uppercase font-mono tracking-wider text-[#AAA69B]">
              Assessment
            </span>
            <div className="text-[15px] font-semibold text-[#F4F0E7]">{test.title}</div>
            <div className="text-[13px] text-[#AAA69B]">
              {test.subject} · {test.className}
            </div>
          </div>
        )}

        {/* Score Card if immediate results are enabled */}
        {showResult && attemptScore !== null && maxScore !== null ? (
          <div className="p-5 rounded-[14px] bg-[#22211C] border border-[#7A9E7E]/30 space-y-2">
            <span className="text-[12px] uppercase font-mono tracking-wider text-[#AAA69B]">
              Final Score
            </span>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-[36px] font-bold text-[#7A9E7E] font-mono">
                {attemptScore}
              </span>
              <span className="text-[18px] text-[#AAA69B] font-mono">/ {maxScore}</span>
            </div>
            {percentage !== null && (
              <span className="text-[14px] font-medium text-[#F4F0E7]">
                Percentage: {percentage}%
              </span>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-[12px] bg-[#22211C] border border-[rgba(244,240,231,0.06)] text-[13px] text-[#AAA69B]">
            ℹ️ Result publication has been withheld for teacher moderation. Your instructor will release final scores shortly.
          </div>
        )}

        {/* Per-Question Answer & Explanation Breakdown (when showResultImmediately && showCorrectAnswers) */}
        {hasAnswerBreakdown && answerSheet && (
          <StudentAnswerBreakdown sheet={answerSheet} />
        )}

        {/* Closing Notice */}
        <p className="text-[12px] text-[#AAA69B]">
          All exam data, integrity checks, and answers have been securely synced. You may safely close this browser window.
        </p>

        {/* Actions */}
        <div className="pt-2">
          <Link href="/">
            <Button variant="secondary" className="w-full">
              ← Return to Homepage
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

