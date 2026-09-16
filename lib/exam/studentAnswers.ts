import { prisma } from "@/lib/db/client";
import { requireAttemptOwnership, ApiError } from "./attemptAuth";

export interface ProcessedStudentQuestion {
  id: string;
  order: number;
  type: string;
  questionText: string;
  imageUrl: string | null;
  marks: number;
  negativeMarks: number;
  explanation: string | null;
  isAnswered: boolean;
  submittedAnswer: string | null;
  submittedOptionIndex: number | null;
  submittedOptionLetter: string | null;
  correctAnswer: string;
  correctOptionIndex: number | null;
  correctOptionLetter: string | null;
  options: {
    index: number;
    letter: string;
    text: string;
    isCorrect: boolean;
    isSelected: boolean;
  }[] | null;
  isCorrect: boolean | null;
  marksAwarded: number;
  answeredAt: string | null;
}

export interface StudentAnswerSheetResult {
  withheld: boolean;
  withheldMessage?: string;
  test: {
    id: string;
    title: string;
    subject: string;
    className: string;
  };
  attempt: {
    id: string;
    studentName: string;
    rollNumber: string;
    status: string;
    score: number | null;
    maxScore: number | null;
    startedAt: string | null;
    submittedAt: string | null;
  };
  summary: {
    totalQuestions: number;
    answeredCount: number;
    unansweredCount: number;
    correctCount: number;
    incorrectCount: number;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
  };
  showResultImmediately: boolean;
  showCorrectAnswers: boolean;
  questions?: ProcessedStudentQuestion[];
}

/**
 * Fetch and format answer sheet for a student attempt.
 * Strictly checks:
 * 1. Request owns the attempt (valid cookie token for this attempt)
 * 2. Attempt is in terminal state (SUBMITTED / AUTO_SUBMITTED)
 * 3. Respects test.settings:
 *    - showResultImmediately = false: withhold score AND answers
 *    - showResultImmediately = true, showCorrectAnswers = false: score only, no breakdown
 *    - showResultImmediately = true, showCorrectAnswers = true: score + question breakdown
 */
