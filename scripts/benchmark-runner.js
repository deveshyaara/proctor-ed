const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');

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

async function createFreshAttempt(label) {
  const test = await prisma.test.findUnique({
    where: { testCode: 'MATH7284' },
    include: { questions: { orderBy: { order: 'asc' } } }
  });

  if (!test) throw new Error("Test MATH7284 not found");

  const rawToken = generateAttemptToken();
  const accessTokenHash = hashToken(rawToken);
  const rollNumber = `BENCH-${label}-${Date.now().toString().slice(-4)}`;

  const attempt = await prisma.attempt.create({
    data: {
      testId: test.id,
      studentName: `Benchmark ${label}`,
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

  return {
    attemptId: attempt.id,
    testCode: test.testCode,
    rawToken,
    cookieName: attemptCookieName(attempt.id)
  };
}

async function runBenchmarkForPath(pathName, forceWasm) {
  console.log(`\n============================================================`);
  console.log(`STARTING SUSTAINED BENCHMARK: ${pathName} (forceWasm=${forceWasm})`);
  console.log(`Mode: Headed Chrome with --enable-unsafe-webgpu`);
  console.log(`Required Duration: 120+ seconds continuous sustained inference`);
  console.log(`============================================================\n`);

  const attemptInfo = await createFreshAttempt(pathName.slice(0, 6));
  const targetUrl = forceWasm
    ? `http://localhost:3000/exam/${attemptInfo.testCode}/attempt/${attemptInfo.attemptId}?force_wasm=1`
    : `http://localhost:3000/exam/${attemptInfo.testCode}/attempt/${attemptInfo.attemptId}`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
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
    // Avoid fullscreen guard popup in automated benchmark
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
      name: attemptInfo.cookieName,
      value: attemptInfo.rawToken,
      domain: 'localhost',
      path: '/'
    }
  ]);

  const page = await context.newPage();

  let detectedProvider = null;

  // Log console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Worker]') || text.includes('[FaceDetector]') || text.includes('AI Diagnostics') || text.includes('execution provider:')) {
      console.log(`  [Browser] ${text}`);
    }
    if (text.includes('Worker initialized successfully with provider:') || text.includes('Session initialized with provider:')) {
      detectedProvider = text.split('provider:')[1]?.trim();
    }
  });

  console.log(`Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Explicit confirmation check of navigator.gpu
  const gpuCheck = await page.evaluate(async () => {
    if (!navigator.gpu) return { hasGpu: false, reason: 'navigator.gpu is undefined' };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return { hasGpu: true, adapter: !!adapter };
    } catch (e) {
      return { hasGpu: false, error: e.message };
    }
  });
  console.log(`[Host Check] navigator.gpu confirmation:`, JSON.stringify(gpuCheck));

  // Wait for video element
  await page.waitForSelector('video', { timeout: 30000 });
  console.log("Video element found. Waiting for video stream & AI worker initialization...");

  // Wait until AI worker is initialized and video is playing
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && v.readyState >= 2 && !v.paused;
  }, { timeout: 30000 });

  // Wait until inference diagnostics confirm active inference loop
  console.log("Waiting for continuous inference loop to engage...");
  await page.waitForFunction(() => {
    const m = window.aiMetrics;
    return m && (m.lifetimeFrames > 5 || m.frameCount > 5);
  }, { timeout: 30000 });

  console.log(`Inference loop confirmed active! Active provider: ${detectedProvider || 'unknown'}`);
  console.log("Beginning 120-second continuous sustained measurement window...");

  const results = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const video = document.querySelector('video');
      const TOTAL_DURATION_MS = 120000; // 120 seconds
      const startTime = performance.now();

      // 1. Camera Preview Smoothness Monitor (requestVideoFrameCallback)
      let previewFrames = 0;
      let lastFrameTime = performance.now();
      const frameIntervals = [];
      let isMonitoring = true;

      if ('requestVideoFrameCallback' in video) {
        function onVideoFrame(now) {
          if (!isMonitoring) return;
          previewFrames++;
          const delta = now - lastFrameTime;
          lastFrameTime = now;
          if (frameIntervals.length < 500) {
            frameIntervals.push(delta);
          }
          video.requestVideoFrameCallback(onVideoFrame);
        }
        video.requestVideoFrameCallback(onVideoFrame);
      } else {
        function onRaf(t) {
          if (!isMonitoring) return;
          previewFrames++;
          const delta = t - lastFrameTime;
          lastFrameTime = t;
          if (frameIntervals.length < 500) {
            frameIntervals.push(delta);
          }
          requestAnimationFrame(onRaf);
        }
        requestAnimationFrame(onRaf);
      }

      // 2. Countdown Timer Smoothness Monitor
      const timerTicks = [];
      const timerElement = Array.from(document.querySelectorAll('*')).find(el => {
        return el.children.length === 0 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(el.textContent.trim());
      });

      let lastTimerText = timerElement ? timerElement.textContent.trim() : "";
      let lastTickTimestamp = performance.now();

      const checkTimer = () => {
        if (!timerElement || !isMonitoring) return;
        const curText = timerElement.textContent.trim();
        if (curText !== lastTimerText && /^\d{1,2}:\d{2}(:\d{2})?$/.test(curText)) {
          const now = performance.now();
          const delta = now - lastTickTimestamp;
          timerTicks.push({
            display: curText,
            timestampMs: Number((now - startTime).toFixed(1)),
            deltaMs: Number(delta.toFixed(1))
          });
          lastTimerText = curText;
          lastTickTimestamp = now;
        }
      };

      const timerInterval = setInterval(checkTimer, 100);

      // 3. MCQ Click-to-Response Latency
      const mcqSamples = [];
      const transitionSamples = [];

      async function executeMcqClick(isTransitionTest = false) {
        let labels = Array.from(document.querySelectorAll('label input[type="radio"]')).map(i => i.closest('label')).filter(Boolean);
        if (labels.length < 2) {
          const q1Btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '1');
          if (q1Btn) q1Btn.click();
          await new Promise(r => setTimeout(r, 200));
          labels = Array.from(document.querySelectorAll('label input[type="radio"]')).map(i => i.closest('label')).filter(Boolean);
        }
        if (labels.length < 2) return;

        // Click non-selected option
        const currentCheckedIndex = labels.findIndex(l => {
          const inp = l.querySelector('input');
          return inp && inp.checked;
        });
        const targetIndex = currentCheckedIndex === 0 ? 1 : 0;
        const targetLabel = labels[targetIndex];
        if (!targetLabel) return;

        const t0 = performance.now();
        targetLabel.click();

        // Measure time until DOM updates visual selection state (next render frame)
        await new Promise(r => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const t1 = performance.now();
              const elapsed = Number((t1 - t0).toFixed(2));
              mcqSamples.push(elapsed);
              if (isTransitionTest) {
                transitionSamples.push(elapsed);
              }
              r();
            });
          });
        });
      }

      // 4. Question Navigation Responsiveness
      const navSamples = [];
      async function executeNavigationClick() {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const nextBtn = allButtons.find(b => b.textContent.includes('Next') && !b.disabled);
        const navBtns = allButtons.filter(b => /^\d+$/.test(b.textContent.trim()));

        const targetBtn = nextBtn || navBtns[navSamples.length % navBtns.length];
        if (!targetBtn) return;

        const currentHeading = document.querySelector('h2') ? document.querySelector('h2').textContent : "";
        const t0 = performance.now();
        targetBtn.click();

        await new Promise(r => {
          const interval = setInterval(() => {
            const newHeading = document.querySelector('h2') ? document.querySelector('h2').textContent : "";
            if (newHeading !== currentHeading || performance.now() - t0 > 1500) {
              clearInterval(interval);
              const t1 = performance.now();
              navSamples.push(t1 - t0);
              r();
            }
          }, 10);
        });

        // WATCH ITEM 2: Immediately execute an MCQ click during question transition
        setTimeout(() => executeMcqClick(true), 50);
      }

      // Schedule 14 steady-state MCQ clicks (ensures ≥ 10 samples captured)
      const mcqSchedule = [5000, 10000, 18000, 25000, 35000, 45000, 55000, 65000, 75000, 85000, 95000, 102000, 108000, 114000];
      mcqSchedule.forEach(delay => {
        setTimeout(() => executeMcqClick(false), delay);
      });

      // Schedule 6 Navigation clicks
      const navSchedule = [12000, 30000, 50000, 70000, 90000, 110000];
      navSchedule.forEach(delay => {
        setTimeout(executeNavigationClick, delay);
      });

      // End of 120s test
      setTimeout(() => {
        isMonitoring = false;
        clearInterval(timerInterval);

        const totalElapsedMs = performance.now() - startTime;
        const totalDurationSec = totalElapsedMs / 1000;
        const previewFps = previewFrames / totalDurationSec;

        const establishedTicks = timerTicks.slice(1);
        const delayedTicks = establishedTicks.filter(t => t.deltaMs > 1300);
        const skippedTicks = establishedTicks.filter(t => t.deltaMs > 1800);

        const aiState = window.aiMetrics || { frameCount: 0, totalMs: 0, count: 0, lifetimeFrames: 0, lifetimeMs: 0, avgLatency: 0, sustainedFps: 0 };
        const totalFrames = aiState.lifetimeFrames || aiState.frameCount || 0;
        const avgLatency = aiState.lifetimeFrames > 0
          ? Number((aiState.lifetimeMs / aiState.lifetimeFrames).toFixed(1))
          : (aiState.count > 0 ? Number((aiState.totalMs / aiState.count).toFixed(1)) : 0);
        const sustainedFps = aiState.sustainedFps > 0
          ? aiState.sustainedFps
          : Number((totalFrames / totalDurationSec).toFixed(1));

        resolve({
          totalDurationSec: Number(totalDurationSec.toFixed(1)),
          aiInference: {
            sustainedInferenceConfirmed: totalFrames >= 600,
            recordedInferenceFrames: totalFrames,
            avgLatencyMs: avgLatency,
            sustainedFps: sustainedFps,
            gazeActive: Boolean(window.lastGazeEstimate !== undefined)
          },
          cameraPreview: {
            previewFramesTotal: previewFrames,
            previewFPS: Number(previewFps.toFixed(2)),
            smoothness: previewFps >= 24 ? "EXCELLENT" : previewFps >= 15 ? "GOOD" : "STUTTERING"
          },
          timerSmoothness: {
            totalTicksRecorded: timerTicks.length,
            delayedTicksCount: delayedTicks.length,
            skippedTicksCount: skippedTicks.length,
            sampleDeltasMs: establishedTicks.slice(0, 8).map(t => t.deltaMs),
            delayedTicksReport: delayedTicks.map(t => ({ display: t.display, timestampMs: t.timestampMs, deltaMs: t.deltaMs }))
          },
          mcqLatency: {
            count: mcqSamples.length,
            samplesMs: mcqSamples,
            minMs: mcqSamples.length ? Number(Math.min(...mcqSamples).toFixed(2)) : 0,
            avgMs: mcqSamples.length ? Number((mcqSamples.reduce((a, b) => a + b, 0) / mcqSamples.length).toFixed(2)) : 0,
            maxMs: mcqSamples.length ? Number(Math.max(...mcqSamples).toFixed(2)) : 0
          },
          transitionMcqLatency: {
            count: transitionSamples.length,
            samplesMs: transitionSamples,
            avgMs: transitionSamples.length ? Number((transitionSamples.reduce((a, b) => a + b, 0) / transitionSamples.length).toFixed(2)) : 0,
            maxMs: transitionSamples.length ? Number(Math.max(...transitionSamples).toFixed(2)) : 0
          },
          navLatency: {
            count: navSamples.length,
            samplesMs: navSamples.map(s => Number(s.toFixed(2))),
            minMs: navSamples.length ? Number(Math.min(...navSamples).toFixed(2)) : 0,
            avgMs: navSamples.length ? Number((navSamples.reduce((a, b) => a + b, 0) / navSamples.length).toFixed(2)) : 0,
            maxMs: navSamples.length ? Number(Math.max(...navSamples).toFixed(2)) : 0
          }
        });
      }, TOTAL_DURATION_MS + 2000);
    });
  });

  await browser.close();

  return {
    path: pathName,
    provider: detectedProvider,
    gpuConfirmation: gpuCheck,
    ...results
  };
}

async function main() {
  console.log("================================================================");
  console.log("PROCTORED PHASE 7a VERIFICATION: SUSTAINED LOAD BENCHMARK SUITE");
  console.log("Headed Chrome | WebGPU Native & WASM Fallback | 120s per path");
  console.log("================================================================");

  // 1. Run Genuine WebGPU Path (120 seconds)
  const webgpuResult = await runBenchmarkForPath("WebGPU Execution Path", false);
  console.log("\n================ WEBGPU RUN RESULTS ================");
  console.log(JSON.stringify(webgpuResult, null, 2));

  // 2. Run Genuine WASM Path (120 seconds)
  const wasmResult = await runBenchmarkForPath("WASM Fallback Execution Path (?force_wasm=1)", true);
  console.log("\n================ WASM RUN RESULTS ================");
  console.log(JSON.stringify(wasmResult, null, 2));

  const benchmarkReport = {
    timestamp: new Date().toISOString(),
    hardware: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    },
    webgpu: webgpuResult,
    wasm: wasmResult
  };

  fs.writeFileSync('benchmark_results.json', JSON.stringify(benchmarkReport, null, 2));
  console.log("\nBenchmark complete! Results written to benchmark_results.json");

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("FATAL Benchmark Error:", err);
  process.exit(1);
});
