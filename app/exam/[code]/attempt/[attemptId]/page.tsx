import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import {
  requireAttemptOwnership,
  attemptCookieName,
  isAttemptExpired,
} from "@/lib/exam/attemptAuth";
import { isTerminal } from "@/lib/exam/stateMachine";
import { toStudentQuestions, StudentQuestion } from "@/lib/exam/questions";
import { ExamEngine } from "@/components/exam/ExamEngine";

export default async function ExamAttemptPage({
  params,
}: {
  params: Promise<{ code: string; attemptId: string }>;
}) {
  const { code, attemptId } = await params;
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(attemptCookieName(attemptId))?.value;

  let attempt;
  try {
    attempt = await requireAttemptOwnership(attemptId, rawToken);
  } catch {
    redirect(`/exam/${code}`);
  }

  // If already submitted or terminal, send to completion page
  if (isTerminal(attempt.status)) {
    redirect(`/exam/${code}/complete`);
  }

  // If created but not started, send to setup
  if (attempt.status === "CREATED") {
    redirect(`/exam/${code}/setup?attemptId=${attemptId}`);
  }

  // Load test with questions
  const test = await prisma.test.findUnique({
    where: { id: attempt.testId },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!test) {
    notFound();
  }

  // Check expiry
  if (isAttemptExpired(attempt)) {
    redirect(`/exam/${code}/complete?auto=true`);
  }

  // Format student questions with persisted shuffle order
  const questionOrder = attempt.questionOrder as string[] | undefined;
  const optionOrderMap = attempt.optionOrderMap as Record<string, number[]> | undefined;
  const studentQuestions: StudentQuestion[] = toStudentQuestions(
    test.questions,
    questionOrder,
    optionOrderMap
  );

  // Fetch already saved answers
  const existingAnswers = await prisma.answer.findMany({
    where: { attemptId },
    select: { questionId: true, answer: true },
  });

  const initialAnswers: Record<string, string> = {};
  for (const ans of existingAnswers) {
    if (ans.answer !== null) {
      initialAnswers[ans.questionId] = ans.answer;
    }
  }

  const settings = (test.settings as Record<string, unknown>) || {};

  return (
    <ExamEngine
      attemptId={attempt.id}
      testCode={code}
      testTitle={test.title}
      subject={test.subject}
      className={test.className}
      questions={studentQuestions}
      expiresAt={attempt.expiresAt?.toISOString() || new Date().toISOString()}
      settings={{
        cameraRequired: Boolean(settings.cameraRequired),
        fullscreenRequired: Boolean(settings.fullscreenRequired),
        tabSwitchDetection: Boolean(settings.tabSwitchDetection),
        warningLimit: Number(settings.warningLimit || 3),
        autoSubmitOnExpiry: Boolean(settings.autoSubmitOnExpiry),
        showResultImmediately: Boolean(settings.showResultImmediately),
      }}
      initialAnswers={initialAnswers}
    />
  );
}
