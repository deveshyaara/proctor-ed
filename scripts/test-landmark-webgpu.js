const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.all.min.js' });

  const benchmark = await page.evaluate(async () => {
    const ort = window.ort;
    
    async function measure(name, ep, optLevel) {
      const opts = { executionProviders: [ep] };
      if (optLevel) opts.graphOptimizationLevel = optLevel;
      const session = await ort.InferenceSession.create('/models/face/face_landmark.onnx', opts);
      const dummyData = new Float32Array(1 * 256 * 256 * 3);
      const dummyTensor = new ort.Tensor('float32', dummyData, [1, 256, 256, 3]);
      const feeds = {};
      feeds[session.inputNames[0]] = dummyTensor;
      // Warmup
      await session.run(feeds);
      
      const runs = [];
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        await session.run(feeds);
        runs.push(performance.now() - t0);
      }
      const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
      return { name, ep, optLevel: optLevel || 'all', avgMs: Number(avg.toFixed(1)), minMs: Number(Math.min(...runs).toFixed(1)), maxMs: Number(Math.max(...runs).toFixed(1)) };
    }

    const res = [];
    res.push(await measure('WebGPU (opt=all)', 'webgpu', 'all'));
    res.push(await measure('WebGPU (opt=disabled)', 'webgpu', 'disabled'));
    res.push(await measure('WASM', 'wasm'));
    return res;
  });

  console.log('Steady-state Benchmark:\n', JSON.stringify(benchmark, null, 2));
  await browser.close();
})();
