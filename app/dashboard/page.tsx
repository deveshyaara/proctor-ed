import { requireTeacher } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import { Header } from "@/components/teacher/Header";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { DashboardClientView } from "@/components/teacher/DashboardClientView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireTeacher();
  const teacherId = session.user.id;

  const [tests, totalTests, activeTests, draftTests, totalAttempts] = await Promise.all([
    prisma.test.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { attempts: true, questions: true } } },
      take: 10,
    }),
    prisma.test.count({ where: { teacherId } }),
    prisma.test.count({ where: { teacherId, status: "PUBLISHED" } }),
    prisma.test.count({ where: { teacherId, status: "DRAFT" } }),
    prisma.attempt.count({ where: { test: { teacherId } } }),
  ]);

  const liveTests = tests.filter((t) => t.status === "PUBLISHED");

  return (
    <div className="flex min-h-full flex-col bg-[#11110F]">
      <Header
        title="Overview"
        subtitle={`Welcome back, ${session.user.name || "Teacher"}`}
        action={
          <Link href="/tests/create">
            <Button
              variant="primary"
              size="md"
              className="h-[40px] px-4 font-medium"
              leftIcon={
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              }
            >
              Create examination
            </Button>
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
        <DashboardClientView
          initialTests={tests}
          initialLiveTests={liveTests}
          initialKpis={{
            totalTests,
            activeTests,
            draftTests,
            totalAttempts,
          }}
        />
      </main>
    </div>
  );
}
