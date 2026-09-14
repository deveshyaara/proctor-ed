import { AI_CONFIG } from '../config';

export interface GazeEstimate {
  yawDeg: number;       // Horizontal turn (left: negative, right: positive)
  pitchDeg: number;     // Vertical tilt (up: negative, down: positive)
  rollDeg: number;      // In-plane head tilt
  isDeviated: boolean;  // True if angles exceed configured thresholds
  confidence: number;   // Composite quality & deviation confidence [0, 1]
  facePresenceScore: number; // Sigmoid confidence from landmark model
}

/**
 * Sigmoid activation to convert raw logit to probability [0, 1].
 */
export function sigmoid(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

/**
 * Key landmark indices for 478-point MediaPipe FaceMesh model:
 * - Nose tip: 1 (or 4)
 * - Chin: 152
 * - Glabella (between eyes/eyebrows): 10
 * - Left eye outer corner: 33
 * - Left eye inner corner: 133
 * - Right eye inner corner: 362
 * - Right eye outer corner: 263
 * - Mouth left corner: 61
 * - Mouth right corner: 291
 */
export const LANDMARK_INDICES = {
  NOSE_TIP: 1,
  CHIN: 152,
  GLABELLA: 10,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
};

/**
 * Estimates 3D head pose and gaze deviation from MediaPipe 478 3D landmarks.
 *
 * @param landmarks 1434-length Float32Array containing (x, y, z) for 478 points.
 * @param presenceLogit Raw logit from Identity_1 output tensor.
 * @param faceScore Confidence score from the face detector bounding box [0, 1].
 */
export function estimateHeadPoseAndGaze(
  landmarks: Float32Array,
  presenceLogit: number,
  faceScore: number = 1.0
): GazeEstimate {
  // Helper to extract (x, y, z) for a given landmark index
  const getPoint = (idx: number) => {
    const offset = idx * 3;
    return {
      x: landmarks[offset],
      y: landmarks[offset + 1],
      z: landmarks[offset + 2],
    };
  };

  const nose = getPoint(LANDMARK_INDICES.NOSE_TIP);
  const leftEyeOuter = getPoint(LANDMARK_INDICES.LEFT_EYE_OUTER);
  const rightEyeOuter = getPoint(LANDMARK_INDICES.RIGHT_EYE_OUTER);
  const chin = getPoint(LANDMARK_INDICES.CHIN);
  const glabella = getPoint(LANDMARK_INDICES.GLABELLA);

  // 1. Calculate eye baseline and midpoint
  const eyeMidpoint = {
    x: (leftEyeOuter.x + rightEyeOuter.x) / 2,
    y: (leftEyeOuter.y + rightEyeOuter.y) / 2,
    z: (leftEyeOuter.z + rightEyeOuter.z) / 2,
  };

  const interOcularDist = Math.hypot(
    rightEyeOuter.x - leftEyeOuter.x,
    rightEyeOuter.y - leftEyeOuter.y
  );

  const faceHeight = Math.hypot(
    chin.x - glabella.x,
    chin.y - glabella.y
  );

  const safeEyeDist = Math.max(interOcularDist, 1e-4);
  const safeFaceHeight = Math.max(faceHeight, 1e-4);

  // 2. Roll: In-plane rotation angle between eyes
  const rollRad = Math.atan2(
    rightEyeOuter.y - leftEyeOuter.y,
    rightEyeOuter.x - leftEyeOuter.x
  );
  const rollDeg = (rollRad * 180) / Math.PI;

  // 3. Yaw: Lateral offset of nose tip relative to eye midpoint, scaled to degrees
  // When looking straight forward, nose.x ~= eyeMidpoint.x
  const yawRatio = (nose.x - eyeMidpoint.x) / (safeEyeDist * 0.5);
  const clampedYawRatio = Math.max(-1.0, Math.min(1.0, yawRatio));
  const yawDeg = Math.asin(clampedYawRatio) * (180 / Math.PI) * 1.5; // geometric scale factor

  // 4. Pitch: Vertical offset of nose tip relative to eye-to-chin baseline
  // Looking down moves nose tip closer to chin (positive pitch in this coordinate system)
  // Looking up moves nose tip closer to eyes (negative pitch)
  const verticalRatio = (nose.y - eyeMidpoint.y) / safeFaceHeight;
  // Baseline ratio for a neutral face is approximately 0.35 - 0.40
  const neutralPitchBaseline = 0.38;
  const pitchDiff = verticalRatio - neutralPitchBaseline;
  const pitchDeg = pitchDiff * 140; // calibrated angular scale

  // 5. Threshold checks using centralized AI_CONFIG (Condition 1)
  const cfg = AI_CONFIG.GAZE_DEVIATION;
  const isYawDeviated = Math.abs(yawDeg) > cfg.YAW_THRESHOLD_DEG;
  const isPitchDeviated =
    pitchDeg > cfg.PITCH_UP_THRESHOLD_DEG || pitchDeg < cfg.PITCH_DOWN_THRESHOLD_DEG;

  const isDeviated = isYawDeviated || isPitchDeviated;

  // 6. Quality-Aware Confidence Calculation (Condition 2)
  // Incorporate face presence sigmoid logit + face detector bounding box score
  const facePresenceScore = sigmoid(presenceLogit);
  
  // Quality gate: If face detector confidence or landmark presence is poor, quality drops
  const detectionQuality = Math.max(0, Math.min(1.0, faceScore));
  const compositeQuality = detectionQuality * facePresenceScore;

  // Deviation intensity factor: Higher when clearly beyond threshold
  let deviationIntensity = 0;
  if (isDeviated) {
    const yawExcess = Math.max(0, Math.abs(yawDeg) - cfg.YAW_THRESHOLD_DEG);
    const pitchExcess = Math.max(
      0,
      pitchDeg > cfg.PITCH_UP_THRESHOLD_DEG
        ? pitchDeg - cfg.PITCH_UP_THRESHOLD_DEG
        : pitchDeg < cfg.PITCH_DOWN_THRESHOLD_DEG
        ? cfg.PITCH_DOWN_THRESHOLD_DEG - pitchDeg
        : 0
    );
    const maxExcess = Math.max(yawExcess, pitchExcess);
    deviationIntensity = Math.min(1.0, 0.7 + (maxExcess / 20) * 0.3);
  }

  // Final confidence is gated by composite detection quality (Condition 2)
  const confidence = Number((compositeQuality * (isDeviated ? deviationIntensity : 1.0)).toFixed(3));

  return {
    yawDeg: Number(yawDeg.toFixed(1)),
    pitchDeg: Number(pitchDeg.toFixed(1)),
    rollDeg: Number(rollDeg.toFixed(1)),
    isDeviated,
    confidence,
    facePresenceScore: Number(facePresenceScore.toFixed(3)),
  };
}
