export const AI_CONFIG = {
  ENABLED: process.env.NEXT_PUBLIC_AI_PROCTORING_ENABLED === "true",
  GAZE_DETECTION_ENABLED: true, // Enabled for Phase 7b with landmark model integration
  
  // Inference loop throttling
  TARGET_FPS: 8,
  
  // Temporal Smoother Constants & Gaze Deviation Thresholds
  // NOTE: These angle and timing thresholds are baseline initial defaults calibrated
  // for typical webcam setups (screen distance ~50-70cm). Real-world student variations
  // (e.g. multi-monitor, high/low camera mounts) may require future institutional calibration.
  GAZE_DEVIATION: {
    MIN_CONFIDENCE: 0.7,
    SUSTAINED_MS: 3000, // 3 seconds continuous to trigger (ignores blinks/brief looks)
    RECOVERY_MS: 1000,
    YAW_THRESHOLD_DEG: 25, // Horizontal deviation limit (looking left/right away from screen)
    PITCH_UP_THRESHOLD_DEG: 25, // Vertical upward deviation limit (looking up away)
    PITCH_DOWN_THRESHOLD_DEG: -20, // Vertical downward deviation limit (looking down at notes/phone)
    FACE_CROP_MARGIN_PCT: 25, // 25% padding around detected bounding box for landmark stability
  },
  FACE_PRESENCE: {
    MIN_CONFIDENCE: 0.6,
    SUSTAINED_MS: 3000, // 3 seconds no face to trigger
    RECOVERY_MS: 500,
  },
  MULTIPLE_FACES: {
    MIN_CONFIDENCE: 0.6,
    SUSTAINED_MS: 2000,
    RECOVERY_MS: 1000,
  },
  
  // Throttling events to the server
  EVENT_COOLDOWN_MS: 5000,
};
