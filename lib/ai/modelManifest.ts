export const MODEL_MANIFEST = {
  FACE_DETECTION: {
    id: "ultra-light-fast-320",
    path: "/models/face/ultra-light-fast-320.onnx",
    version: "0f9ca4a9fc80170fd505168fd1132b837141f7df",
    inputShape: [1, 3, 240, 320], // NCHW, height=240, width=320
    hash: "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017",
    license: "MIT (https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/blob/master/LICENSE)",
  },
  FACE_LANDMARK: {
    id: "mediapipe-face-landmark",
    path: "/models/face/face_landmark.onnx",
    version: "3f3d0bf8e56f4474bc670b9eee1b697856241ccb",
    inputShape: [1, 256, 256, 3], // NHWC, float32 normalized [0.0, 1.0]
    hash: "38ea4d75bffea5a72cb93ec027ddeaf31763049ffa57ec944fa3840119083bec",
    license: "Apache-2.0 (Google MediaPipe official task bundle, takoyakisoft ONNX conversion)",
    referenceSource: "https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker",
  },
};
