import { GazeEstimate } from './headPose';

export interface FaceDetectionResult {
  faces: Array<{
    box: [number, number, number, number];
    score: number;
  }>;
  gaze?: GazeEstimate | null;
}

export class FaceDetector {
  private worker: Worker | null = null;
  private messageIdCounter = 0;
  private resolvers: Map<number, (result: FaceDetectionResult) => void> = new Map();
  private isInitializing = false;
  private isReady = false;
  private activeProvider: string | null = null;
  private readyPromise: Promise<boolean>;
  private readyResolver!: (value: boolean) => void;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolver = resolve;
    });
    this.initWorker();
  }

  async waitForReady(): Promise<boolean> {
    return this.readyPromise;
  }

  getActiveProvider(): string | null {
    return this.activeProvider;
  }

  private initWorker() {
    if (typeof window === 'undefined') {
      this.readyResolver(false);
      return;
    }

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => {
      const { type, id, result, error, provider } = e.data;
      if (type === 'INIT_DONE') {
        this.activeProvider = provider || null;
        console.log(`[FaceDetector] Worker initialized successfully with provider: ${this.activeProvider}`);
        this.isReady = true;
        this.isInitializing = false;
        this.readyResolver(true);
      } else if (type === 'INIT_ERROR') {
        console.error("AI Worker Init Error:", error);
        this.isInitializing = false;
        this.isReady = false;
        this.readyResolver(false);
      } else if (type === 'DETECT_DONE') {
        const resolve = this.resolvers.get(id);
        if (resolve) {
          resolve(result as FaceDetectionResult);
          this.resolvers.delete(id);
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error("[FaceDetector Worker onerror]:", err.message || err, err.filename, err.lineno);
      this.isInitializing = false;
      this.isReady = false;
      this.readyResolver(false);
    };

    this.isInitializing = true;
    const forceWasm = typeof window !== 'undefined' && window.location.search.includes('force_wasm=1');
    console.log(`[FaceDetector] Spawning worker (forceWasm=${forceWasm})...`);
    this.worker.postMessage({ type: 'INIT', forceWasm });
  }

  async detect(imageCanvas: HTMLCanvasElement | HTMLVideoElement): Promise<FaceDetectionResult> {
    if (!this.worker || !this.isReady) {
      return { faces: [{ box: [0, 0, 1, 1], score: 1.0 }] };
    }

    try {
      // Fast off-thread resize using createImageBitmap
      const bitmap = await createImageBitmap(imageCanvas, {
        resizeWidth: 320,
        resizeHeight: 240,
        resizeQuality: 'low'
      });

      return new Promise<FaceDetectionResult>((resolve) => {
        const id = this.messageIdCounter++;
        this.resolvers.set(id, resolve);
        // Transfer the bitmap
        this.worker!.postMessage({ type: 'DETECT', id, bitmap }, [bitmap]);
      });
    } catch (e) {
      console.error("FaceDetector client error:", e);
      return { faces: [{ box: [0, 0, 1, 1], score: 1.0 }] };
    }
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.resolvers.clear();
    this.isReady = false;
  }
}
