import { NextRequest } from "next/server";
import { prisma } from "../lib/db/client";
import { auth } from "../lib/auth/server";
import { GET } from "../app/api/tests/[id]/attempts/[attemptId]/answers/route";

async function main() {
  const test = await prisma.test.findUnique({
    where: { testCode: "MATH7284" },
    include: { teacher: true }
  });

  if (!test) throw new Error("Test MATH7284 not found");

  const attempt = await prisma.attempt.findFirst({
    where: { rollNumber: "VERIF-2026" }
  });

  if (!attempt) throw new Error("Attempt VERIF-2026 not found");

  const neonId = test.teacher.neonAuthUserId || "neon-teacher-demo-1";
  if (!test.teacher.neonAuthUserId) {
    await prisma.user.update({
      where: { id: test.teacher.id },
      data: { neonAuthUserId: neonId }
    });
  }

  // Mock Neon Auth session to match the teacher
  auth.getSession = async () => ({
    data: {
      user: {
        id: neonId,
        email: test.teacher.email,
        name: test.teacher.name
      },
      session: { id: "sess-1", userId: neonId }
    }
  }) as any;

  const req = new NextRequest(
    `http://localhost:3000/api/tests/${test.id}/attempts/${attempt.id}/answers`
  );

  const res = await GET(req, {
    params: Promise.resolve({ id: test.id, attemptId: attempt.id })
  });

  console.log("HTTP Status:", res.status);
  const data = await res.json();
  if (res.status !== 200) {
    console.error("Error response:", data);
    return;
  }

  console.log("\n=== API Response Summary ===");
  console.log("Test Title:", data.test.title);
  console.log("Student:", data.attempt.studentName, `(Roll: ${data.attempt.rollNumber})`);
  console.log("Roster Score in DB:", `${data.attempt.score} / ${data.attempt.maxScore}`);
  console.log("Summary:", JSON.stringify(data.summary, null, 2));

  console.log("\n=== Question by Question Breakdown ===");
  let sumMarksAwarded = 0;
  data.questions.forEach((q: any) => {
    sumMarksAwarded += q.marksAwarded;
    console.log(
      `Q${q.order} [${q.type}] | Answered: ${q.isAnswered} | isCorrect: ${q.isCorrect} | Marks: ${q.marksAwarded}/${q.marks} (neg: ${q.negativeMarks})` +
      ` | Student: "${q.submittedAnswer}" | Correct: "${q.correctAnswer}" | Expl: ${Boolean(q.explanation)}`
    );
  });

  console.log(`\nSum of Marks Awarded: ${sumMarksAwarded}`);
  console.log(`Matches attempt.score (${data.attempt.score}): ${sumMarksAwarded === data.attempt.score}`);
}

main().finally(() => prisma.$disconnect());
