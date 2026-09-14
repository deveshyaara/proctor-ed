export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const IMAGE_WIDTH = 320;
const IMAGE_HEIGHT = 240;
const CENTER_VARIANCE = 0.1;
const SIZE_VARIANCE = 0.2;
const FEATURE_MAP_W = [40, 20, 10, 5];
const FEATURE_MAP_H = [30, 15, 8, 4];
const MIN_BOXES = [
  [10, 16, 24],
  [32, 48],
  [64, 96],
  [128, 192, 256],
];
const SHRINKAGE_W = FEATURE_MAP_W.map((w) => IMAGE_WIDTH / w);
const SHRINKAGE_H = FEATURE_MAP_H.map((h) => IMAGE_HEIGHT / h);

let cachedPriors: number[][] | null = null;

/**
 * Generates the prior boxes based on the network configuration.
 * Returns an array of [x_center, y_center, width, height] (all normalized to 0-1).
 */
export function generatePriors(): number[][] {
  if (cachedPriors) return cachedPriors;

  const priors: number[][] = [];
  for (let index = 0; index < FEATURE_MAP_W.length; index++) {
    const scale_w = IMAGE_WIDTH / SHRINKAGE_W[index];
    const scale_h = IMAGE_HEIGHT / SHRINKAGE_H[index];

    for (let j = 0; j < FEATURE_MAP_H[index]; j++) {
      for (let i = 0; i < FEATURE_MAP_W[index]; i++) {
        const x_center = (i + 0.5) / scale_w;
        const y_center = (j + 0.5) / scale_h;

        for (const min_box of MIN_BOXES[index]) {
          const w = min_box / IMAGE_WIDTH;
          const h = min_box / IMAGE_HEIGHT;
          priors.push([
            Math.max(0, Math.min(1, x_center)),
            Math.max(0, Math.min(1, y_center)),
            Math.max(0, Math.min(1, w)),
            Math.max(0, Math.min(1, h)),
          ]);
        }
      }
    }
  }

  cachedPriors = priors;
  return priors;
}

/**
 * Converts the network's regression location output into actual bounding boxes
 * using the pre-computed priors.
 *
 * locations: Float32Array of size (num_priors * 4) [dx, dy, dw, dh]
 * priors: array of size (num_priors) [[cx, cy, w, h]]
 * returns: array of size (num_priors) [[xmin, ymin, xmax, ymax]] (normalized)
 */
export function convertLocationsToBoxes(locations: Float32Array, priors: number[][]): number[][] {
  const numPriors = priors.length;
  const boxes: number[][] = [];

  for (let i = 0; i < numPriors; i++) {
    const p = priors[i];
    const locIdx = i * 4;

    const cx = locations[locIdx] * CENTER_VARIANCE * p[2] + p[0];
    const cy = locations[locIdx + 1] * CENTER_VARIANCE * p[3] + p[1];
    const w = Math.exp(locations[locIdx + 2] * SIZE_VARIANCE) * p[2];
    const h = Math.exp(locations[locIdx + 3] * SIZE_VARIANCE) * p[3];

    const xmin = cx - w / 2;
    const ymin = cy - h / 2;
    const xmax = cx + w / 2;
    const ymax = cy + h / 2;

    boxes.push([xmin, ymin, xmax, ymax]);
  }
  return boxes;
}

/**
 * Calculates the Intersection over Union (IoU) of two bounding boxes.
 * Box format: [xmin, ymin, xmax, ymax]
 */
export function iouOf(box0: number[], box1: number[], eps = 1e-5): number {
  const overlap_xmin = Math.max(box0[0], box1[0]);
  const overlap_ymin = Math.max(box0[1], box1[1]);
  const overlap_xmax = Math.min(box0[2], box1[2]);
  const overlap_ymax = Math.min(box0[3], box1[3]);

  const overlap_w = Math.max(0, overlap_xmax - overlap_xmin);
  const overlap_h = Math.max(0, overlap_ymax - overlap_ymin);
  const overlap_area = overlap_w * overlap_h;

  const area0 = Math.max(0, box0[2] - box0[0]) * Math.max(0, box0[3] - box0[1]);
  const area1 = Math.max(0, box1[2] - box1[0]) * Math.max(0, box1[3] - box1[1]);

  return overlap_area / (area0 + area1 - overlap_area + eps);
}

/**
 * Non-Maximum Suppression to filter out overlapping boxes.
 */
export function nms(boxes: number[][], scores: number[], iouThreshold: number): number[] {
  // Create an array of indices sorted by score descending
  const indices = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index);

  const keepIndices: number[] = [];
  const suppressed = new Array(boxes.length).fill(false);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (suppressed[idx]) continue;

    keepIndices.push(idx);

    for (let j = i + 1; j < indices.length; j++) {
      const jdx = indices[j];
      if (suppressed[jdx]) continue;

      const iou = iouOf(boxes[idx], boxes[jdx]);
      if (iou >= iouThreshold) {
        suppressed[jdx] = true;
      }
    }
  }

  return keepIndices;
}
