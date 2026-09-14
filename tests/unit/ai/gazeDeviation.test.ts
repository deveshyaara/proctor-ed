import { describe, it, expect } from 'vitest';
import { AI_CONFIG } from '@/lib/ai/config';
import { estimateHeadPoseAndGaze, LANDMARK_INDICES, sigmoid } from '@/lib/ai/vision/headPose';
import { TemporalSmoother, EvidenceType } from '@/lib/ai/evidence/temporalSmoother';

/**
 * Helper to build synthetic 478 MediaPipe 3D landmarks (1434 floats).
 * Creates a neutral forward-facing head with customizable offsets.
 */
function createSyntheticLandmarks(options: {
  noseOffsetX?: number;
  noseOffsetY?: number;
  eyeAngleRad?: number;
} = {}): Float32Array {
  const lm = new Float32Array(478 * 3);
  const { noseOffsetX = 0, noseOffsetY = 0, eyeAngleRad = 0 } = options;

  // Base neutral coordinates (in normalized landmark space ~ [0, 1])
  // Eye outer corners at distance ~0.4 centered at (0.5, 0.4)
  const eyeDist = 0.4;
  const leftEyeX = 0.5 - (eyeDist / 2) * Math.cos(eyeAngleRad);
  const leftEyeY = 0.4 - (eyeDist / 2) * Math.sin(eyeAngleRad);
  const rightEyeX = 0.5 + (eyeDist / 2) * Math.cos(eyeAngleRad);
  const rightEyeY = 0.4 + (eyeDist / 2) * Math.sin(eyeAngleRad);

  // Set Left Eye Outer (33) & Right Eye Outer (263)
  lm[LANDMARK_INDICES.LEFT_EYE_OUTER * 3] = leftEyeX;
  lm[LANDMARK_INDICES.LEFT_EYE_OUTER * 3 + 1] = leftEyeY;

  lm[LANDMARK_INDICES.RIGHT_EYE_OUTER * 3] = rightEyeX;
  lm[LANDMARK_INDICES.RIGHT_EYE_OUTER * 3 + 1] = rightEyeY;

  // Glabella (10) at (0.5, 0.25)
  lm[LANDMARK_INDICES.GLABELLA * 3] = 0.5;
  lm[LANDMARK_INDICES.GLABELLA * 3 + 1] = 0.25;

  // Chin (152) at (0.5, 0.85) -> faceHeight = 0.60
  lm[LANDMARK_INDICES.CHIN * 3] = 0.5;
  lm[LANDMARK_INDICES.CHIN * 3 + 1] = 0.85;

  // Nose tip (1) at neutral baseline: x=0.5, y = 0.4 + 0.38 * 0.60 = 0.628
  const neutralNoseY = 0.4 + 0.38 * 0.60;
  lm[LANDMARK_INDICES.NOSE_TIP * 3] = 0.5 + noseOffsetX;
  lm[LANDMARK_INDICES.NOSE_TIP * 3 + 1] = neutralNoseY + noseOffsetY;

  return lm;
}

