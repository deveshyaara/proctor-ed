# AI Proctoring Architecture & Runtime Documentation

This document describes the on-device AI proctoring pipeline in ProctorED, model specifications, hardware acceleration constraints, and gaze tracking algorithms.

---

## 1. Model Manifest & Provenance

ProctorED runs a multi-model vision pipeline completely off-thread in a dedicated WebWorker:

| Model Role | Model Name / ID | Weights File | Input Shape & Layout | Output Shapes | License & Source | SHA256 Hash |
|---|---|---|---|---|---|---|
| **Face Detection** | UltraFace RFB-320 (`ultra-light-fast-320`) | `/models/face/ultra-light-fast-320.onnx` | `[1, 3, 240, 320]` (NCHW, float32, normalized [-1, 1]) | `scores: [1, 4420, 2]`, `boxes: [1, 4420, 4]` | MIT (Linzaer) | `34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017` |
| **Facial Landmarks & Gaze** | MediaPipe Face Landmarker (`mediapipe-face-landmark`) | `/models/face/face_landmark.onnx` | `[1, 256, 256, 3]` (NHWC, float32, normalized [0.0, 1.0]) | `Identity: [1, 1, 1, 1434]` (478 3D points), `Identity_1: [1, 1, 1, 1]` (presence logit), `Identity_2: [1]` | Apache-2.0 (Google MediaPipe / takoyakisoft ONNX) | `38ea4d75bffea5a72cb93ec027ddeaf31763049ffa57ec944fa3840119083bec` |

---

## 2. Hardware Acceleration & WebGPU Constraints (Watch Item 1)

### Execution Provider Hierarchy
The runtime initializes sessions in the WebWorker following a fallback chain:
1. **WebGPU (`webgpu`)**: High-performance GPU compute shaders via Dawn / JSEP.
2. **WASM SIMD (`wasm`)**: WebAssembly CPU execution with SIMD acceleration.

### WebGPU Kernel Fusion Constraint (`graphOptimizationLevel`)
During Phase 7a benchmarking, ONNX Runtime WebGPU's graph optimizer failed when generating compute kernels for the RFB-320 model:
```
Error: [WebGPU] Kernel "[Mul] " failed. Error: Failed to generate kernel's output[0] with dims [1,4420,2]
```
This is a known bug in ONNX Runtime Web's WebGPU JSEP kernel code generator: when graph optimizations are enabled (`'all'` or `'basic'`), constant-folding and node-fusion rewrite intermediate multiplication nodes into an unhandled multi-dimensional broadcasting layout on `[1, 4420, 2]`.

**Optimization Scoping:**
- **Face Detector Session (`FACE_DETECTION`)**: Configured with `graphOptimizationLevel: 'disabled'` on WebGPU to bypass the fusion bug.
- **Landmark Session (`FACE_LANDMARK`)**: Verified to compile and run cleanly with `graphOptimizationLevel: 'all'`. WebGPU session options are therefore **scoped per-model** in `InferenceSessionManager`.
- **Latency Characteristic**: While WebGPU compiles cleanly for both models, WASM SIMD achieves 15.9ms latency for the landmark model vs WebGPU's ~273ms due to the high number of depthwise separable convolution dispatches and texture transfers. The system supports both seamlessly.

---

## 3. Gaze & Head Pose Tracking Specification (Phase 7b)

### 3.1 Preprocessing Pipeline (Condition 5)
- **Reference**: Official Google MediaPipe Face Landmarker specification (`https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker`).
- **Face Crop**: When 1 face is detected, the bounding box is expanded by `FACE_CROP_MARGIN_PCT` (default: 25%) and clamped to frame boundaries.
- **Resize & Normalization**: The cropped face is drawn onto an internal $256 \times 256$ `OffscreenCanvas`. Pixel values $[0, 255]$ are normalized strictly to $[0.0, 1.0]$ in NHWC format (`[1, 256, 256, 3]`).

