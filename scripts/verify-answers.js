const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tests = await prisma.test.findMany({
    where: {
      id: { in: ['cmu0uhf3x0001ju04z1ud4rh2', 'cmtx0kvh70002i1v4tcd1gglq', 'cmtyn2qm80008i11ck1hcsvxx'] }
    },
    include: {
      questions: { orderBy: { order: 'asc' } },
      attempts: {
        include: {
          answers: true
        }
      }
    }
  });

  for (const t of tests) {
    console.log(`\n=== Test: ${t.title} (${t.id}) ===`);
    console.log(`Questions count: ${t.questions.length}`);
    console.log(`Question types:`, t.questions.map(q => `${q.order}: ${q.type} (${q.marks}m)`));
    console.log(`Attempts count: ${t.attempts.length}`);
    for (const a of t.attempts) {
      console.log(`  - Attempt: ${a.id} | Student: ${a.studentName} | Roll: ${a.rollNumber} | Status: ${a.status} | Score: ${a.score}/${a.maxScore}`);
      console.log(`    Answers saved count: ${a.answers.length}`);
      for (const ans of a.answers) {
        console.log(`      Q: ${ans.questionId} | Ans: ${ans.answer} | isCorrect: ${ans.isCorrect} | marks: ${ans.marksAwarded}`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
