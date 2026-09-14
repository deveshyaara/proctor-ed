import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/tests/[id]/results/route";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/helpers", () => ({
  requireTeacherApi: vi.fn(),
}));

import { requireTeacherApi } from "@/lib/auth/helpers";

describe("GET /api/tests/[id]/results - GAP-5 Regression Test", () => {
  const teacherId = "teacher-101";
  const testId = "test-history-202";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireTeacherApi).mockResolvedValue({
      user: {
        id: teacherId,
        name: "Professor Higgins",
        email: "higgins@academy.edu",
        role: "TEACHER",
      },
      session: {} as never,
    });
  });

  it("reports totalAttempts as true total count (>50) and preserves 50-item page pagination", async () => {
    const totalAttemptCount = 75;
    const pageSizeLimit = 50;

    // Mock test owner check
    vi.spyOn(prisma.test, "findFirst").mockResolvedValue({
      id: testId,
      teacherId,
      title: "World History Midterm",
      subject: "History",
      className: "Grade 10",
      durationSeconds: 3600,
    } as never);

    // Build 75 full attempt objects
    const all75Attempts = Array.from({ length: totalAttemptCount }, (_, i) => ({
      id: `att-${i + 1}`,
      studentName: `Student ${i + 1}`,
      rollNumber: `ROLL-${1000 + i}`,
      status: "SUBMITTED" as const,
      score: 50 + (i % 50),
      maxScore: 100,
      riskScore: 0,
      warningCount: 0,
      startedAt: new Date("2026-09-14T10:00:00Z"),
      submittedAt: new Date("2026-09-14T11:00:00Z"),
      _count: { proctoringEvents: 0 },
    }));

    // prisma.attempt.findMany is called twice:
    // 1. Paginated query (take: 51)
    // 2. Summary stats query (select: id, score, status)
    vi.spyOn(prisma.attempt, "findMany").mockImplementation((async (args: any) => {
      if (args?.take === pageSizeLimit + 1) {
        // Return 51 items to represent hasMore
        return all75Attempts.slice(0, pageSizeLimit + 1);
      }
      if (args?.select?.score !== undefined) {
        // Return all 75 items for summary calculation
        return all75Attempts.map((a) => ({ id: a.id, score: a.score, status: a.status }));
      }
      return [];
    }) as never);

    const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/results`);
    const res = await GET(req, { params: Promise.resolve({ id: testId }) });
    const data = await res.json();

    expect(res.status).toBe(200);

    // GAP-5 Regression assertion:
    // summary.totalAttempts MUST reflect the true count (75), NOT the page size (50)
    expect(data.summary.totalAttempts).toBe(75);
    expect(data.summary.totalAttempts).not.toBe(50);

    // Verify pagination behavior is preserved:
    // items returned in attempts array must be capped to pageSizeLimit (50)
    expect(data.attempts).toHaveLength(50);
    expect(data.attempts[0].id).toBe("att-1");
    expect(data.attempts[49].id).toBe("att-50");

    // nextCursor must point to the 50th item
    expect(data.nextCursor).toBe("att-50");
  });

  it("handles test with <= 50 attempts correctly without nextCursor", async () => {
    const totalAttemptCount = 20;

    vi.spyOn(prisma.test, "findFirst").mockResolvedValue({
      id: testId,
      teacherId,
      title: "World History Midterm",
      subject: "History",
      className: "Grade 10",
      durationSeconds: 3600,
    } as never);

    const all20Attempts = Array.from({ length: totalAttemptCount }, (_, i) => ({
      id: `att-${i + 1}`,
      studentName: `Student ${i + 1}`,
      rollNumber: `ROLL-${1000 + i}`,
      status: "SUBMITTED" as const,
      score: 80,
      maxScore: 100,
      riskScore: 0,
      warningCount: 0,
      startedAt: new Date("2026-09-14T10:00:00Z"),
      submittedAt: new Date("2026-09-14T11:00:00Z"),
      _count: { proctoringEvents: 0 },
    }));

    vi.spyOn(prisma.attempt, "findMany").mockImplementation((async (args: any) => {
      if (args?.take) {
        return all20Attempts;
      }
      if (args?.select?.score !== undefined) {
        return all20Attempts.map((a) => ({ id: a.id, score: a.score, status: a.status }));
      }
      return [];
    }) as never);

    const req = new NextRequest(`http://localhost:3000/api/tests/${testId}/results`);
    const res = await GET(req, { params: Promise.resolve({ id: testId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary.totalAttempts).toBe(20);
    expect(data.attempts).toHaveLength(20);
    expect(data.nextCursor).toBeNull();
  });
});
