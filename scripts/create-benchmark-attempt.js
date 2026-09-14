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

  const rollNumber = 'BENCHMARK-' + Date.now().toString().slice(-6);

  const attempt = await prisma.attempt.create({
    data: {
      testId: test.id,
      studentName: 'Perf Benchmark Student',
      rollNumber,
      accessTokenHash,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 7200 * 1000), // 2 hours
      lastHeartbeatAt: new Date(),
      questionOrder: test.questions.map(q => q.id),
      optionOrderMap: {}
    }
  });

  console.log(JSON.stringify({
    attemptId: attempt.id,
    testCode: test.testCode,
    rawToken,
    cookieName: `pe_attempt_${attempt.id}`,
    url: `http://localhost:3000/exam/${test.testCode}/attempt/${attempt.id}`,
    wasmUrl: `http://localhost:3000/exam/${test.testCode}/attempt/${attempt.id}?force_wasm=1`
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
