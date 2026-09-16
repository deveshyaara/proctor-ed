import { executeAttemptSubmission } from "../lib/exam/submission";
import { prisma } from "../lib/db/client";

/**
 * One-off repair script: re-triggers submission for a stuck attempt.
 * Usage:  npx tsx scripts/submit-verified-attempt.ts [attemptId]
 * Default: repairs the known stuck attempt cmu3we9zv0017l104yqde7a28
 *
 * Safe to run multiple times — executeAttemptSubmission is idempotent.
 * Requires DATABASE_URL to be the DIRECT (non-pooled) Neon connection string.
 */

async function main() {
  const attemptId = process.argv[2] ?? "cmu3we9zv0017l104yqde7a28";

  console.log(`\n=== Attempt Repair Script ===`);
  console.log(`Targeting attempt: ${attemptId}\n`);

  // 1. Verify the attempt exists and check its pre-repair state
  const before = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentName: true, rollNumber: true, status: true, score: true, maxScore: true, submittedAt: true },
  });

  if (!before) {
    console.error(`ERROR: Attempt ${attemptId} not found in database.`);
    process.exit(1);
  }

  console.log("PRE-REPAIR STATE:");
  console.log(JSON.stringify(before, null, 2));

  // 2. Verify answers are present (they should be — per-question sync is separate from submit)
  const answersBefore = await prisma.answer.findMany({
    where: { attemptId },
    select: { questionId: true, answer: true, isCorrect: true, marksAwarded: true },
  });

  console.log(`\nAnswers in DB: ${answersBefore.length}`);
  if (answersBefore.length === 0) {
    console.warn("WARNING: No answer rows found. The student may not have answered any questions.");
  } else {
    const answered = answersBefore.filter(a => a.answer !== null).length;
    console.log(`  ${answered} answered, ${answersBefore.length - answered} unanswered`);
  }

  if (before.status !== "IN_PROGRESS" && before.status !== "CREATED") {
    console.log(`\nAttempt is already in terminal state (${before.status}) — running idempotently.`);
  }

  // 3. Execute submission
  console.log("\nRunning executeAttemptSubmission...");
  const result = await executeAttemptSubmission(attemptId, "SUBMITTED");

  console.log("\nSUBMISSION RESULT:");
  console.log(JSON.stringify(result, null, 2));

  // 4. Verify final state in DB
  const after = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentName: true, rollNumber: true, status: true, score: true, maxScore: true, submittedAt: true },
  });

  console.log("\nPOST-REPAIR STATE:");
  console.log(JSON.stringify(after, null, 2));

  const answersAfter = await prisma.answer.findMany({
    where: { attemptId },
    include: { question: { select: { order: true, type: true } } },
    orderBy: { question: { order: "asc" } },
  });

  console.log(`\nAnswer scoring results (${answersAfter.length} rows):`);
  for (const a of answersAfter) {
    const q = a.question;
    console.log(`  Q${q.order} (${q.type}) | answer="${a.answer}" | correct=${a.isCorrect} | marks=${a.marksAwarded}`);
  }

  if (after?.status === "SUBMITTED" || after?.status === "AUTO_SUBMITTED") {
    console.log(`\n✓ REPAIR SUCCESSFUL — attempt is now ${after.status}, score=${after.score}/${after.maxScore}`);
  } else {
    console.error(`\n✗ REPAIR FAILED — attempt status is still ${after?.status}`);
    process.exit(1);
  }
}

main().finally(() => prisma.$disconnect());
