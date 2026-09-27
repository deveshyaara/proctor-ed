/**
 * orchestrator/detectDuplicates.ts — Duplicate question detection.
 *
 * Prevents exact duplicates and near-duplicates via:
 * 1. Normalized string comparison (always)
 * 2. Cosine similarity on word-frequency vectors (lightweight semantic check)
 *
 * Called during generation (intra-batch and against existing questions).
 */

import type { GeneratedQuestion } from "../schemas.js";

/** Normalize a string for comparison */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build word frequency vector */
function wordFreq(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const word of normalize(text).split(" ")) {
    if (word.length > 2) freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  return freq;
}

/** Cosine similarity between two word frequency vectors */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [w, cnt] of a) {
    dot += cnt * (b.get(w) ?? 0);
    normA += cnt * cnt;
  }
  for (const [, cnt] of b) normB += cnt * cnt;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const DUPLICATE_THRESHOLD = 0.70;

export function isDuplicate(
  candidate: GeneratedQuestion,
  existing: GeneratedQuestion[]
): boolean {
  const candidateNorm = normalize(candidate.questionText);
  const candidateFreq = wordFreq(candidate.questionText);

  for (const q of existing) {
    // 1. Exact string match
    if (normalize(q.questionText) === candidateNorm) return true;

    // 2. Cosine similarity
    const sim = cosineSimilarity(candidateFreq, wordFreq(q.questionText));
    if (sim >= DUPLICATE_THRESHOLD) return true;
  }

  return false;
}

/** Filter out duplicates from a batch, returning {accepted, rejected} */
export function deduplicateBatch(
  batch: GeneratedQuestion[],
  existingQuestions: GeneratedQuestion[]
): { accepted: GeneratedQuestion[]; duplicateCount: number } {
  const accepted: GeneratedQuestion[] = [];
  const pool = [...existingQuestions];
  let duplicateCount = 0;

  for (const q of batch) {
    if (isDuplicate(q, pool)) {
      duplicateCount++;
    } else {
      accepted.push(q);
      pool.push(q); // also check within-batch duplicates
    }
  }

  return { accepted, duplicateCount };
}
