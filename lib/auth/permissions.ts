import { prisma } from "@/lib/db/client";

/**
 * Verifies that a test belongs to the given teacher.
 * Throws if not found or unauthorized.
 */
export async function assertTestOwnership(
  testId: string,
  teacherId: string
): Promise<void> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: { teacherId: true },
  });

  if (!test || test.teacherId !== teacherId) {
    throw new PermissionError("You do not have access to this test.");
  }
}

/**
 * Verifies that an attempt belongs to the given test.
 */
export async function assertAttemptBelongsToTest(
  attemptId: string,
  testId: string
): Promise<void> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { testId: true },
  });

  if (!attempt || attempt.testId !== testId) {
    throw new PermissionError("Attempt does not belong to this test.");
  }
}

/**
 * Custom permission error — can be caught by API routes to return 403.
 */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
