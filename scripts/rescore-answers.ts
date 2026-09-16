/**
 * Targeted fix: re-score answer rows that still have isCorrect=null after the
 * repair script's first run (6 rows for attempt cmu3we9zv0017l104yqde7a28).
 * This is a one-off; the answers and scoring are already computed — this just
 * writes the results that the network blip prevented.
 */
import { prisma } from "../lib/db/client";
import { scoreAttempt } from "../lib/exam/scoring";

async function main() {
  const attemptId = process.argv[2] ?? "cmu3we9zv0017l104yqde7a28";

  console.log(`Re-scoring answer rows for attempt ${attemptId}...\n`);

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { testId: true, optionOrderMap: true, status: true },
  });

  if (!attempt) { console.error("Not found"); process.exit(1); }

  const [questions, answers] = await Promise.all([
    prisma.question.findMany({
      where: { testId: attempt.testId },
      select: { id: true, type: true, correctAnswer: true, marks: true, negativeMarks: true, options: true },
    }),
    prisma.answer.findMany({
      where: { attemptId },
      select: { questionId: true, answer: true },
    }),
  ]);

  const scoring = scoreAttempt(
    questions.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options as string[] : null,
      type: q.type as "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER",
    })),
    answers,
    (attempt.optionOrderMap as Record<string, number[]> | null) ?? null
  );

  // Write all answer scoring rows sequentially (idempotent).
  // Sequential avoids exhausting the Neon direct connection limit when running
  // the rescore locally — production uses Vercel which has one invocation per
  // request so the parallel version there is fine.
  let ok = 0; let fail = 0;
  for (const ar of scoring.answers) {
    try {
      await prisma.answer.updateMany({
        where: { attemptId, questionId: ar.questionId },
        data: { isCorrect: ar.isCorrect, marksAwarded: ar.marksAwarded },
      });
      ok++;
    } catch (e) {
      console.error(`  Failed Q${ar.questionId}:`, (e as Error).message.split('\n')[0]);
      fail++;
    }
  }
  console.log(`Updated ${ok} answer rows, ${fail} failed.`);

  // Verify final state
  const final = await prisma.answer.findMany({
    where: { attemptId },
    include: { question: { select: { order: true, type: true } } },
    orderBy: { question: { order: "asc" } },
  });

  console.log("\nFinal answer scoring:");
  for (const a of final) {
    const q = a.question;
    console.log(`  Q${q.order} | answer="${a.answer}" | correct=${a.isCorrect} | marks=${a.marksAwarded}`);
  }

  const nullCount = final.filter(a => a.isCorrect === null && a.answer !== null).length;
  if (nullCount === 0) {
    console.log("\n✓ All answer rows fully scored.");
  } else {
    console.warn(`\n⚠ ${nullCount} rows still have isCorrect=null.`);
  }
}

main().finally(() => prisma.$disconnect());
