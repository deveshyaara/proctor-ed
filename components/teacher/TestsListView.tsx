"use client";

import { useState } from "react";
import Link from "next/link";
import { TestStatusBadge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/utils/format";
import { TestListActions, ActionTestItem } from "@/app/tests/TestListActions";

interface TestsListViewProps {
  initialTests: ActionTestItem[];
  statusFilter: string;
}

export function TestsListView({ initialTests, statusFilter }: TestsListViewProps) {
  const [tests, setTests] = useState<ActionTestItem[]>(initialTests);

  const [prevInitialTests, setPrevInitialTests] = useState<ActionTestItem[]>(initialTests);

  if (prevInitialTests !== initialTests) {
    setPrevInitialTests(initialTests);
    setTests(initialTests);
  }

  const handleDeleted = (testId: string) => {
    setTests((prev) => prev.filter((t) => t.id !== testId));
  };

  const handleArchived = (testId: string) => {
    if (statusFilter !== "ARCHIVED" && statusFilter !== "ALL") {
      setTests((prev) => prev.filter((t) => t.id !== testId));
    } else {
      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, status: "ARCHIVED" } : t))
      );
    }
  };

  const handleRestored = (testId: string) => {
    if (statusFilter === "ARCHIVED") {
      setTests((prev) => prev.filter((t) => t.id !== testId));
    } else {
      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, status: "CLOSED" } : t))
      );
    }
  };

  const handleClosed = (testId: string) => {
    setTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, status: "CLOSED" } : t))
    );
  };

  if (tests.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-[rgba(244,240,231,0.08)] rounded-[16px] bg-[#191916]/30">
        <div className="text-[16px] font-semibold text-[#F4F0E7] mb-2">
          {statusFilter === "ALL"
            ? "No examinations yet."
            : `No ${statusFilter.toLowerCase()} examinations.`}
        </div>
        <p className="text-[14px] text-[#AAA69B] mb-6 max-w-sm mx-auto">
          {statusFilter === "ALL"
            ? "Create your first examination and share the code with your students."
            : "Change the filter to see other examinations."}
        </p>
        {statusFilter === "ALL" && (
          <Link href="/tests/create">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E4572E] hover:bg-[#F06A43] text-[#F4F0E7] text-[14px] font-medium rounded-[10px] transition-colors cursor-pointer shadow-sm">
              + Create examination
            </span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="rounded-[14px] border border-[rgba(244,240,231,0.08)] overflow-hidden bg-[#191916]">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-[#141412] border-b border-[rgba(244,240,231,0.06)]">
                <th className="text-left px-5 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Title</th>
                <th className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-[#AAA69B]">Status</th>
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
                      <div className="font-medium text-[#F4F0E7] truncate max-w-[240px]">{test.title}</div>
                    </Link>
                    {test.status === "PUBLISHED" && (
                      <div className="text-[11px] font-mono text-[#E4572E] mt-0.5">{test.testCode}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <TestStatusBadge status={test.status} />
                  </td>
                  <td className="px-4 py-4 font-mono text-[#F4F0E7]">{test._count?.questions ?? 0}</td>
                  <td className="px-4 py-4 font-mono text-[#AAA69B] text-[13px]">
                    {"durationSeconds" in test && typeof test.durationSeconds === "number"
                      ? formatDuration(test.durationSeconds)
                      : "—"}
                  </td>
                  <td className="px-4 py-4 font-mono text-[#F4F0E7]">{test._count?.attempts ?? 0}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end">
                      <TestListActions
                        test={test}
                        onDeleted={handleDeleted}
                        onArchived={handleArchived}
                        onRestored={handleRestored}
                        onClosed={handleClosed}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile + Tablet Card View */}
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
              </div>
              <TestStatusBadge status={test.status} />
            </div>

            <div className="flex flex-wrap gap-3 text-[13px] text-[#AAA69B]">
              <span>{test._count?.questions ?? 0} questions</span>
              <span>·</span>
              <span>
                {"durationSeconds" in test && typeof test.durationSeconds === "number"
                  ? formatDuration(test.durationSeconds)
                  : "—"}
              </span>
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
                onRestored={handleRestored}
                onClosed={handleClosed}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
