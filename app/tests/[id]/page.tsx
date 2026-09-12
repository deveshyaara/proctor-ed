import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTeacher } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db/client";
import { Header } from "@/components/teacher/Header";
import { Badge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/utils/format";
import { TestDetailClient } from "./TestDetailClient";

export default async function TestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTeacher();
  const { id } = await params;

  const test = await prisma.test.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      _count: { select: { attempts: true } },
    },
  });

  if (!test || test.teacherId !== session.user.id) {
    notFound();
  }

  const settings = (test.settings as Record<string, unknown>) || {};
  const totalMarks = test.questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#11110F]">
      <Header
        title={test.title}
        subtitle={`${test.subject} · ${test.className}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/tests"
              className="text-[13px] text-[#AAA69B] hover:text-[#F4F0E7] px-3 py-1.5 rounded-lg border border-[rgba(244,240,231,0.08)] bg-[#191916]"
            >
              ← All Exams
            </Link>
          </div>
        }
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Test status & Live Code banner */}
        <TestDetailClient
          test={{
            id: test.id,
            title: test.title,
            testCode: test.testCode,
            status: test.status,
            subject: test.subject,
            className: test.className,
            questionsCount: test.questions.length,
            attemptsCount: test._count.attempts,
          }}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
            <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
              Questions
            </span>
            <span className="text-[24px] font-bold text-[#F4F0E7]">
              {test.questions.length}
            </span>
          </div>

          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
            <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
              Total Marks
            </span>
            <span className="text-[24px] font-bold text-[#F4F0E7]">
              {totalMarks}
            </span>
          </div>

          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
            <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
              Duration
            </span>
            <span className="text-[24px] font-bold text-[#F4F0E7]">
              {formatDuration(test.durationSeconds)}
            </span>
          </div>

          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
            <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
              Submissions
            </span>
            <span className="text-[24px] font-bold text-[#E4572E]">
              {test._count.attempts}
            </span>
          </div>
        </div>

        {/* Two Columns: Questions Breakdown & Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Questions List (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[rgba(244,240,231,0.08)]">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#F4F0E7]">
                    Question Papers ({test.questions.length})
                  </h2>
                  <p className="text-[12px] text-[#AAA69B]">
                    Assigned items for this examination
                  </p>
                </div>
                <span className="text-[12px] font-mono text-[#AAA69B]">
                  {totalMarks} total marks
                </span>
              </div>

              {test.questions.length === 0 ? (
                <div className="text-center py-10 text-[14px] text-[#AAA69B]">
                  No questions in this test.
                </div>
              ) : (
                <div className="divide-y divide-[rgba(244,240,231,0.06)]">
                  {test.questions.map((q, idx) => (
                    <div key={q.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-[#22211C] border border-[rgba(244,240,231,0.08)] flex items-center justify-center text-[11px] font-mono text-[#AAA69B] shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="neutral">{q.type}</Badge>
                              <span className="text-[12px] text-[#7A9E7E] font-medium">
                                +{q.marks} m
                              </span>
                              {q.negativeMarks > 0 && (
                                <span className="text-[12px] text-[#E4572E]">
                                  -{q.negativeMarks} m
                                </span>
                              )}
                            </div>
                            <p className="text-[14px] text-[#F4F0E7] font-medium leading-relaxed">
                              {q.questionText}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* If MCQ: Options Preview */}
                      {q.type === "MCQ" && Array.isArray(q.options) && (
                        <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {(q.options as string[]).map((opt, oIdx) => {
                            const isCorrect = String(oIdx) === q.correctAnswer;
                            return (
                              <div
                                key={oIdx}
                                className={[
                                  "text-[12px] px-3 py-1.5 rounded-[8px] border flex items-center gap-2",
                                  isCorrect
                                    ? "bg-[#7A9E7E]/10 border-[#7A9E7E]/30 text-[#7A9E7E] font-medium"
                                    : "bg-[#22211C] border-[rgba(244,240,231,0.06)] text-[#AAA69B]",
                                ].join(" ")}
                              >
                                <span className="font-mono">{String.fromCharCode(65 + oIdx)}.</span>
                                <span>{opt}</span>
                                {isCorrect && <span className="ml-auto text-[10px]">✓ Correct</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Correct answer display for other types */}
                      {q.type !== "MCQ" && (
                        <div className="ml-8 text-[12px] text-[#7A9E7E] bg-[#7A9E7E]/10 border border-[#7A9E7E]/20 px-3 py-1 rounded-[6px] inline-block">
                          Answer: <span className="font-mono font-medium">{q.correctAnswer}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Settings & Details (1 col) */}
          <div className="space-y-4">
            {/* Proctoring Settings */}
            <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-4">
              <h3 className="text-[15px] font-semibold text-[#F4F0E7]">
                Proctoring Rules
              </h3>
              <div className="space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Camera Monitoring</span>
                  <Badge variant={settings.cameraRequired ? "success" : "neutral"}>
                    {settings.cameraRequired ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Fullscreen Enforcement</span>
                  <Badge variant={settings.fullscreenRequired ? "success" : "neutral"}>
                    {settings.fullscreenRequired ? "Locked" : "Unlocked"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Tab Switch Detection</span>
                  <Badge variant={settings.tabSwitchDetection ? "success" : "neutral"}>
                    {settings.tabSwitchDetection ? "Active" : "Off"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Violation Warning Limit</span>
                  <span className="text-[#F4F0E7] font-medium font-mono">
                    {Number(settings.warningLimit || 3)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Auto Submit on Expiry</span>
                  <Badge variant={settings.autoSubmitOnExpiry ? "success" : "neutral"}>
                    {settings.autoSubmitOnExpiry ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Exam Behavior */}
            <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-4">
              <h3 className="text-[15px] font-semibold text-[#F4F0E7]">
                Exam Behavior
              </h3>
              <div className="space-y-2.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Randomize Questions</span>
                  <Badge variant={settings.randomizeQuestions ? "neutral" : "neutral"}>
                    {settings.randomizeQuestions ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Randomize MCQ Choices</span>
                  <Badge variant={settings.randomizeOptions ? "neutral" : "neutral"}>
                    {settings.randomizeOptions ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#AAA69B]">Instant Results</span>
                  <Badge variant={settings.showResultImmediately ? "success" : "neutral"}>
                    {settings.showResultImmediately ? "Shown" : "Hidden"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
