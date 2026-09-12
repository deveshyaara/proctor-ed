import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/tests/[id]/route";
import { POST as ARCHIVE_POST } from "@/app/api/tests/[id]/archive/route";
import { POST as RESTORE_POST } from "@/app/api/tests/[id]/restore/route";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/helpers", () => ({
  requireTeacherApi: vi.fn(),
}));

import { requireTeacherApi } from "@/lib/auth/helpers";

describe("Examination Deletion & Archival Integration", () => {
  const teacherId = "teacher-cuid-1";
  const otherTeacherId = "teacher-cuid-2";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireTeacherApi).mockResolvedValue({
      user: { id: teacherId, name: "Teacher One", email: "teacher1@school.edu", role: "TEACHER" },
      session: {} as never,
    });
  });

  describe("DELETE /api/tests/[id]", () => {
    it("rejects deletion if the requesting teacher does not own the test (403)", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-other",
        teacherId: otherTeacherId,
        testCode: "OTH101",
        title: "Other Teacher Exam",
        status: "DRAFT",
        _count: { attempts: 0, questions: 0 },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/tests/test-other", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "test-other" }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("rejects deletion if the test is currently PUBLISHED / live (409)", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-live",
        teacherId,
        testCode: "LIV101",
        title: "Live Exam",
        status: "PUBLISHED",
        _count: { attempts: 0, questions: 5 },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/tests/test-live", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "test-live" }) });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe("TEST_IS_LIVE");
    });

    it("successfully deletes a draft examination with 0 submissions without requiring confirmation code", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-draft-0",
        teacherId,
        testCode: "DRF100",
        title: "Empty Draft Exam",
        status: "DRAFT",
        subject: "Mathematics",
        className: "Grade 10",
        _count: { attempts: 0, questions: 3 },
      } as never);

      vi.spyOn(prisma.attempt, "count").mockResolvedValue(0);

      const txCalls: string[] = [];
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          answer: {
            deleteMany: vi.fn().mockImplementation(() => {
              txCalls.push("answer.deleteMany");
              return Promise.resolve({ count: 0 });
            }),
          },
          proctoringEvent: {
            deleteMany: vi.fn().mockImplementation(() => {
              txCalls.push("proctoringEvent.deleteMany");
              return Promise.resolve({ count: 0 });
            }),
          },
          attempt: {
            deleteMany: vi.fn().mockImplementation(() => {
              txCalls.push("attempt.deleteMany");
              return Promise.resolve({ count: 0 });
            }),
          },
          question: {
            deleteMany: vi.fn().mockImplementation(() => {
              txCalls.push("question.deleteMany");
              return Promise.resolve({ count: 3 });
            }),
          },
          auditLog: {
            create: vi.fn().mockImplementation((args) => {
              txCalls.push("auditLog.create");
              expect(args.data.action).toBe("TEST_DELETED");
              expect(args.data.actorId).toBe(teacherId);
              expect(args.data.details.submissionCount).toBe(0);
              return Promise.resolve({ id: "audit-1" });
            }),
          },
          test: {
            delete: vi.fn().mockImplementation(() => {
              txCalls.push("test.delete");
              return Promise.resolve({ id: "test-draft-0" });
            }),
          },
        };
        return callback(txMock as never);
      });

      const req = new NextRequest("http://localhost:3000/api/tests/test-draft-0", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "test-draft-0" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.testId).toBe("test-draft-0");
      expect(txCalls).toEqual([
        "answer.deleteMany",
        "proctoringEvent.deleteMany",
        "attempt.deleteMany",
        "question.deleteMany",
        "auditLog.create",
        "test.delete",
      ]);
    });

    it("rejects deletion when 1+ submissions exist without valid confirmation code (422)", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-with-subs",
        teacherId,
        testCode: "SUB200",
        title: "Test with Submissions",
        status: "CLOSED",
        _count: { attempts: 4, questions: 10 },
      } as never);

      vi.spyOn(prisma.attempt, "count").mockResolvedValue(4);

      // 1. Without body
      const reqNoBody = new NextRequest("http://localhost:3000/api/tests/test-with-subs", {
        method: "DELETE",
      });
      const resNoBody = await DELETE(reqNoBody, { params: Promise.resolve({ id: "test-with-subs" }) });
      const dataNoBody = await resNoBody.json();
      expect(resNoBody.status).toBe(422);
      expect(dataNoBody.error.code).toBe("CONFIRMATION_REQUIRED");

      // 2. With mismatched code
      const reqWrongCode = new NextRequest("http://localhost:3000/api/tests/test-with-subs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationCode: "WRONG" }),
      });
      const resWrongCode = await DELETE(reqWrongCode, { params: Promise.resolve({ id: "test-with-subs" }) });
      const dataWrongCode = await resWrongCode.json();
      expect(resWrongCode.status).toBe(422);
      expect(dataWrongCode.error.code).toBe("CONFIRMATION_REQUIRED");
    });

    it("allows deletion with 1+ submissions when exact confirmation code matches", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-with-subs",
        teacherId,
        testCode: "SUB200",
        title: "Test with Submissions",
        status: "CLOSED",
        subject: "Physics",
        className: "Class 12",
        _count: { attempts: 4, questions: 10 },
      } as never);

      vi.spyOn(prisma.attempt, "count").mockResolvedValue(4);

      let auditCreated = false;
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          answer: { deleteMany: vi.fn().mockResolvedValue({ count: 40 }) },
          proctoringEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 12 }) },
          attempt: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
          question: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
          auditLog: {
            create: vi.fn().mockImplementation((args) => {
              auditCreated = true;
              expect(args.data.details.testCode).toBe("SUB200");
              expect(args.data.details.submissionCount).toBe(4);
              return Promise.resolve({ id: "audit-2" });
            }),
          },
          test: { delete: vi.fn().mockResolvedValue({ id: "test-with-subs" }) },
        };
        return callback(txMock as never);
      });

      const req = new NextRequest("http://localhost:3000/api/tests/test-with-subs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationCode: "sub200" }), // case insensitive test
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "test-with-subs" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(auditCreated).toBe(true);
    });
  });

  describe("Archive and Restore Lifecycle", () => {
    it("archives a test and creates audit log", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-to-archive",
        teacherId,
        testCode: "ARC300",
        title: "Exam to Archive",
        status: "CLOSED",
        _count: { attempts: 2, questions: 5 },
      } as never);

      vi.spyOn(prisma.attempt, "count").mockResolvedValue(0); // 0 in progress

      let auditAction: string | null = null;
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          test: {
            update: vi.fn().mockResolvedValue({
              id: "test-to-archive",
              status: "ARCHIVED",
            }),
          },
          auditLog: {
            create: vi.fn().mockImplementation((args) => {
              auditAction = args.data.action;
              return Promise.resolve({ id: "audit-arc" });
            }),
          },
        };
        return callback(txMock as never);
      });

      const req = new NextRequest("http://localhost:3000/api/tests/test-to-archive/archive", {
        method: "POST",
      });

      const res = await ARCHIVE_POST(req, { params: Promise.resolve({ id: "test-to-archive" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.archived).toBe(true);
      expect(auditAction).toBe("TEST_ARCHIVED");
    });

    it("restores an archived test to CLOSED if attempts exist, or DRAFT if 0 attempts", async () => {
      // With attempts -> restores to CLOSED
      vi.spyOn(prisma.test, "findUnique").mockResolvedValue({
        id: "test-to-restore",
        teacherId,
        testCode: "RES400",
        title: "Exam to Restore",
        status: "ARCHIVED",
        _count: { attempts: 3 },
      } as never);

      let targetStatus: string | null = null;
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          test: {
            update: vi.fn().mockImplementation((args) => {
              targetStatus = args.data.status;
              return Promise.resolve({
                id: "test-to-restore",
                status: targetStatus,
              });
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: "audit-res" }),
          },
        };
        return callback(txMock as never);
      });

      const req = new NextRequest("http://localhost:3000/api/tests/test-to-restore/restore", {
        method: "POST",
      });

      const res = await RESTORE_POST(req, { params: Promise.resolve({ id: "test-to-restore" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.restored).toBe(true);
      expect(targetStatus).toBe("CLOSED");
    });
  });
});
