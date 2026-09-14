import * as ort from 'onnxruntime-web';
import { MODEL_MANIFEST } from '../modelManifest';

export class InferenceSessionManager {
  private faceSession: ort.InferenceSession | null = null;
  private landmarkSession: ort.InferenceSession | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  private activeProvider: string | null = null;
  private landmarkFailed = false;

  async getSession(forceWasm?: boolean): Promise<ort.InferenceSession | null> {
    return this.getFaceSession(forceWasm);
  }

  async getFaceSession(forceWasm?: boolean): Promise<ort.InferenceSession | null> {
    if (this.faceSession) return this.faceSession;

    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return this.faceSession;
    }

    this.isInitializing = true;
    this.initPromise = this.initialize(forceWasm);
    await this.initPromise;
    this.isInitializing = false;

    return this.faceSession;
  }

  async getLandmarkSession(forceWasm?: boolean): Promise<ort.InferenceSession | null> {
    if (this.landmarkSession) return this.landmarkSession;
    if (this.landmarkFailed) return null;

    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return this.landmarkSession;
    }

    // Trigger init if not already done
    await this.getFaceSession(forceWasm);
    return this.landmarkSession;
  }

  isLandmarkAvailable(): boolean {
    return this.landmarkSession !== null;
  }

  getActiveProvider(): string | null {
    return this.activeProvider;
  }

  private async initialize(forceWasm?: boolean): Promise<void> {
    try {
      let epFallbackList = ['webgpu', 'wasm'];
      const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
      const shouldForceWasm = Boolean(
        forceWasm ||
        (g.location && typeof g.location.search === 'string' && g.location.search.includes('force_wasm=1'))
      );

      if (shouldForceWasm) {
        epFallbackList = ['wasm'];
        console.log("AI Proctoring: Forcing WASM execution provider for testing");
      }
      let lastError = null;

      for (const ep of epFallbackList) {
        try {
          // 1. Initialize Face Detection session
          // WATCH ITEM 1: Scope graphOptimizationLevel: 'disabled' strictly to RFB-320
          // to bypass its JSEP [Mul] kernel fusion bug on [1, 4420, 2]
          const faceSessionOptions: ort.InferenceSession.SessionOptions = {
            executionProviders: [ep],
            ...(ep === 'webgpu' ? { graphOptimizationLevel: 'disabled' } : {}),
          };
          const newFaceSession = await ort.InferenceSession.create(
            MODEL_MANIFEST.FACE_DETECTION.path,
            faceSessionOptions
          );

          if (this.initPromise === null) {
            if (typeof (newFaceSession as any)?.release === 'function') {
              (newFaceSession as any).release();
            }
            return;
          }

          // Warmup pass for face detection
          const dummyFaceData = new Float32Array(3 * 240 * 320);
          const dummyFaceTensor = new ort.Tensor('float32', dummyFaceData, [1, 3, 240, 320]);
          const faceFeeds: Record<string, ort.Tensor> = {};
          faceFeeds[newFaceSession.inputNames[0]] = dummyFaceTensor;
          await newFaceSession.run(faceFeeds);

          this.faceSession = newFaceSession;
          this.activeProvider = ep;
          console.log(`AI Proctoring: Face detector initialized & verified with provider: ${ep}`);

          // 2. Initialize Landmark session (Condition 3: Independent graceful degradation)
          // WATCH ITEM 1: faceLandmark compiles with standard graphOptimizationLevel: 'all'
          try {
            const landmarkOptions: ort.InferenceSession.SessionOptions = {
              executionProviders: [ep],
              graphOptimizationLevel: 'all',
            };
            const newLandmarkSession = await ort.InferenceSession.create(
              MODEL_MANIFEST.FACE_LANDMARK.path,
              landmarkOptions
            );

            // Warmup pass for landmark model ([1, 256, 256, 3] NHWC)
            const dummyLandmarkData = new Float32Array(1 * 256 * 256 * 3);
            const dummyLandmarkTensor = new ort.Tensor('float32', dummyLandmarkData, [1, 256, 256, 3]);
            const landmarkFeeds: Record<string, ort.Tensor> = {};
            landmarkFeeds[newLandmarkSession.inputNames[0]] = dummyLandmarkTensor;
            await newLandmarkSession.run(landmarkFeeds);

            this.landmarkSession = newLandmarkSession;
            this.landmarkFailed = false;
            console.log(`AI Proctoring: Landmark model initialized & verified with provider: ${ep}`);
          } catch (landmarkErr) {
            // CONDITION 3: Landmark failure must not crash or disable face detection
            console.warn("AI Proctoring: Landmark model initialization failed, degrading gaze gracefully:", landmarkErr);
            this.landmarkSession = null;
            this.landmarkFailed = true;
          }

          return; // Success
        } catch (e) {
          lastError = e;
          console.warn(`AI Proctoring: Execution provider '${ep}' failed verification, falling back:`, e);
          // Continue to fallback
        }
      }

      console.warn("AI Proctoring: Could not initialize ONNX session. Falling back to graceful degradation.", lastError);
      this.faceSession = null;
      this.landmarkSession = null;
    } catch (err) {
      console.error("AI Proctoring: Fatal error initializing ONNX runtime.", err);
      this.faceSession = null;
      this.landmarkSession = null;
    }
  }

  dispose() {
    const releaseSession = (s: ort.InferenceSession | null) => {
      if (s) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (typeof (s as any).release === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            (s as any).release();
          }
        } catch (e) {
          console.error("Session release error", e);
        }
      }
    };

    releaseSession(this.faceSession);
    releaseSession(this.landmarkSession);
    this.faceSession = null;
    this.landmarkSession = null;
    this.initPromise = null;
    this.isInitializing = false;
  }
}

export const sessionManager = new InferenceSessionManager();

