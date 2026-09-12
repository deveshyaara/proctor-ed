import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTeacher } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db/client";
import { Header } from "@/components/teacher/Header";
import { ResultsClient, AttemptItem } from "./ResultsClient";

export default async function TestResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTeacher();
  const { id } = await params;

  const test = await prisma.test.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          studentName: true,
          rollNumber: true,
          status: true,
          score: true,
          maxScore: true,
          riskScore: true,
          warningCount: true,
          startedAt: true,
          submittedAt: true,
          _count: {
            select: { proctoringEvents: true },
          },
        },
      },
    },
  });

  if (!test || test.teacherId !== session.user.id) {
    notFound();
  }

  const attempts: AttemptItem[] = test.attempts.map((a) => ({
    id: a.id,
    studentName: a.studentName,
    rollNumber: a.rollNumber,
    status: a.status,
    score: a.score,
    maxScore: a.maxScore,
    riskScore: a.riskScore,
    warningCount: a.warningCount,
    startedAt: a.startedAt?.toISOString() ?? null,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    eventCount: a._count.proctoringEvents,
  }));

  const submitted = attempts.filter(
    (a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED"
  );
  const scores = submitted
    .map((a) => a.score)
    .filter((s): s is number => s !== null);

  const summary = {
    total: attempts.length,
    submitted: submitted.length,
    averageScore:
      scores.length > 0
        ? scores.reduce((acc, v) => acc + v, 0) / scores.length
        : null,
    highestScore: scores.length > 0 ? Math.max(...scores) : null,
    lowestScore: scores.length > 0 ? Math.min(...scores) : null,
    flaggedCount: attempts.filter((a) => a.warningCount > 0 || a.riskScore > 0)
      .length,
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#11110F]">
      <Header
        title={`${test.title} — Results`}
        subtitle={`${test.subject} · ${test.className}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/tests/${test.id}`}
              className="text-[13px] text-[#AAA69B] hover:text-[#F4F0E7] px-3 py-1.5 rounded-lg border border-[rgba(244,240,231,0.08)] bg-[#191916]"
            >
              ← Exam Details
            </Link>
          </div>
        }
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
        <ResultsClient
          test={{
            id: test.id,
            title: test.title,
            subject: test.subject,
            className: test.className,
          }}
          attempts={attempts}
          summary={summary}
        />
      </main>
    </div>
  );
}