### 3.2 3D Head Pose Geometry
From the 478 MediaPipe 3D landmark points, key anatomical landmarks are extracted:
- **Nose Tip**: Landmark 1 (or 4)
- **Chin**: Landmark 152
- **Glabella / Forehead**: Landmark 10
- **Left Eye Corners**: 33 (outer), 133 (inner)
- **Right Eye Corners**: 362 (inner), 263 (outer)
- **Mouth Corners**: 61 (left), 291 (right)

Angles are calculated in degrees:
- **Yaw (Horizontal turn)**: Derived from the lateral position of the nose tip relative to the eye midpoint, normalized by inter-ocular distance.
- **Pitch (Vertical tilt)**: Derived from the vertical displacement of the nose tip relative to the eye-to-mouth baseline.
- **Roll (Tilt)**: In-plane rotation angle of the eye-to-eye axis relative to the horizontal plane.

### 3.3 Centralized Thresholds & Calibration Disclaimer (Condition 1)
All angle and timing thresholds are centralized in `lib/ai/config.ts`:
```typescript
GAZE_DEVIATION: {
  MIN_CONFIDENCE: 0.7,
  SUSTAINED_MS: 3000,
  RECOVERY_MS: 1000,
  YAW_THRESHOLD_DEG: 25,
  PITCH_UP_THRESHOLD_DEG: 25,
  PITCH_DOWN_THRESHOLD_DEG: -20,
  FACE_CROP_MARGIN_PCT: 25
}
```
> [!NOTE]
> **Calibration Disclaimer**: The default angle thresholds ($|\text{yaw}| > 25^\circ$, $\text{pitch} > 25^\circ$, $\text{pitch} < -20^\circ$) represent initial baselines calibrated for typical desktop webcam geometry (~50–70cm from display). Varying camera mount heights, laptop angles, and multi-monitor setups may require institutional calibration.

### 3.4 Quality-Aware Confidence Calculation (Condition 2)
To prevent noisy, poor-quality landmark detections from falsely registering high-confidence gaze events:
1. **Landmark Quality**: `Identity_1` outputs a raw logit representing face presence. This is passed through a sigmoid function:
   $$\text{landmarkConfidence} = \frac{1}{1 + e^{-\text{Identity}_1[0]}}$$
2. **Detection Quality**: The face detector's bounding-box score $\text{faceScore} \in [0.7, 1.0]$.
3. **Composite Confidence**:
   $$\text{confidence} = \text{faceScore} \times \text{landmarkConfidence} \times \min(1.0, \text{angularDeviationFactor})$$
If bounding-box confidence is low or landmark presence is degraded, the confidence drops below `MIN_CONFIDENCE` (0.7), preventing false-positive violations.

### 3.5 Multi-Face Gaze Behavior (Condition 4)
Gaze tracking is **intentionally skipped** when the detected face count is 0 or $\ge 2$:
- **Rationale**: When multiple people are in frame, tracking gaze for an arbitrary face is ambiguous and meaningless. `MULTIPLE_PEOPLE` is already a higher-severity signal (HIGH) evaluated independently.
- Gaze tracking executes **strictly when $\text{faceCount} === 1$**.

### 3.6 Independent Graceful Degradation (Condition 3)
If `face_landmark.onnx` fails to load, times out, or throws during inference:
- Gaze detection degrades gracefully (`gaze: null`, `GAZE_DETECTION_ENABLED` effectively inactive for that session).
- Face detection (`PERSON_MISSING`, `MULTIPLE_PEOPLE`) continues operating normally without interruption or worker crashes.

---

## 4. UI Isolation & Re-Render Prevention (Watch Item 2)
To prevent inference frame ticks from impacting the exam question/option list:
- High-frequency gaze state is encapsulated in a memoized sub-component inside `components/exam/ProctoringCameraFeed.tsx`.
- `ExamEngine` and `QuestionCard` remain completely decoupled from per-frame gaze coordinates.
