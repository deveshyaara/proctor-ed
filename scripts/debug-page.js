const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateAttemptToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function attemptCookieName(attemptId) {
  return `pe_at_${attemptId}`;
}

async function main() {
  const test = await prisma.test.findUnique({
    where: { testCode: 'MATH7284' },
    include: { questions: { orderBy: { order: 'asc' } } }
  });

  const rawToken = generateAttemptToken();
  const accessTokenHash = hashToken(rawToken);

  const attempt = await prisma.attempt.create({
    data: {
      testId: test.id,
      studentName: `Debug Student`,
      rollNumber: `DBG-${Date.now().toString().slice(-4)}`,
      accessTokenHash,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 7200 * 1000),
      lastHeartbeatAt: new Date(),
      questionOrder: test.questions.map(q => q.id),
      optionOrderMap: {}
    }
  });

  const targetUrl = `http://localhost:3000/exam/${test.testCode}/attempt/${attempt.id}`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-unsafe-webgpu',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    permissions: ['camera']
  });

  await context.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => document.documentElement,
      configurable: true
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });
  });

  await context.addCookies([
    {
      name: attemptCookieName(attempt.id),
      value: rawToken,
      domain: 'localhost',
      path: '/'
    }
  ]);

  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[PAGE CONSOLE ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', err => {
    console.error('[PAGE ERROR]:', err);
  });

  console.log('Navigating to', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        videoFound: !!v,
        videoReadyState: v ? v.readyState : null,
        videoPaused: v ? v.paused : null,
        videoDimensions: v ? `${v.videoWidth}x${v.videoHeight}` : null,
        aiMetrics: window.aiMetrics || null,
      };
    });
    console.log(`State at ${i+1}s:`, state);
  }

  await browser.close();
  await prisma.$disconnect();
}

main().catch(console.error);