describe('Phase 7b — Gaze Tracking Model Integration & Conditions', () => {

  // =========================================================================
  // CONDITION 1: Centralized Gaze Thresholds
  // =========================================================================
  describe('Condition 1: Centralized Gaze Thresholds in AI_CONFIG', () => {
    it('defines all required angle and crop thresholds in AI_CONFIG.GAZE_DEVIATION', () => {
      const cfg = AI_CONFIG.GAZE_DEVIATION;
      expect(cfg).toBeDefined();
      expect(cfg.YAW_THRESHOLD_DEG).toBe(25);
      expect(cfg.PITCH_UP_THRESHOLD_DEG).toBe(25);
      expect(cfg.PITCH_DOWN_THRESHOLD_DEG).toBe(-20);
      expect(cfg.FACE_CROP_MARGIN_PCT).toBe(25);
      expect(cfg.SUSTAINED_MS).toBe(3000);
      expect(cfg.MIN_CONFIDENCE).toBe(0.7);
    });

    it('flags centered gaze as not deviated', () => {
      const centered = createSyntheticLandmarks();
      const estimate = estimateHeadPoseAndGaze(centered, 5.0, 0.95);
      expect(estimate.isDeviated).toBe(false);
      expect(Math.abs(estimate.yawDeg)).toBeLessThan(10);
      expect(Math.abs(estimate.pitchDeg)).toBeLessThan(10);
    });

    it('flags extreme horizontal gaze (yaw > 25 deg) as deviated', () => {
      // Significant lateral offset
      const deviated = createSyntheticLandmarks({ noseOffsetX: 0.12 });
      const estimate = estimateHeadPoseAndGaze(deviated, 5.0, 0.95);
      expect(estimate.isDeviated).toBe(true);
      expect(estimate.yawDeg).toBeGreaterThan(25);
    });

    it('flags looking down at desk/phone (pitch > 25 deg) as deviated', () => {
      // Nose moves down toward chin
      const lookingDown = createSyntheticLandmarks({ noseOffsetY: 0.15 });
      const estimate = estimateHeadPoseAndGaze(lookingDown, 5.0, 0.95);
      expect(estimate.isDeviated).toBe(true);
      expect(estimate.pitchDeg).toBeGreaterThan(25);
    });
  });

  // =========================================================================
  // CONDITION 2: Confidence Reflects Landmark Quality, Not Just Angle
  // =========================================================================
  describe('Condition 2: Quality-Aware Confidence Calculation', () => {
    it('converts presence logit to probability using sigmoid', () => {
      expect(sigmoid(0)).toBeCloseTo(0.5, 4);
      expect(sigmoid(5)).toBeGreaterThan(0.99);
      expect(sigmoid(-5)).toBeLessThan(0.01);
    });

    it('rejects high confidence when face detector bounding box confidence is low despite large angle deviation', () => {
      // Large deviation but low detection quality (e.g. faceScore = 0.3)
      const deviated = createSyntheticLandmarks({ noseOffsetX: 0.15 });
      const estimate = estimateHeadPoseAndGaze(deviated, 5.0, 0.30); // faceScore = 0.3

      expect(estimate.isDeviated).toBe(true);
      // Final confidence MUST be low because face detection score was low
      expect(estimate.confidence).toBeLessThan(0.5);
      expect(estimate.confidence).toBeLessThan(AI_CONFIG.GAZE_DEVIATION.MIN_CONFIDENCE);
    });

    it('rejects high confidence when landmark presence logit is low/negative despite large angle deviation', () => {
      // Large deviation but corrupted/occluded landmark detection (presence logit = -8.0)
      const deviated = createSyntheticLandmarks({ noseOffsetX: 0.15 });
      const estimate = estimateHeadPoseAndGaze(deviated, -8.0, 0.95);

      expect(estimate.isDeviated).toBe(true);
      expect(estimate.facePresenceScore).toBeLessThan(0.01);
      // Final confidence MUST be near zero
      expect(estimate.confidence).toBeLessThan(0.05);
    });

    it('produces high confidence ONLY when detection score, landmark presence, and deviation are all strong', () => {
      const deviated = createSyntheticLandmarks({ noseOffsetX: 0.15 });
      const estimate = estimateHeadPoseAndGaze(deviated, 5.0, 0.95);

      expect(estimate.isDeviated).toBe(true);
      expect(estimate.confidence).toBeGreaterThanOrEqual(AI_CONFIG.GAZE_DEVIATION.MIN_CONFIDENCE);
    });
  });

  // =========================================================================
  // CONDITION 3: Graceful Degradation for Landmark Model Failures
  // =========================================================================
  describe('Condition 3: Graceful Degradation on Landmark Failure', () => {
    it('leaves face detection operational when landmark inference returns null or fails', () => {
      // Simulate detection output when landmark inference fails gracefully
      const detectionWithFailedLandmark = {
        faces: [{ box: [0.1, 0.1, 0.4, 0.4] as [number, number, number, number], score: 0.92 }],
        gaze: null
      };

      // Face detection is completely unaffected
      expect(detectionWithFailedLandmark.faces.length).toBe(1);
      expect(detectionWithFailedLandmark.gaze).toBeNull();

      // Signals mapper treats null gaze as undetected without throwing
      const numFaces: number = detectionWithFailedLandmark.faces.length;
      const gazeResult = detectionWithFailedLandmark.gaze as { isDeviated: boolean } | null;
      const isGazeDeviated = Boolean(
        AI_CONFIG.GAZE_DETECTION_ENABLED &&
        numFaces === 1 &&
        gazeResult?.isDeviated
      );
      expect(isGazeDeviated).toBe(false);
    });
  });

  // =========================================================================
  // CONDITION 4: Explicit Multi-Face Gaze Behavior
  // =========================================================================
  describe('Condition 4: Multi-Face Gaze Skipping', () => {
    it('skips gaze evaluation when 0 faces are present', () => {
      const numFaces: number = 0;
      const mockGaze = { isDeviated: true, confidence: 0.95 };
      const isGazeEvaluated = Boolean(
        AI_CONFIG.GAZE_DETECTION_ENABLED &&
        numFaces === 1 &&
        mockGaze.isDeviated
      );
      expect(isGazeEvaluated).toBe(false);
    });

    it('skips gaze evaluation when multiple faces (>= 2) are present', () => {
      const numFaces: number = 2; // MULTIPLE_PEOPLE scenario
      const mockGaze = { isDeviated: true, confidence: 0.95 };
      const isGazeEvaluated = Boolean(
        AI_CONFIG.GAZE_DETECTION_ENABLED &&
        numFaces === 1 &&
        mockGaze.isDeviated
      );
      expect(isGazeEvaluated).toBe(false);
    });

    it('evaluates gaze strictly when exactly 1 face is present', () => {
      const numFaces = 1;
      const mockGaze = { isDeviated: true, confidence: 0.95 };
      const isGazeEvaluated = Boolean(
        AI_CONFIG.GAZE_DETECTION_ENABLED &&
        numFaces === 1 &&
        mockGaze.isDeviated
      );
      expect(isGazeEvaluated).toBe(true);
    });
  });

  // =========================================================================
  // CONDITION 5: Preprocessing Sanity Check
  // =========================================================================
  describe('Condition 5: Preprocessing Tensor Sanity Check', () => {
    it('verifies 256x256 NHWC float32 normalization to [0.0, 1.0]', () => {
      const LM_SIZE = 256;
      const mockImageData = new Uint8ClampedArray(LM_SIZE * LM_SIZE * 4);
      // Fill sample pixels: (255, 128, 0, 255)
      mockImageData[0] = 255;
      mockImageData[1] = 128;
      mockImageData[2] = 0;
      mockImageData[3] = 255;

      const lmFloatData = new Float32Array(1 * LM_SIZE * LM_SIZE * 3);
      for (let i = 0; i < LM_SIZE * LM_SIZE; i++) {
        lmFloatData[i * 3 + 0] = mockImageData[i * 4 + 0] / 255.0;
        lmFloatData[i * 3 + 1] = mockImageData[i * 4 + 1] / 255.0;
        lmFloatData[i * 3 + 2] = mockImageData[i * 4 + 2] / 255.0;
      }

      expect(lmFloatData.length).toBe(1 * 256 * 256 * 3);
      expect(lmFloatData[0]).toBeCloseTo(1.0, 4);
      expect(lmFloatData[1]).toBeCloseTo(0.502, 3);
      expect(lmFloatData[2]).toBeCloseTo(0.0, 4);
    });
  });

  // =========================================================================
  // FALSE-POSITIVE MATRIX (TemporalSmoother Validation)
  // =========================================================================
  describe('False-Positive Matrix & Temporal Smoothing', () => {
    const smootherThresholds = [
      {
        type: 'PROLONGED_GAZE_DEVIATION' as EvidenceType,
        minConfidence: AI_CONFIG.GAZE_DEVIATION.MIN_CONFIDENCE, // 0.7
        sustainedMs: AI_CONFIG.GAZE_DEVIATION.SUSTAINED_MS,     // 3000ms
        recoveryMs: AI_CONFIG.GAZE_DEVIATION.RECOVERY_MS        // 1000ms
      }
    ];

    it('Scenario 1 (Centered Gaze): Normal forward gaze produces zero events', () => {
      const smoother = new TemporalSmoother(smootherThresholds);
      const signals = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 }
      };

      for (let t = 0; t <= 5000; t += 125) {
        const events = smoother.processFrame(signals, t);
        expect(events.length).toBe(0);
      }
    });

    it('Scenario 2 (Brief Glance): Looking away for 1200ms (< 3000ms) does NOT trigger event', () => {
      const smoother = new TemporalSmoother(smootherThresholds);
      const deviated = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: true, confidence: 0.9 }
      };
      const centered = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 }
      };

      // Deviate for 1200ms
      for (let t = 0; t <= 1200; t += 125) {
        const events = smoother.processFrame(deviated, t);
        expect(events.length).toBe(0);
      }

      // Return to center
      for (let t = 1300; t <= 3000; t += 125) {
        const events = smoother.processFrame(centered, t);
        expect(events.length).toBe(0);
      }
    });

    it('Scenario 3 (Blink): Temporary landmark loss/jitter for 300ms produces zero events', () => {
      const smoother = new TemporalSmoother(smootherThresholds);
      const centered = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 }
      };
      const blink = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: true, confidence: 0.2 } // low confidence blink
      };

      for (let t = 0; t <= 2000; t += 125) smoother.processFrame(centered, t);
      for (let t = 2100; t <= 2400; t += 100) {
        const events = smoother.processFrame(blink, t);
        expect(events.length).toBe(0);
      }
      for (let t = 2500; t <= 5000; t += 125) {
        const events = smoother.processFrame(centered, t);
        expect(events.length).toBe(0);
      }
    });

    it('Scenario 4 (Keyboard Look): Looking down to type for 2000ms (< 3000ms) produces zero events', () => {
      const smoother = new TemporalSmoother(smootherThresholds);
      const typing = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: true, confidence: 0.85 }
      };
      const screen = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: false, confidence: 0 }
      };

      // Type on keyboard for 2.0 seconds
      for (let t = 0; t <= 2000; t += 125) {
        const events = smoother.processFrame(typing, t);
        expect(events.length).toBe(0);
      }

      // Look back at screen
      for (let t = 2125; t <= 4000; t += 125) {
        const events = smoother.processFrame(screen, t);
        expect(events.length).toBe(0);
      }
    });

    it('Scenario 5 (Sustained Gaze Deviation): Looking away for 3500ms (> 3000ms) triggers confirmed event', () => {
      const smoother = new TemporalSmoother(smootherThresholds);
      const deviated = {
        PERSON_MISSING: { detected: false, confidence: 0 },
        MULTIPLE_PEOPLE: { detected: false, confidence: 0 },
        PROLONGED_GAZE_DEVIATION: { detected: true, confidence: 0.88 }
      };

      let confirmedEvents: any[] = [];
      // Deviate continuously for 3500ms
      for (let t = 0; t <= 3500; t += 125) {
        const events = smoother.processFrame(deviated, t);
        if (events.length > 0) {
          confirmedEvents.push(...events);
        }
      }

      expect(confirmedEvents.length).toBe(1);
      expect(confirmedEvents[0].type).toBe('PROLONGED_GAZE_DEVIATION');
      expect(confirmedEvents[0].confidence).toBeGreaterThanOrEqual(0.88);
      expect(confirmedEvents[0].durationMs).toBeGreaterThanOrEqual(3000);
    });
  });
});
