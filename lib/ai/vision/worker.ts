import * as ort from 'onnxruntime-web';
import { MODEL_MANIFEST } from '../modelManifest';
import { generatePriors, nms } from '../postprocessing/nms';
import { InferenceSessionManager } from '../runtime/inferenceSession';
import { estimateHeadPoseAndGaze, GazeEstimate } from './headPose';
import { AI_CONFIG } from '../config';

// Worker-local session manager
const sessionManager = new InferenceSessionManager();
let priors: number[][] | null = null;
const SCORE_THRESHOLD = 0.7;
const IOU_THRESHOLD = 0.3;

// Offscreen canvases for face detection (320x240) and landmark cropping (256x256)
let offscreen: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

let landmarkOffscreen: OffscreenCanvas | null = null;
let landmarkCtx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, bitmap, id } = e.data;

  if (type === 'INIT') {
    try {
      await sessionManager.getFaceSession(e.data?.forceWasm);
      await sessionManager.getLandmarkSession(e.data?.forceWasm);
      const provider = sessionManager.getActiveProvider();
      const isLandmarkAvailable = sessionManager.isLandmarkAvailable();
      console.log(`[Worker] Sessions initialized with provider: ${provider}, landmark available: ${isLandmarkAvailable}`);
      self.postMessage({ type: 'INIT_DONE', provider, isLandmarkAvailable });
    } catch (err) {
      self.postMessage({ type: 'INIT_ERROR', error: String(err) });
    }
    return;
  }

  if (type === 'DETECT') {
    try {
      const faceSession = await sessionManager.getFaceSession();
      if (!faceSession) {
        self.postMessage({ type: 'DETECT_DONE', id, result: { faces: [], gaze: null } });
        if (bitmap) bitmap.close();
        return;
      }

      if (!priors) {
        priors = generatePriors();
      }

      const inputHeight = MODEL_MANIFEST.FACE_DETECTION.inputShape[2]; // 240
      const inputWidth = MODEL_MANIFEST.FACE_DETECTION.inputShape[3]; // 320

      if (!offscreen) {
        offscreen = new OffscreenCanvas(inputWidth, inputHeight);
        ctx = offscreen.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
      }

      if (!ctx) {
        self.postMessage({ type: 'DETECT_DONE', id, result: { faces: [], gaze: null } });
        if (bitmap) bitmap.close();
        return;
      }

      // Draw bitmap to offscreen canvas
      ctx.drawImage(bitmap, 0, 0, inputWidth, inputHeight);
      bitmap.close(); // Important: free the bitmap memory

      const imageData = ctx.getImageData(0, 0, inputWidth, inputHeight);
      
      const { width, height, data } = imageData;
      const floatData = new Float32Array(3 * width * height);
      for (let i = 0; i < width * height; i++) {
        floatData[i] = (data[i * 4] - 127.0) / 128.0; // R
        floatData[width * height + i] = (data[i * 4 + 1] - 127.0) / 128.0; // G
        floatData[2 * width * height + i] = (data[i * 4 + 2] - 127.0) / 128.0; // B
      }
      
      const tensor = new ort.Tensor('float32', floatData, [1, 3, height, width]);
      
      const feeds: Record<string, ort.Tensor> = {};
      feeds[faceSession.inputNames[0]] = tensor;
      const results = await faceSession.run(feeds);
      
      const scoresTensor = results['scores'];
      const boxesTensor = results['boxes'];

      if (!scoresTensor || !boxesTensor || !priors) {
        self.postMessage({ type: 'DETECT_DONE', id, result: { faces: [], gaze: null } });
        return;
      }

      const scoresData = scoresTensor.data as Float32Array;
      const boxesData = boxesTensor.data as Float32Array;
      
      const numPriors = priors.length;
      const faceScores: number[] = [];
      const validBoxes: number[][] = [];

      for (let i = 0; i < numPriors; i++) {
        const faceScore = scoresData[i * 2 + 1];
        if (faceScore >= SCORE_THRESHOLD) {
          faceScores.push(faceScore);
          
          const p = priors[i];
          const locIdx = i * 4;
          
          const cx = boxesData[locIdx] * 0.1 * p[2] + p[0];
          const cy = boxesData[locIdx + 1] * 0.1 * p[3] + p[1];
          const w = Math.exp(boxesData[locIdx + 2] * 0.2) * p[2];
          const h = Math.exp(boxesData[locIdx + 3] * 0.2) * p[3];
          
          const xmin = cx - w / 2;
          const ymin = cy - h / 2;
          const xmax = cx + w / 2;
          const ymax = cy + h / 2;
          
          validBoxes.push([xmin, ymin, xmax, ymax]);
        }
      }

      const keepIndices = nms(validBoxes, faceScores, IOU_THRESHOLD);

      const faces = keepIndices.map((idx) => {
        const box = validBoxes[idx];
        return {
          box: [box[0], box[1], box[2] - box[0], box[3] - box[1]] as [number, number, number, number],
          score: faceScores[idx],
        };
      });

      // ===================================================================
      // PHASE 7b: GAZE & HEAD POSE ESTIMATION (Landmark Model Stacking)
      // ===================================================================
      let gaze: GazeEstimate | null = null;

      // CONDITION 4: Explicitly confirm multi-face gaze behavior
      // Gaze/landmark inference is strictly skipped when face count is 0 or >= 2,
      // and ONLY runs when exactly 1 face is detected.
      // RATIONALE: When multiple people are detected, it is ambiguous which face to track gaze for;
      // MULTIPLE_PEOPLE is already a distinct, higher-severity violation evaluated independently.
      if (faces.length === 1 && sessionManager.isLandmarkAvailable()) {
        try {
          const landmarkSession = await sessionManager.getLandmarkSession();
          if (landmarkSession) {
            const face = faces[0];
            const [normX, normY, normW, normH] = face.box;

            // Convert normalized box to 320x240 frame coordinates
            const pxX = normX * inputWidth;
            const pxY = normY * inputHeight;
            const pxW = normW * inputWidth;
            const pxH = normH * inputHeight;

            // Add margin around detected face (Condition 1: centralized FACE_CROP_MARGIN_PCT)
            const marginRatio = (AI_CONFIG.GAZE_DEVIATION.FACE_CROP_MARGIN_PCT || 25) / 100;
            const marginW = pxW * marginRatio;
            const marginH = pxH * marginRatio;

            const cropX = Math.max(0, pxX - marginW);
            const cropY = Math.max(0, pxY - marginH);
            const cropW = Math.min(inputWidth - cropX, pxW + 2 * marginW);
            const cropH = Math.min(inputHeight - cropY, pxH + 2 * marginH);

            // CONDITION 5: Preprocessing according to MediaPipe reference specification
            // Target input: 256x256 NHWC RGB float32 normalized to [0.0, 1.0]
            const LM_SIZE = 256;
            if (!landmarkOffscreen) {
              landmarkOffscreen = new OffscreenCanvas(LM_SIZE, LM_SIZE);
              landmarkCtx = landmarkOffscreen.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
            }

            if (landmarkCtx && cropW > 10 && cropH > 10) {
              // Draw cropped face region to 256x256 offscreen canvas
              landmarkCtx.drawImage(offscreen, cropX, cropY, cropW, cropH, 0, 0, LM_SIZE, LM_SIZE);
              const lmImageData = landmarkCtx.getImageData(0, 0, LM_SIZE, LM_SIZE);
              const lmData = lmImageData.data;

              // Pack NHWC [1, 256, 256, 3] normalized [0.0, 1.0]
              const lmFloatData = new Float32Array(1 * LM_SIZE * LM_SIZE * 3);
              for (let i = 0; i < LM_SIZE * LM_SIZE; i++) {
                lmFloatData[i * 3 + 0] = lmData[i * 4 + 0] / 255.0; // R
                lmFloatData[i * 3 + 1] = lmData[i * 4 + 1] / 255.0; // G
                lmFloatData[i * 3 + 2] = lmData[i * 4 + 2] / 255.0; // B
              }

              const lmTensor = new ort.Tensor('float32', lmFloatData, [1, LM_SIZE, LM_SIZE, 3]);
              const lmFeeds: Record<string, ort.Tensor> = {};
              lmFeeds[landmarkSession.inputNames[0]] = lmTensor;

              const lmResults = await landmarkSession.run(lmFeeds);

              const landmarkOutput = lmResults['Identity'];
              const presenceOutput = lmResults['Identity_1'];

              if (landmarkOutput && presenceOutput) {
                const rawLandmarks = landmarkOutput.data as Float32Array;
                const presenceLogit = (presenceOutput.data as Float32Array)[0];

                // Compute 3D head pose and quality-aware confidence (Condition 2)
                gaze = estimateHeadPoseAndGaze(rawLandmarks, presenceLogit, face.score);
              }
            }
          }
        } catch (landmarkErr) {
          // CONDITION 3: Graceful degradation for landmark model failures
          // If landmark model inference throws, gaze is silently marked null;
          // face detection continues unaffected.
          console.warn("[Worker] Landmark inference failed, degrading gaze gracefully:", landmarkErr);
          gaze = null;
        }
      }

      self.postMessage({ type: 'DETECT_DONE', id, result: { faces, gaze } });
    } catch (e) {
      console.error("Worker face detection failed", e);
      if (bitmap && bitmap.close) bitmap.close();
      self.postMessage({ type: 'DETECT_DONE', id, result: { faces: [], gaze: null } });
    }
  }
};

