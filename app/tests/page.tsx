import { requireTeacher } from "@/lib/auth/helpers";

export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db/client";
import { Header } from "@/components/teacher/Header";
import Link from "next/link";
import { TestsListView } from "@/components/teacher/TestsListView";

const STATUS_FILTERS = ["ALL", "DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

async function getTests(teacherId: string, status: StatusFilter) {
  const where: Record<string, unknown> = { teacherId };
  if (status !== "ALL") where.status = status;
  return prisma.test.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { attempts: true, questions: true } } },
    take: 50,
  });
}

export default async function TestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireTeacher();
  const { status: rawStatus } = await searchParams;
  const status = (STATUS_FILTERS.includes(rawStatus as StatusFilter) ? rawStatus : "ALL") as StatusFilter;
  const tests = await getTests(session.user.id, status);

  return (
    <div className="flex flex-col min-h-screen bg-[#11110F]">
      <Header
        title="Examinations"
        subtitle="Create, manage, and monitor your proctored examinations"
        action={
          <Link href="/tests/create">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#E4572E] hover:bg-[#F06A43] text-[#F4F0E7] text-[14px] font-medium rounded-[10px] transition-colors cursor-pointer">
              + Create examination
            </span>
          </Link>
        }
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f}
              href={`/tests?status=${f}`}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap",
                status === f
                  ? "bg-[#E4572E]/12 text-[#E4572E] border border-[#E4572E]/25"
                  : "text-[#AAA69B] hover:text-[#F4F0E7] hover:bg-[#191916] border border-transparent",
              ].join(" ")}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </Link>
          ))}
        </div>

        {/* Client Interactive Tests View with Optimistic Updates */}
        <TestsListView initialTests={tests} statusFilter={status} />
      </main>
    </div>
  );
}

