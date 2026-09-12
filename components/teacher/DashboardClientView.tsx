"use client";

import { useState } from "react";
import Link from "next/link";
import { TestStatusBadge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/utils/format";
import { TestCardActionButtons } from "@/app/dashboard/TestCardActionButtons";
import { TestListActions, ActionTestItem } from "@/app/tests/TestListActions";
import { Button } from "@/components/ui/Button";

interface DashboardTestItem extends ActionTestItem {
  subject: string;
  className: string;
  durationSeconds: number;
}

interface DashboardClientViewProps {
  initialTests: DashboardTestItem[];
  initialLiveTests: DashboardTestItem[];
  initialKpis: {
    totalTests: number;
    activeTests: number;
    draftTests: number;
    totalAttempts: number;
  };
}

export function DashboardClientView({
  initialTests,
  initialLiveTests,
  initialKpis,
}: DashboardClientViewProps) {
  const [tests, setTests] = useState<DashboardTestItem[]>(initialTests);
  const [liveTests, setLiveTests] = useState<DashboardTestItem[]>(initialLiveTests);
  const [kpis, setKpis] = useState(initialKpis);

  const handleDeleted = (testId: string) => {
    const deletedTest = tests.find((t) => t.id === testId) || liveTests.find((t) => t.id === testId);
    const attemptsCount = deletedTest?.attemptsCount ?? deletedTest?._count?.attempts ?? 0;
    const wasPublished = deletedTest?.status === "PUBLISHED";
    const wasDraft = deletedTest?.status === "DRAFT";

    // Optimistic UI updates
    setTests((prev) => prev.filter((t) => t.id !== testId));
    setLiveTests((prev) => prev.filter((t) => t.id !== testId));
    setKpis((prev) => ({
      totalTests: Math.max(0, prev.totalTests - 1),
      activeTests: wasPublished ? Math.max(0, prev.activeTests - 1) : prev.activeTests,
      draftTests: wasDraft ? Math.max(0, prev.draftTests - 1) : prev.draftTests,
      totalAttempts: Math.max(0, prev.totalAttempts - attemptsCount),
    }));
  };

  const handleArchived = (testId: string) => {
    const archivedTest = tests.find((t) => t.id === testId);
    const wasPublished = archivedTest?.status === "PUBLISHED";

    setLiveTests((prev) => prev.filter((t) => t.id !== testId));
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, status: "ARCHIVED" } : t))
    );
    if (wasPublished) {
      setKpis((prev) => ({
        ...prev,
        activeTests: Math.max(0, prev.activeTests - 1),
      }));
    }
  };

  const handleClosed = (testId: string) => {
    setLiveTests((prev) => prev.filter((t) => t.id !== testId));
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, status: "CLOSED" } : t))
    );
    setKpis((prev) => ({
      ...prev,
      activeTests: Math.max(0, prev.activeTests - 1),
    }));
  };

  const handleRestored = (testId: string) => {
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, status: "CLOSED" } : t))
    );
  };

  return (
    <div className="space-y-8">
      {/* KPI Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Key Performance Indicators">
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono uppercase tracking-wider text-[#AAA69B]">Live Examinations</span>
            <span className="flex h-2 w-2 rounded-full bg-[#7A9E7E] animate-pulse" />
          </div>
          <div className="text-[28px] font-bold text-[#F4F0E7] tabular-nums">{kpis.activeTests}</div>
          <p className="text-[12px] text-[#AAA69B]">Accepting student entries</p>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono uppercase tracking-wider text-[#AAA69B]">Total Examinations</span>
            <span className="text-[#AAA69B] text-xs font-mono">ALL</span>
          </div>
          <div className="text-[28px] font-bold text-[#F4F0E7] tabular-nums">{kpis.totalTests}</div>
          <p className="text-[12px] text-[#AAA69B]">Across all subjects & classes</p>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono uppercase tracking-wider text-[#AAA69B]">Total Submissions</span>
            <span className="text-[#E4572E] text-xs font-mono">LOGGED</span>
          </div>
          <div className="text-[28px] font-bold text-[#E4572E] tabular-nums">{kpis.totalAttempts}</div>
          <p className="text-[12px] text-[#AAA69B]">Proctored student sessions</p>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-mono uppercase tracking-wider text-[#AAA69B]">Drafts</span>
            <span className="text-[#D6A84F] text-xs font-mono">PREP</span>
          </div>
          <div className="text-[28px] font-bold text-[#F4F0E7] tabular-nums">{kpis.draftTests}</div>
          <p className="text-[12px] text-[#AAA69B]">In configuration or review</p>
        </div>
      </section>

      {/* Live Active Examinations (Quick Share & Monitor) */}
      {liveTests.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-[18px] font-bold text-[#F4F0E7] tracking-tight flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#7A9E7E]" />
              Active Examinations Ready for Students
            </h2>
            <p className="text-[13px] text-[#AAA69B]">
              Share the examination code or WhatsApp invitation with your students.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {liveTests.map((test) => (
              <div
                key={test.id}
                className="bg-[#191916] border border-[rgba(244,240,231,0.1)] rounded-[16px] p-5 space-y-4 shadow-sm hover:border-[rgba(244,240,231,0.18)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-[#7A9E7E]/10 text-[#7A9E7E] border border-[#7A9E7E]/20">
                      {test.subject}
                    </span>
                    <h3 className="text-[16px] font-bold text-[#F4F0E7] tracking-tight">{test.title}</h3>
                    <p className="text-[12px] text-[#AAA69B]">Class: {test.className}</p>
                  </div>
                  <TestStatusBadge status={test.status} />
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-[#AAA69B] py-2 border-y border-[rgba(244,240,231,0.06)]">
                  <span>{test._count?.questions ?? 0} questions</span>
                  <span>·</span>
                  <span>{formatDuration(test.durationSeconds)}</span>
                  <span>·</span>
                  <span className="text-[#F4F0E7] font-semibold">{test._count?.attempts ?? 0} submissions</span>
                </div>

                <TestCardActionButtons
                  test={{
                    ...test,
                    teacherId: "",
                    description: null,
                    startAt: null,
                    endAt: null,
                    maxAttempts: 1,
                    settings: {},
                    publishedAt: null,
                    closedAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    status: test.status as "PUBLISHED",
                    _count: {
                      attempts: test._count?.attempts ?? 0,
                      questions: test._count?.questions ?? 0,
                    },
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Examinations / Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#F4F0E7] tracking-tight">Recent Examinations</h2>
          {tests.length > 0 && (
            <Link href="/tests" className="text-xs text-[#E4572E] hover:text-[#F06A43] font-medium transition-colors">
              View all examinations →
            </Link>
          )}
        </div>

        {tests.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[rgba(244,240,231,0.08)] rounded-[16px] bg-[#191916]/40 p-8 space-y-5">
            <div className="w-12 h-12 rounded-[12px] bg-[#E4572E]/10 text-[#E4572E] flex items-center justify-center text-xl mx-auto border border-[#E4572E]/20">
              ▤
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-[16px] font-semibold text-[#F4F0E7]">No examinations created yet</h3>
              <p className="text-[13px] text-[#AAA69B]">
                Create your first examination to configure questions, set time limits, and distribute proctoring access to your students.
              </p>
            </div>
            <Link href="/tests/create">
              <Button variant="primary" size="md" className="px-5">
                + Create your first examination
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <div className="rounded-[14px] border border-[rgba(244,240,231,0.08)] overflow-hidden bg-[#191916]">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-[rgba(244,240,231,0.06)] bg-[#141412]">
                      <th className="text-left px-5 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Examination</th>
                      <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Status</th>
                      <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Code</th>
                      <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Questions</th>
                      <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Duration</th>
                      <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Submissions</th>
                      <th className="px-5 py-3 text-right text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((test, idx) => (
                      <tr
                        key={test.id}
                        className={[
                          "border-b border-[rgba(244,240,231,0.04)] transition-colors hover:bg-[#22211C]/40",
                          idx === tests.length - 1 ? "border-0" : "",
                        ].join(" ")}
                      >
                        <td className="px-5 py-4">
                          <Link href={`/tests/${test.id}`} className="hover:underline">
                            <div className="font-medium text-[#F4F0E7] truncate max-w-[220px]">{test.title}</div>
                            <div className="text-[12px] text-[#AAA69B] mt-0.5">{test.subject} · {test.className}</div>
                          </Link>
                        </td>
                        <td className="px-4 py-4"><TestStatusBadge status={test.status} /></td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-xs font-semibold text-[#E4572E] bg-[#E4572E]/10 px-2 py-1 rounded-[6px] border border-[#E4572E]/20">
                            {test.testCode}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-[#F4F0E7]">{test._count?.questions ?? 0}</td>
                        <td className="px-4 py-4 font-mono text-[#AAA69B] text-[13px]">{formatDuration(test.durationSeconds)}</td>
                        <td className="px-4 py-4 font-mono text-[#F4F0E7]">{test._count?.attempts ?? 0}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end">
                            <TestListActions
                              test={test}
                              onDeleted={handleDeleted}
                              onArchived={handleArchived}
                              onClosed={handleClosed}
                              onRestored={handleRestored}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="lg:hidden space-y-3">
              {tests.map((test) => (
                <div
                  key={test.id}
                  className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/tests/${test.id}`}>
                        <div className="font-semibold text-[15px] text-[#F4F0E7] leading-snug hover:underline">
                          {test.title}
                        </div>
                      </Link>
                      <div className="text-[13px] text-[#AAA69B] mt-0.5">{test.subject} · {test.className}</div>
                    </div>
                    <TestStatusBadge status={test.status} />
                  </div>

                  <div className="flex flex-wrap gap-3 text-[13px] text-[#AAA69B]">
                    <span>{test._count?.questions ?? 0} questions</span>
                    <span>·</span>
                    <span>{formatDuration(test.durationSeconds)}</span>
                    <span>·</span>
                    <span>{test._count?.attempts ?? 0} submissions</span>
                  </div>

                  {test.status === "PUBLISHED" && (
                    <div className="text-[15px] font-mono font-bold text-[#E4572E]">{test.testCode}</div>
                  )}

                  <div className="pt-2 border-t border-[rgba(244,240,231,0.05)]">
                    <TestListActions
                      test={test}
                      compact
                      onDeleted={handleDeleted}
                      onArchived={handleArchived}
                      onClosed={handleClosed}
                      onRestored={handleRestored}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Quick Orientation / Operational Guide */}
      <section className="bg-[#191916]/60 border border-[rgba(244,240,231,0.06)] rounded-[16px] p-6 space-y-4">
        <h3 className="text-[14px] font-bold text-[#F4F0E7] uppercase font-mono tracking-wider">
          ProctorED Operational Workflow
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#AAA69B]">
          <div className="border-l-2 border-[#E4572E] pl-3 py-1 space-y-1">
            <span className="font-mono font-bold text-[#F4F0E7]">Step 1 · Build & Publish</span>
            <p>Configure test parameters, questions, marks, and proctoring rules. Publish when ready.</p>
          </div>
          <div className="border-l-2 border-[#7A9E7E] pl-3 py-1 space-y-1">
            <span className="font-mono font-bold text-[#F4F0E7]">Step 2 · Distribute Code</span>
            <p>Share the 6-character code or instant WhatsApp link directly with students.</p>
          </div>
          <div className="border-l-2 border-[#C49A5A] pl-3 py-1 space-y-1">
            <span className="font-mono font-bold text-[#F4F0E7]">Step 3 · Monitor & Grade</span>
            <p>Live signals track tab switching and camera state. Results and integrity logs are captured instantly.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
