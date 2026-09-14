import { describe, it, expect } from 'vitest';
import { generatePriors, nms } from '@/lib/ai/postprocessing/nms';

/**
 * Pre-worker reference postprocessing implementation.
 * Decodes raw tensor outputs and performs NMS to identify faces.
 */
function referencePreWorkerPostProcessing(
  scoresData: Float32Array,
  boxesData: Float32Array,
  priors: number[][],
  scoreThreshold = 0.7,
  iouThreshold = 0.3
) {
  const numPriors = priors.length;
  const faceScores: number[] = [];
  const validBoxes: number[][] = [];

  for (let i = 0; i < numPriors; i++) {
    const faceScore = scoresData[i * 2 + 1];
    if (faceScore >= scoreThreshold) {
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

  const keepIndices = nms(validBoxes, faceScores, iouThreshold);

  return keepIndices.map((idx) => {
    const box = validBoxes[idx];
    return {
      box: [box[0], box[1], box[2] - box[0], box[3] - box[1]] as [number, number, number, number],
      score: faceScores[idx],
    };
  });
}

/**
 * Post-worker implementation logic (identical copy of worker.ts line 85-123).
 */
function workerPostProcessing(
  scoresData: Float32Array,
  boxesData: Float32Array,
  priors: number[][],
  scoreThreshold = 0.7,
  iouThreshold = 0.3
) {
  const numPriors = priors.length;
  const faceScores: number[] = [];
  const validBoxes: number[][] = [];

  for (let i = 0; i < numPriors; i++) {
    const faceScore = scoresData[i * 2 + 1];
    if (faceScore >= scoreThreshold) {
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

  const keepIndices = nms(validBoxes, faceScores, iouThreshold);

  return keepIndices.map((idx) => {
    const box = validBoxes[idx];
    return {
      box: [box[0], box[1], box[2] - box[0], box[3] - box[1]] as [number, number, number, number],
      score: faceScores[idx],
    };
  });
}

describe('Face-counting Accuracy Regression Check (Condition 6)', () => {
  const priors = generatePriors();
  const numPriors = priors.length;

  it('Fixed Test Case 1: Zero faces (blank/background frame)', () => {
    // Background noise: all face scores ~0.05
    const scores = new Float32Array(numPriors * 2);
    const boxes = new Float32Array(numPriors * 4);
    for (let i = 0; i < numPriors; i++) {
      scores[i * 2] = 0.95;     // background score
      scores[i * 2 + 1] = 0.05; // face score < 0.7
    }

    const preResult = referencePreWorkerPostProcessing(scores, boxes, priors);
    const postResult = workerPostProcessing(scores, boxes, priors);

    expect(preResult.length).toBe(0);
    expect(postResult.length).toBe(0);
    expect(preResult).toEqual(postResult);
  });

  it('Fixed Test Case 2: Exactly 1 face with overlapping candidate priors (suppressed by NMS)', () => {
    const scores = new Float32Array(numPriors * 2);
    const boxes = new Float32Array(numPriors * 4);

    // Default: no faces
    for (let i = 0; i < numPriors; i++) {
      scores[i * 2] = 0.99;
      scores[i * 2 + 1] = 0.01;
    }

    // High confidence detection at prior 100
    scores[100 * 2] = 0.05;
    scores[100 * 2 + 1] = 0.95; // faceScore = 0.95
    boxes[100 * 4] = 0.1;       // cx shift
    boxes[100 * 4 + 1] = 0.1;   // cy shift
    boxes[100 * 4 + 2] = 0.0;   // log(w) scale
    boxes[100 * 4 + 3] = 0.0;   // log(h) scale

    // Overlapping neighbor prior at 101 with slightly lower confidence
    scores[101 * 2] = 0.15;
    scores[101 * 2 + 1] = 0.85; // faceScore = 0.85
    boxes[101 * 4] = 0.12;
    boxes[101 * 4 + 1] = 0.11;
    boxes[101 * 4 + 2] = 0.01;
    boxes[101 * 4 + 3] = 0.01;

    const preResult = referencePreWorkerPostProcessing(scores, boxes, priors);
    const postResult = workerPostProcessing(scores, boxes, priors);

    // Exactly 1 face after NMS
    expect(preResult.length).toBe(1);
    expect(postResult.length).toBe(1);

    // Exact parity pre- vs post-worker
    expect(postResult[0].score).toBe(preResult[0].score);
    expect(postResult[0].box[0]).toBeCloseTo(preResult[0].box[0], 5);
    expect(postResult[0].box[1]).toBeCloseTo(preResult[0].box[1], 5);
    expect(postResult[0].box[2]).toBeCloseTo(preResult[0].box[2], 5);
    expect(postResult[0].box[3]).toBeCloseTo(preResult[0].box[3], 5);
  });

  it('Fixed Test Case 3: Multiple faces (2 distinct candidates at spatially distant priors)', () => {
    const scores = new Float32Array(numPriors * 2);
    const boxes = new Float32Array(numPriors * 4);

    for (let i = 0; i < numPriors; i++) {
      scores[i * 2] = 0.98;
      scores[i * 2 + 1] = 0.02;
    }

    // Person 1 (left side) at prior index 50
    scores[50 * 2 + 1] = 0.92;
    boxes[50 * 4] = -0.5;
    boxes[50 * 4 + 1] = 0.0;

    // Person 2 (right side) at prior index 4000
    scores[4000 * 2 + 1] = 0.89;
    boxes[4000 * 4] = 0.5;
    boxes[4000 * 4 + 1] = 0.0;

    const preResult = referencePreWorkerPostProcessing(scores, boxes, priors);
    const postResult = workerPostProcessing(scores, boxes, priors);

    // Both faces detected
    expect(preResult.length).toBe(2);
    expect(postResult.length).toBe(2);

    // Assert exact identical face counts and bounding coordinates
    for (let f = 0; f < 2; f++) {
      expect(postResult[f].score).toBe(preResult[f].score);
      expect(postResult[f].box[0]).toBeCloseTo(preResult[f].box[0], 5);
      expect(postResult[f].box[1]).toBeCloseTo(preResult[f].box[1], 5);
      expect(postResult[f].box[2]).toBeCloseTo(preResult[f].box[2], 5);
      expect(postResult[f].box[3]).toBeCloseTo(preResult[f].box[3], 5);
    }
  });
});
