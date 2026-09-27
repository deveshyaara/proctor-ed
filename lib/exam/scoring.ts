/**
 * Pure server-side scoring engine.
 * No DB calls — receives data, returns results.
 * Client NEVER determines marks or score.
 */

export interface ScoringQuestion {
  id: string;
  type: "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER";
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
  options?: string[] | null;
}

export interface StudentAnswer {
  questionId: string;
  answer: string | null;
}

export interface AnswerResult {
  questionId: string;
  answer: string | null;
  isCorrect: boolean | null;
  marksAwarded: number;
}

export interface ScoringResult {
  answers: AnswerResult[];
  score: number;
  maxScore: number;
  percentage: number;
}

export function scoreAttempt(
  questions: ScoringQuestion[],
  studentAnswers: StudentAnswer[],
  optionOrderMap?: Record<string, number[]> | null
): ScoringResult {
  const answerMap = new Map(studentAnswers.map((a) => [a.questionId, a.answer]));
  const maxScore = questions.reduce((sum, q) => sum + q.marks, 0);

  // rawScore accumulates without clamping — negative marks must be allowed to
  // carry forward across questions. Mid-loop clamping would silently absorb
  // penalties and inflate scores when negative marks are in use.
  let rawScore = 0;
  const answers: AnswerResult[] = [];

  for (const question of questions) {
    const studentAnswer = answerMap.get(question.id) ?? null;

    if (studentAnswer === null || studentAnswer.trim() === "") {
      answers.push({
        questionId: question.id,
        answer: null,
        isCorrect: null,
        marksAwarded: 0,
      });
      continue;
    }

    const questionOptionOrder = optionOrderMap ? optionOrderMap[question.id] : undefined;
    const isCorrect = checkAnswer(question, studentAnswer, questionOptionOrder);
    const marksAwarded = isCorrect
      ? question.marks
      : -question.negativeMarks;

    // Accumulate raw score — no per-question clamping
    rawScore += marksAwarded;

    answers.push({
      questionId: question.id,
      answer: studentAnswer,
      isCorrect,
      marksAwarded,
    });
  }

  // Clamp only the final total: a student cannot score below 0 overall,
  // but intermediate values must remain unclamped for correct accumulation.
  const score = Math.max(0, rawScore);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return {
    answers,
    score,
    maxScore,
    percentage: Math.round(percentage * 100) / 100,
  };
}

function checkAnswer(
  question: ScoringQuestion,
  studentAnswer: string,
  optionOrder?: number[]
): boolean {
  const correct = question.correctAnswer.trim().toLowerCase();
  const student = studentAnswer.trim().toLowerCase();

  if (question.type === "MCQ") {
    // If option order was randomized, translate the student's selected visible index
    // back to the canonical option index
    if (optionOrder && Array.isArray(optionOrder) && optionOrder.length > 0) {
      const studentIdx = parseInt(student, 10);
      if (!isNaN(studentIdx) && studentIdx >= 0 && studentIdx < optionOrder.length) {
        const canonicalIdx = optionOrder[studentIdx];
        // Compare against canonical index
        if (correct === String(canonicalIdx)) return true;
        // Also check if correctAnswer was stored as option text
        if (Array.isArray(question.options) && question.options[canonicalIdx]) {
          return question.options[canonicalIdx].trim().toLowerCase() === correct;
        }
        return false;
      }
    }

    // Direct comparison (no randomization or non-numeric index)
    if (correct === student) return true;
    const studentIdx = parseInt(student, 10);
    if (!isNaN(studentIdx) && Array.isArray(question.options) && question.options[studentIdx]) {
      return question.options[studentIdx].trim().toLowerCase() === correct;
    }
    return false;
  }

  if (question.type === "TRUE_FALSE") {
    return correct === student;
  }

  if (question.type === "NUMERICAL") {
    const correctNum = parseFloat(correct);
    const studentNum = parseFloat(student);
    if (isNaN(correctNum) || isNaN(studentNum)) return false;
    // Allow small floating-point tolerance
    return Math.abs(correctNum - studentNum) < 0.001;
  }

  if (question.type === "SHORT_ANSWER") {
    // Normalize: strip punctuation, collapse whitespace, case-insensitive.
    // Punctuation differences ("Newton's" vs "Newtons", trailing periods) are
    // the most common source of false-wrong marks in tuition short-answer questions.
    const normalizeText = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()'"/\\]/g, "") // strip punctuation
        .replace(/\s+/g, " ");                           // collapse whitespace
    return normalizeText(correct) === normalizeText(student);
  }

  return false;
}
