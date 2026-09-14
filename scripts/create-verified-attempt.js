const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateAttemptToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function main() {
  const test = await prisma.test.findUnique({
    where: { testCode: 'MATH7284' },
    include: { questions: { orderBy: { order: 'asc' } } }
  });

  if (!test) {
    console.error("Test MATH7284 not found!");
    process.exit(1);
  }

  const rawToken = generateAttemptToken();
  const accessTokenHash = hashToken(rawToken);
  const rollNumber = 'VERIF-2026';

  // Clean up any prior test attempt with same rollNumber
  await prisma.attempt.deleteMany({
    where: { testId: test.id, rollNumber }
  });

  const attempt = await prisma.attempt.create({
    data: {
      testId: test.id,
      studentName: 'Aarav Sharma',
      rollNumber,
      accessTokenHash,
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastHeartbeatAt: new Date(),
      questionOrder: test.questions.map(q => q.id),
      optionOrderMap: null
    }
  });

  const qMap = {};
  test.questions.forEach(q => { qMap[q.order] = q; });

  // Student answers:
  // Q1 (MCQ): "1" -> Correct (+2)
  // Q2 (MCQ): "0" -> Incorrect (-0.5)
  // Q3 (T/F): "0" -> Correct (+1)
  // Q4 (MCQ): UNANSWERED
  // Q5 (NUM): "55" -> Correct (+2)
  // Q6 (MCQ): "2" -> Incorrect (-0.5)
  // Q7 (T/F): UNANSWERED
  // Q8 (MCQ): "1" -> Correct (+2)
  // Q9 (SHORT): UNANSWERED
  // Q10 (NUM): "15" -> Correct (+1)

  const studentAnswers = [
    { order: 1, ans: '1' },
    { order: 2, ans: '0' },
    { order: 3, ans: '0' },
    // Q4 left unanswered
    { order: 5, ans: '55' },
    { order: 6, ans: '2' },
    // Q7 left unanswered
    { order: 8, ans: '1' },
    // Q9 left unanswered
    { order: 10, ans: '15' }
  ];

  for (const item of studentAnswers) {
    const q = qMap[item.order];
    await prisma.answer.create({
      data: {
        attemptId: attempt.id,
        questionId: q.id,
        answer: item.ans,
        answeredAt: new Date()
      }
    });
  }

  console.log(`Created attempt ${attempt.id} for student ${attempt.studentName} (${attempt.rollNumber})`);
}

main().finally(() => prisma.$disconnect());
