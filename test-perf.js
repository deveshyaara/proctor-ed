const ort = require('onnxruntime-node');

async function testPerformance() {
  try {
    const session = await ort.InferenceSession.create('public/models/face/ultra-light-fast-320.onnx');
    
    // Create dummy 320x240 input
    const floatData = new Float32Array(1 * 3 * 240 * 320);
    const tensor = new ort.Tensor('float32', floatData, [1, 3, 240, 320]);
    
    // Warmup
    for (let i = 0; i < 5; i++) {
      await session.run({ [session.inputNames[0]]: tensor });
    }
    
    const start = performance.now();
    let totalMs = 0;
    
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      await session.run({ [session.inputNames[0]]: tensor });
      const t1 = performance.now();
      totalMs += (t1 - t0);
    }
    
    const elapsed = performance.now() - start;
    const fps = (50 / elapsed) * 1000;
    const avgLatency = totalMs / 50;
    
    console.log(`[AI Diagnostics] Avg Latency: ${avgLatency.toFixed(1)}ms | Sustained FPS: ${fps.toFixed(1)}`);
  } catch (e) {
    console.error(e);
  }
}

testPerformance();
