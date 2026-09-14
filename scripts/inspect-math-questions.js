const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const test = await prisma.test.findUnique({
    where: { testCode: 'MATH7284' },
    include: { questions: { orderBy: { order: 'asc' } } }
  });

  console.log(`Test: ${test.title} (ID: ${test.id})`);
  console.log(`Questions (${test.questions.length}):`);
  test.questions.forEach(q => {
    console.log(`Q${q.order} [${q.type}] (${q.marks}m, neg: ${q.negativeMarks}m): "${q.questionText}"`);
    console.log(`   Options:`, q.options);
    console.log(`   Correct: ${q.correctAnswer}`);
    console.log(`   Explanation: ${q.explanation}`);
  });
}

main().finally(() => prisma.$disconnect());
