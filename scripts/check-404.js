const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const attempt = await prisma.attempt.findFirst({
    where: { test: { testCode: 'MATH7284' } },
    orderBy: { createdAt: 'desc' }
  });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ permissions: ['camera'] });
  const page = await ctx.newPage();

  page.on('response', r => {
    if (r.status() >= 400) {
      console.log('HTTP ERROR:', r.status(), r.url());
    }
  });

  page.on('console', msg => {
    console.log('[CONSOLE]:', msg.type(), msg.text());
  });

  page.on('pageerror', err => {
    console.log('[PAGE ERROR]:', err.message);
  });

  await page.goto(`http://localhost:3000/exam/MATH7284/attempt/${attempt.id}`);
  await page.waitForTimeout(3000);

  await browser.close();
  await prisma.$disconnect();
}

main().catch(console.error);
