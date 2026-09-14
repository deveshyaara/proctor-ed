import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { errorResponse } from "@/lib/exam/attemptAuth";

type Params = { params: Promise<{ id: string; attemptId: string }> };

// GET /api/tests/[id]/attempts/[attemptId]/answers — student question-by-question responses (teacher only)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    let session;
    try {
      session = await requireTeacherApi();
    } catch (authErr: unknown) {
      const err = authErr as { status?: number };
      if (err.status === 401) {
        return NextResponse.json(
          errorResponse("UNAUTHORIZED", "Authentication required."),
          { status: 401 }
        );
      }
      // Standardized to 404 for student/non-teacher to avoid leaking test/attempt existence
      return NextResponse.json(
        errorResponse("TEST_NOT_FOUND", "Test not found."),
        { status: 404 }
      );
    }

    const { id, attemptId } = await params;

    // Verify teacher owns the test
    const test = await prisma.test.findFirst({
      where: { id, teacherId: session.user.id },
      select: {
        id: true,
        title: true,
        subject: true,
        className: true,
      },
    });

    if (!test) {
      return NextResponse.json(
        errorResponse("TEST_NOT_FOUND", "Test not found."),
        { status: 404 }
      );
    }

    // Verify attempt belongs to this test
    const attempt = await prisma.attempt.findFirst({
      where: { id: attemptId, testId: id },
      select: {
        id: true,
        studentName: true,
        rollNumber: true,
        status: true,
        score: true,
        maxScore: true,
        optionOrderMap: true,
        startedAt: true,
        submittedAt: true,
      },
    });

    if (!attempt) {
      return NextResponse.json(
        errorResponse("ATTEMPT_NOT_FOUND", "Attempt not found for this test."),
        { status: 404 }
      );
    }

    // Fetch questions in assigned display order
    const questions = await prisma.question.findMany({
      where: { testId: id },
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

    // Fetch existing student answers
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
    const optionOrderMap = (attempt.optionOrderMap as Record<string, number[]> | null) ?? null;

    let answeredCount = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const processedQuestions = questions.map((q) => {
      const recorded = answerMap.get(q.id);
      const rawOptions = Array.isArray(q.options) ? (q.options as string[]) : [];
      const hasAnswer = Boolean(recorded && recorded.answer !== null && recorded.answer.trim() !== "");

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
              shuffleOrder && Array.isArray(shuffleOrder) && studentVisibleIdx >= 0 && studentVisibleIdx < shuffleOrder.length
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
          isCorrect: idx === correctOptionIndex || optText.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
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

    const totalCalculatedMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    return NextResponse.json({
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
        maxScore: attempt.maxScore ?? totalCalculatedMarks,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
      },
      summary: {
        totalQuestions: questions.length,
        answeredCount,
        unansweredCount,
        correctCount,
        incorrectCount,
        score: attempt.score ?? 0,
        maxScore: attempt.maxScore ?? totalCalculatedMarks,
      },
      questions: processedQuestions,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status) {
      return NextResponse.json(errorResponse(err.code!, err.message!), { status: err.status });
    }
    return NextResponse.json(
      errorResponse("INTERNAL_ERROR", "An unexpected error occurred."),
      { status: 500 }
    );
  }
}
