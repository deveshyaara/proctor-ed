/**
 * AI proctoring model configuration.
 *
 * Update PROCTORING_MODEL when the bundled ONNX model changes.
 * This is the single point of truth referenced by ExamEngine and any
 * future server-side model version checks.
 */
export const PROCTORING_MODEL = {
  name: "blazeface-1.0",
  version: "1.0",
} as const;

export type ProctoringModelConfig = typeof PROCTORING_MODEL;