export async function getStudentAnswerSheet(
  attemptId: string,
  rawToken: string | undefined
): Promise<StudentAnswerSheetResult> {
  // 1. Authenticate & authorize via cookie token; require terminal status
  const attempt = await requireAttemptOwnership(attemptId, rawToken, ["SUBMITTED", "AUTO_SUBMITTED"]);

  // 2. Fetch test and settings
  const test = await prisma.test.findUnique({
    where: { id: attempt.testId },
    select: {
      id: true,
      title: true,
      subject: true,
      className: true,
      settings: true,
    },
  });

  if (!test) {
    throw new ApiError(404, "TEST_NOT_FOUND", "Test not found.");
  }

  const settings = (test.settings as Record<string, unknown>) || {};
  const showResultImmediately = Boolean(settings.showResultImmediately ?? true);
  const showCorrectAnswers = Boolean(settings.showCorrectAnswers ?? false);

  // 3. If showResultImmediately is false: withhold score AND answers regardless of showCorrectAnswers
  if (!showResultImmediately) {
    return {
      withheld: true,
      withheldMessage:
        "Result publication has been withheld for teacher moderation. Your instructor will release final scores shortly.",
      test: {
        id: test.id,
        title: test.title,
        subject: test.subject,
        className: test.className,
      },
      attempt: {
        id: attempt.id,
        studentName: attempt.studentName,
        rollNumber: attempt.rollNumber,
        status: attempt.status,
        score: null,
        maxScore: null,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
      },
      summary: {
        totalQuestions: 0,
        answeredCount: 0,
        unansweredCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        score: null,
        maxScore: null,
        percentage: null,
      },
      showResultImmediately: false,
      showCorrectAnswers,
    };
  }

  // 4. Fetch questions
  const questions = await prisma.question.findMany({
    where: { testId: test.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      questionText: true,
      imageUrl: true,
      options: true,
      correctAnswer: true,
      marks: true,
      negativeMarks: true,
      explanation: true,
      order: true,
    },
  });

  const totalCalculatedMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const effectiveMaxScore = attempt.maxScore ?? totalCalculatedMarks;
  const effectiveScore = attempt.score ?? 0;
  const percentage =
    effectiveMaxScore > 0 ? Math.round((effectiveScore / effectiveMaxScore) * 100) : null;

  // 5. Fetch student answers
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: {
      questionId: true,
      answer: true,
      isCorrect: true,
      marksAwarded: true,
      answeredAt: true,
    },
  });

  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  let answeredCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const q of questions) {
    const recorded = answerMap.get(q.id);
    const hasAnswer = Boolean(
      recorded && recorded.answer !== null && recorded.answer.trim() !== ""
    );
    if (!hasAnswer) {
      unansweredCount++;
    } else {
      answeredCount++;
      if (recorded?.isCorrect === true) {
        correctCount++;
      } else if (recorded?.isCorrect === false) {
        incorrectCount++;
      }
    }
  }

  // 6. If showCorrectAnswers is false: score only, no question breakdown
  if (!showCorrectAnswers) {
    return {
      withheld: false,
      test: {
        id: test.id,
        title: test.title,
        subject: test.subject,
        className: test.className,
      },
      attempt: {
        id: attempt.id,
        studentName: attempt.studentName,
        rollNumber: attempt.rollNumber,
        status: attempt.status,
        score: attempt.score,
        maxScore: effectiveMaxScore,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
      },
      summary: {
        totalQuestions: questions.length,
        answeredCount,
        unansweredCount,
        correctCount,
        incorrectCount,
        score: attempt.score,
        maxScore: effectiveMaxScore,
        percentage,
      },
      showResultImmediately: true,
      showCorrectAnswers: false,
    };
  }

  // 7. If showResultImmediately is true AND showCorrectAnswers is true:
  // Order questions by attempt.questionOrder if available
  let orderedQuestions = questions;
  const questionOrder = (attempt.questionOrder as string[] | null) ?? null;
  if (questionOrder && Array.isArray(questionOrder) && questionOrder.length > 0) {
    const orderIndexMap = new Map(questionOrder.map((id, index) => [id, index]));
    orderedQuestions = [...questions].sort((a, b) => {
      const idxA = orderIndexMap.get(a.id) ?? a.order;
      const idxB = orderIndexMap.get(b.id) ?? b.order;
      return idxA - idxB;
    });
  }

  const optionOrderMap = (attempt.optionOrderMap as Record<string, number[]> | null) ?? null;

  const processedQuestions: ProcessedStudentQuestion[] = orderedQuestions.map((q) => {
    const recorded = answerMap.get(q.id);
    const rawOptions = Array.isArray(q.options) ? (q.options as string[]) : [];
    const hasAnswer = Boolean(
      recorded && recorded.answer !== null && recorded.answer.trim() !== ""
    );

    // Canonical correct answer resolution
    let correctAnswerText = q.correctAnswer;
    let correctOptionIndex: number | null = null;
    let correctOptionLetter: string | null = null;

    if (q.type === "MCQ") {
      const parsedIdx = parseInt(q.correctAnswer, 10);
      if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < rawOptions.length) {
        correctOptionIndex = parsedIdx;
        correctOptionLetter = String.fromCharCode(65 + parsedIdx);
        correctAnswerText = rawOptions[parsedIdx];
      }
    }

    // Student answer resolution
    let submittedAnswerText: string | null = null;
    let submittedOptionIndex: number | null = null;
    let submittedOptionLetter: string | null = null;

    if (hasAnswer && recorded?.answer) {
      if (q.type === "MCQ") {
        const rawStudentVal = recorded.answer.trim();
        const studentVisibleIdx = parseInt(rawStudentVal, 10);

        if (!isNaN(studentVisibleIdx)) {
          // Translate shuffled visible index back to canonical index if optionOrderMap exists
          const shuffleOrder = optionOrderMap?.[q.id];
          const canonicalIdx =
            shuffleOrder &&
            Array.isArray(shuffleOrder) &&
            studentVisibleIdx >= 0 &&
            studentVisibleIdx < shuffleOrder.length
              ? shuffleOrder[studentVisibleIdx]
              : studentVisibleIdx;

          submittedOptionIndex = canonicalIdx;
          submittedOptionLetter = String.fromCharCode(65 + canonicalIdx);
          submittedAnswerText = rawOptions[canonicalIdx] ?? rawStudentVal;
        } else {
          submittedAnswerText = rawStudentVal;
        }
      } else {
        submittedAnswerText = recorded.answer;
      }
    }

    // Format options list for MCQ
    let optionsList: {
      index: number;
      letter: string;
      text: string;
      isCorrect: boolean;
      isSelected: boolean;
    }[] | null = null;

    if (q.type === "MCQ" && rawOptions.length > 0) {
      optionsList = rawOptions.map((optText, idx) => ({
        index: idx,
        letter: String.fromCharCode(65 + idx),
        text: optText,
        isCorrect:
          idx === correctOptionIndex ||
          optText.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
        isSelected: hasAnswer && idx === submittedOptionIndex,
      }));
    }

    return {
      id: q.id,
      order: q.order,
      type: q.type,
      questionText: q.questionText,
      imageUrl: q.imageUrl,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      explanation: q.explanation,
      isAnswered: hasAnswer,
      submittedAnswer: submittedAnswerText,
      submittedOptionIndex,
      submittedOptionLetter,
      correctAnswer: correctAnswerText,
      correctOptionIndex,
      correctOptionLetter,
      options: optionsList,
      isCorrect: hasAnswer ? (recorded?.isCorrect ?? null) : null,
      marksAwarded: hasAnswer ? (recorded?.marksAwarded ?? 0) : 0,
      answeredAt: recorded?.answeredAt ? recorded.answeredAt.toISOString() : null,
    };
  });

  return {
    withheld: false,
    test: {
      id: test.id,
      title: test.title,
      subject: test.subject,
      className: test.className,
    },
    attempt: {
      id: attempt.id,
      studentName: attempt.studentName,
      rollNumber: attempt.rollNumber,
      status: attempt.status,
      score: attempt.score,
      maxScore: effectiveMaxScore,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    },
    summary: {
      totalQuestions: questions.length,
      answeredCount,
      unansweredCount,
      correctCount,
      incorrectCount,
      score: attempt.score,
      maxScore: effectiveMaxScore,
      percentage,
    },
    showResultImmediately: true,
    showCorrectAnswers: true,
    questions: processedQuestions,
  };
}
