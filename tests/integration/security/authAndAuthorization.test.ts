import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireTeacherApi, getSession, findOrReconcileUser } from "@/lib/auth/helpers";
import { requireAttemptOwnership, hashToken, generateAttemptToken } from "@/lib/exam/attemptAuth";
import { assertTestOwnership, PermissionError } from "@/lib/auth/permissions";
import { toStudentQuestions } from "@/lib/exam/questions";
import { scoreAttempt } from "@/lib/exam/scoring";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: vi.fn(),
  },
}));

import { auth } from "@/lib/auth/server";

describe("Security & Authorization Integration (Neon Auth)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Teacher API Authentication & Authorization (RBAC)", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({ data: null } as never);

      await expect(requireTeacherApi()).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    });

    it("rejects unknown Neon Auth user without ProctorED identity with 403 FORBIDDEN", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({
        data: {
          user: { id: "neon-stranger-1", email: "stranger@unknown.com", name: "Stranger" },
          session: { id: "sess-1", userId: "neon-stranger-1" },
        },
      } as never);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      await expect(requireTeacherApi()).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("rejects non-teacher roles (e.g. STUDENT) with 403 FORBIDDEN", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({
        data: {
          user: { id: "neon-student-1", email: "student@school.edu", name: "Student User" },
          session: { id: "sess-2", userId: "neon-student-1" },
        },
      } as never);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "proctor-student-cuid",
        name: "Student User",
        email: "student@school.edu",
        passwordHash: null,
        neonAuthUserId: "neon-student-1",
        role: "STUDENT" as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(requireTeacherApi()).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("allows TEACHER role and maps Neon Auth identity to ProctorED User ID", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({
        data: {
          user: { id: "neon-teacher-1", email: "teacher@school.edu", name: "Prof. Smith" },
          session: { id: "sess-3", userId: "neon-teacher-1" },
        },
      } as never);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "proctor-teacher-cuid",
        name: "Prof. Smith",
        email: "teacher@school.edu",
        passwordHash: null,
        neonAuthUserId: "neon-teacher-1",
        role: "TEACHER",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const session = await requireTeacherApi();
      expect(session.user.id).toBe("proctor-teacher-cuid");
      expect(session.user.neonAuthUserId).toBe("neon-teacher-1");
      expect(session.user.role).toBe("TEACHER");
      expect(session.user.email).toBe("teacher@school.edu");
    });

    it("allows ADMIN role where intended", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({
        data: {
          user: { id: "neon-admin-1", email: "admin@school.edu", name: "Principal Jones" },
          session: { id: "sess-4", userId: "neon-admin-1" },
        },
      } as never);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "proctor-admin-cuid",
        name: "Principal Jones",
        email: "admin@school.edu",
        passwordHash: null,
        neonAuthUserId: "neon-admin-1",
        role: "ADMIN",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const session = await requireTeacherApi();
      expect(session.user.id).toBe("proctor-admin-cuid");
      expect(session.user.role).toBe("ADMIN");
    });
  });

  describe("Identity Reconciliation & Linking", () => {
    it("rejects a first-time Neon identity that only matches a teacher by email", async () => {
      const neonUser = {
        id: "neon-id-999",
        email: "teacher@proctor-ed.dev",
        name: "Demo Teacher",
      };

      // 1st lookup by neonAuthUserId: null
      const findUniqueSpy = vi.spyOn(prisma.user, "findUnique")
        .mockResolvedValueOnce(null) // by neonAuthUserId
        .mockResolvedValueOnce({     // by email
          id: "existing-cuid-1",
          name: "Demo Teacher",
          email: "teacher@proctor-ed.dev",
          passwordHash: null,
          neonAuthUserId: null,
          role: "TEACHER",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const updateSpy = vi.spyOn(prisma.user, "update");

      const user = await findOrReconcileUser(neonUser);
      expect(user).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(findUniqueSpy).toHaveBeenCalledTimes(2);
    });

    it("never reassigns an already linked teacher identity based on email", async () => {
      vi.spyOn(prisma.user, "findUnique")
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "existing-cuid-1",
          name: "Demo Teacher",
          email: "teacher@proctor-ed.dev",
          passwordHash: null,
          neonAuthUserId: "neon-original",
          role: "TEACHER",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      const updateSpy = vi.spyOn(prisma.user, "update");

      const user = await findOrReconcileUser({
        id: "neon-replacement",
        email: "teacher@proctor-ed.dev",
      });

      expect(user).toBeNull();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("repeat login finds existing user directly by neonAuthUserId without updating", async () => {
      const neonUser = {
        id: "neon-id-999",
        email: "teacher@proctor-ed.dev",
      };

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "existing-cuid-1",
        name: "Demo Teacher",
        email: "teacher@proctor-ed.dev",
        passwordHash: null,
        neonAuthUserId: "neon-id-999",
        role: "TEACHER",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updateSpy = vi.spyOn(prisma.user, "update");

      const user = await findOrReconcileUser(neonUser);
      expect(user?.id).toBe("existing-cuid-1");
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("getSession() returns null when unauthenticated", async () => {
      vi.mocked(auth.getSession).mockResolvedValueOnce({ data: null } as never);
      const session = await getSession();
      expect(session).toBeNull();
    });
  });

  describe("Teacher Resource Ownership & IDOR Protection", () => {
    it("allows teacher to access their own test", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValueOnce({
        teacherId: "teacher-cuid-1",
      } as never);

      await expect(assertTestOwnership("test-1", "teacher-cuid-1")).resolves.toBeUndefined();
    });

    it("blocks teacher from accessing another teacher's test with PermissionError", async () => {
      vi.spyOn(prisma.test, "findUnique").mockResolvedValueOnce({
        teacherId: "teacher-cuid-other",
      } as never);

      await expect(assertTestOwnership("test-1", "teacher-cuid-1")).rejects.toThrow(PermissionError);
    });
  });

  describe("Student Attempt Isolation (IDOR Protection)", () => {
    it("rejects attempt access without token (401 UNAUTHORIZED)", async () => {
      await expect(requireAttemptOwnership("att-1", undefined)).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
    });

    it("rejects attempt access with wrong or cross-student token (403 FORBIDDEN)", async () => {
      const wrongToken = generateAttemptToken();
      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValueOnce(null);

      await expect(requireAttemptOwnership("att-1", wrongToken)).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    });

    it("rejects mutation on terminal attempts (409 ATTEMPT_ALREADY_SUBMITTED)", async () => {
      const rawToken = generateAttemptToken();
      const tokenHash = hashToken(rawToken);

      vi.spyOn(prisma.attempt, "findFirst").mockResolvedValueOnce({
        id: "att-1",
        testId: "test-1",
        studentName: "Student A",
        rollNumber: "ROLL01",
        accessTokenHash: tokenHash,
        status: "SUBMITTED",
        startedAt: new Date(),
        expiresAt: new Date(),
        submittedAt: new Date(),
        lastHeartbeatAt: null,
        score: 10,
        maxScore: 10,
        riskScore: 0,
        warningCount: 0,
        questionOrder: null,
        optionOrderMap: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(requireAttemptOwnership("att-1", rawToken, "IN_PROGRESS")).rejects.toMatchObject({
        status: 409,
        code: "ATTEMPT_ALREADY_SUBMITTED",
      });
    });
  });

  describe("Answer Key Protection (Data Isolation)", () => {
    it("strips correctAnswer and explanation from student payload", () => {
      const questions = [
        {
          id: "q-1",
          testId: "t-1",
          type: "MCQ" as const,
          questionText: "What is 2+2?",
          options: ["1", "2", "3", "4"],
          correctAnswer: "3",
          explanation: "Basic arithmetic 2+2=4",
          marks: 2,
          negativeMarks: 0.5,
          order: 1,
          imageUrl: null,
          imageKey: "s3-private-key-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const studentPayload = toStudentQuestions(questions);
      const q = studentPayload[0];

      expect(q).not.toHaveProperty("correctAnswer");
      expect(q).not.toHaveProperty("explanation");
      expect(q).not.toHaveProperty("imageKey");
      expect(q.id).toBe("q-1");
      expect(q.questionText).toBe("What is 2+2?");
      expect(q.marks).toBe(2);
      expect(q.negativeMarks).toBe(0.5);
    });
  });

  describe("Server-Side Score Authority", () => {
    it("calculates score strictly using server-side canonical data", () => {
      const questions = [
        {
          id: "q-1",
          type: "MCQ" as const,
          correctAnswer: "1",
          marks: 4,
          negativeMarks: 1,
          options: ["Alpha", "Beta", "Gamma"],
        },
      ];

      const optionOrderMap = {
        "q-1": [1, 2, 0],
      };

      const result = scoreAttempt(
        questions,
        [{ questionId: "q-1", answer: "0" }],
        optionOrderMap
      );

      expect(result.score).toBe(4);
      expect(result.answers[0].isCorrect).toBe(true);
      expect(result.answers[0].marksAwarded).toBe(4);
    });
  });
});
