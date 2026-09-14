import { describe, it, expect } from 'vitest';
import { generatePriors, convertLocationsToBoxes, iouOf, nms } from '../../../lib/ai/postprocessing/nms';

describe('NMS and Prior Decoding', () => {
  it('generates the correct number of prior boxes', () => {
    const priors = generatePriors();
    expect(priors.length).toBe(4420);
    // Spot check the first prior: x, y, w, h should be between 0 and 1
    expect(priors[0][0]).toBeGreaterThanOrEqual(0);
    expect(priors[0][0]).toBeLessThanOrEqual(1);
  });

  it('correctly converts locations to boxes', () => {
    // Single mock prior: center (0.5, 0.5), width 0.1, height 0.1
    const mockPriors = [[0.5, 0.5, 0.1, 0.1]];
    // No offset, no scale: center_variance=0.1, size_variance=0.2
    // If dx=0, dy=0, dw=0, dh=0, then cx=0.5, cy=0.5, w=0.1, h=0.1
    // Box will be xmin=0.45, ymin=0.45, xmax=0.55, ymax=0.55
    const locations = new Float32Array([0, 0, 0, 0]);
    const boxes = convertLocationsToBoxes(locations, mockPriors);

    expect(boxes.length).toBe(1);
    expect(boxes[0][0]).toBeCloseTo(0.45);
    expect(boxes[0][1]).toBeCloseTo(0.45);
    expect(boxes[0][2]).toBeCloseTo(0.55);
    expect(boxes[0][3]).toBeCloseTo(0.55);

    // With offset: dx = 1 -> cx = 1 * 0.1 * 0.1 + 0.5 = 0.51
    // dw = 1 -> w = exp(1 * 0.2) * 0.1 ≈ 1.221 * 0.1 = 0.1221
    const locations2 = new Float32Array([1, 0, 1, 0]);
    const boxes2 = convertLocationsToBoxes(locations2, mockPriors);
    
    expect(boxes2[0][0]).toBeCloseTo(0.51 - 0.1221 / 2);
    expect(boxes2[0][2]).toBeCloseTo(0.51 + 0.1221 / 2);
  });

  it('correctly calculates IoU', () => {
    // Exact overlap
    const boxA = [0, 0, 10, 10];
    const boxB = [0, 0, 10, 10];
    expect(iouOf(boxA, boxB)).toBeCloseTo(1);

    // No overlap
    const boxC = [20, 20, 30, 30];
    expect(iouOf(boxA, boxC)).toBeCloseTo(0);

    // Half overlap: boxA is 100 area. boxD is 100 area.
    // Overlap is x: 5 to 10 (width=5), y: 0 to 10 (height=10) => Area 50
    // Union is 100 + 100 - 50 = 150
    // IoU = 50 / 150 = 1/3
    const boxD = [5, 0, 15, 10];
    expect(iouOf(boxA, boxD)).toBeCloseTo(1 / 3);
  });

  it('performs Non-Maximum Suppression correctly', () => {
    // 3 boxes
    // box0 and box1 overlap heavily. box0 has higher score. box1 should be suppressed.
    // box2 is completely separate and should be kept.
    const boxes = [
      [0, 0, 10, 10],     // box0 (Score 0.9)
      [1, 1, 11, 11],     // box1 (Score 0.8) -> IOU is high, should be suppressed
      [20, 20, 30, 30]    // box2 (Score 0.7) -> No overlap, should be kept
    ];
    const scores = [0.9, 0.8, 0.7];
    const iouThreshold = 0.5;

    const keepIndices = nms(boxes, scores, iouThreshold);

    // We expect to keep index 0 and 2.
    expect(keepIndices.length).toBe(2);
    expect(keepIndices).toContain(0);
    expect(keepIndices).toContain(2);
    expect(keepIndices).not.toContain(1);
  });
});
