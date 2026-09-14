import { executeAttemptSubmission } from "../lib/exam/submission";
import { prisma } from "../lib/db/client";

async function main() {
  const attempt = await prisma.attempt.findFirst({
    where: { rollNumber: "VERIF-2026" }
  });

  if (!attempt) {
    console.error("Attempt VERIF-2026 not found");
    return;
  }

  const result = await executeAttemptSubmission(attempt.id, "SUBMITTED");
  console.log("Submission Result:", JSON.stringify(result, null, 2));

  const updatedAttempt = await prisma.attempt.findUnique({
    where: { id: attempt.id },
    select: {
      id: true,
      studentName: true,
      rollNumber: true,
      status: true,
      score: true,
      maxScore: true
    }
  });
  console.log("Updated Attempt in DB:", JSON.stringify(updatedAttempt, null, 2));

  const answers = await prisma.answer.findMany({
    where: { attemptId: attempt.id },
    include: { question: true }
  });

  console.log("\nAnswers evaluated in DB:");
  answers.forEach(a => {
    console.log(`Q${a.question.order} (${a.question.type}) - Student Ans: "${a.answer}" | Correct: ${a.isCorrect} | Marks Awarded: ${a.marksAwarded}`);
  });
}

main().finally(() => prisma.$disconnect());
