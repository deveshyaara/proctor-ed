const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto("http://localhost:3000/test-dialog-regression");
  await page.waitForTimeout(1000);

  console.log("Buttons on page:");
  const buttons = await page.locator("button").allTextContents();
  console.log(buttons);

  // Click View Answers
  console.log("Clicking View Answers button...");
  const btn = page.locator("button:has-text('View Answers')").first();
  await btn.click();
  await page.waitForTimeout(1500);

  const dialogHtml = await page.locator("div[role='dialog']").innerHTML().catch(e => e.message);
  console.log("Dialog inner HTML length:", dialogHtml.length);
  console.log("Dialog inner HTML preview:", dialogHtml.slice(0, 300));

  await browser.close();
}

test();
