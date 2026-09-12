import type { Question } from "@prisma/client";

/**
 * Student-safe question type — strips all server-only fields.
 * correctAnswer, explanation, imageKey are NEVER sent to the client.
 */
export interface StudentQuestion {
  id: string;
  type: "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER";
  questionText: string;
  imageUrl: string | null;
  options: string[] | null;        // MCQ options only; shuffled if randomizeOptions
  marks: number;
  negativeMarks: number;
  order: number;
}

/**
 * Project a Question[] to StudentQuestion[] — strips correctAnswer etc.
 * Applies option shuffling from optionOrderMap if provided.
 */
export function toStudentQuestions(
  questions: Question[],
  questionOrder?: string[],
  optionOrderMap?: Record<string, number[]>
): StudentQuestion[] {
  // If a persisted order exists, sort by it
  const ordered = questionOrder
    ? [...questions].sort(
        (a, b) => questionOrder.indexOf(a.id) - questionOrder.indexOf(b.id)
      )
    : [...questions].sort((a, b) => a.order - b.order);

  return ordered.map((q, idx) => {
    let options: string[] | null = null;

    if (q.type === "MCQ" && Array.isArray(q.options)) {
      const rawOptions = q.options as string[];
      const shuffleOrder = optionOrderMap?.[q.id];
      options = shuffleOrder
        ? shuffleOrder.map((i) => rawOptions[i])
        : rawOptions;
    }

    return {
      id: q.id,
      type: q.type as StudentQuestion["type"],
      questionText: q.questionText,
      imageUrl: q.imageUrl,
      options,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      order: idx + 1,
    };
  });
}

/**
 * Generate a random question order (array of IDs in shuffled sequence).
 * Persisted on the attempt to prevent re-shuffle on refresh.
 */
export function shuffleQuestionIds(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate option shuffle map for all MCQ questions.
 * Maps questionId → shuffled index array.
 * e.g. { "q1": [2, 0, 3, 1] } means option[0] shown as option[2], etc.
 */
export function shuffleOptionMap(
  questions: Question[]
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const q of questions) {
    if (q.type === "MCQ" && Array.isArray(q.options)) {
      const len = (q.options as string[]).length;
      const indices = Array.from({ length: len }, (_, i) => i);
      for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      map[q.id] = indices;
    }
  }
  return map;
}

/**
 * Translate a shuffled option index (student's answer) back to the original index.
 * Used server-side when validating MCQ answers.
 */
export function unshuffleOptionIndex(
  shuffledIndex: number,
  originalIndices: number[]
): number {
  return originalIndices[shuffledIndex] ?? shuffledIndex;
}
