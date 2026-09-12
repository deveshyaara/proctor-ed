"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StudentQuestion } from "@/lib/exam/questions";
import { QuestionCard } from "./QuestionCard";
import { ProctoringGuard } from "./ProctoringGuard";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SyncStatus } from "@/components/ui/SyncStatus";
import { AnswerSyncManager } from "@/lib/exam/answerSync";
import { ProctoringCameraFeed } from "./ProctoringCameraFeed";

interface ExamEngineProps {
  attemptId: string;
  testCode: string;
  testTitle: string;
  subject: string;
  className: string;
  questions: StudentQuestion[];
  expiresAt: string;
  settings: {
    cameraRequired?: boolean;
    fullscreenRequired?: boolean;
    tabSwitchDetection?: boolean;
    warningLimit?: number;
    autoSubmitOnExpiry?: boolean;
    showResultImmediately?: boolean;
  };
  initialAnswers?: Record<string, string>;
}

export function ExamEngine({
  attemptId,
  testCode,
  testTitle,
  subject,
  className,
  questions,
  expiresAt,
  settings,
  initialAnswers = {},
}: ExamEngineProps) {
  const router = useRouter();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    // Check local storage buffer first
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`pe_attempt_${attemptId}_answers`);
        if (cached) return { ...initialAnswers, ...JSON.parse(cached) };
      } catch {
        // Ignore JSON error
      }
    }
    return initialAnswers;
  });

  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error" | "offline">("idle");
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, remaining);
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobileNavigator, setShowMobileNavigator] = useState(false);

  const autoSubmitTriggeredRef = useRef(false);
  const syncManagerRef = useRef<AnswerSyncManager | null>(null);
  // Stable ref so effects always call the latest submit without stale closure
  const handleFinalSubmitRef = useRef<(isAuto?: boolean) => Promise<void>>(
    async () => {}
  );

  // Submit test with authoritative flush — declared early so effects below can reference it
  const handleFinalSubmit = useCallback(
    async (isAuto = false) => {
      if (autoSubmitTriggeredRef.current && !isAuto) return;
      if (isAuto) autoSubmitTriggeredRef.current = true;

      setIsSubmitting((prev) => {
        if (prev) return prev; // already submitting
        return true;
      });
      setSubmitError(null);

      // 1. Flush all pending writes and await server acknowledgement
      const flushSuccess = await (syncManagerRef.current?.flush() ?? Promise.resolve(true));
      if (!flushSuccess && syncManagerRef.current?.hasPending()) {
        setIsSubmitting(false);
        setSubmitError(
          "Could not save pending answers to server. Please check your internet connection before submitting."
        );
        return;
      }

      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/submit`, {
          method: "POST",
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || "Submission failed.");
        }

        // Clear local persistence and queue
        syncManagerRef.current?.destroy(true);
        try {
          localStorage.removeItem(`pe_attempt_${attemptId}_answers`);
        } catch {
          // Ignore
        }

        router.push(`/exam/${testCode}/complete?auto=${isAuto ? "true" : "false"}`);
      } catch (err: unknown) {
        setIsSubmitting(false);
        setSubmitError(err instanceof Error ? err.message : "Submission failed.");
      }
    },
    [attemptId, testCode, router]
  );

  // Keep ref in sync after each render — must be in an effect, not during render (react-hooks/refs)
  useLayoutEffect(() => {
    handleFinalSubmitRef.current = handleFinalSubmit;
  });

  const reportEvent = useCallback(
    async (eventType: string, severity: "LOW" | "MEDIUM" | "HIGH", description: string) => {
      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType, severity, description }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.autoTerminated) {
            handleFinalSubmitRef.current(true);
          }
        }
      } catch {
        // Event error
      }
    },
    [attemptId]
  );

  // Initialize Answer Sync Manager
  useEffect(() => {
    const manager = new AnswerSyncManager(attemptId, {
      debounceMs: 400,
      onStateChange: (state) => setSyncState(state),
    });
    syncManagerRef.current = manager;

    return () => {
      manager.destroy(false);
    };
  }, [attemptId]);

  // Synchronize Timer Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setTimeLeftSeconds(Math.max(0, remaining));

      if (remaining <= 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        clearInterval(timer);
        handleFinalSubmitRef.current(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  // Periodic Heartbeat every 30 seconds
  useEffect(() => {
    const heartbeatInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/heartbeat`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.expired && !autoSubmitTriggeredRef.current) {
            autoSubmitTriggeredRef.current = true;
            handleFinalSubmitRef.current(true);
          }
        }
      } catch {
        // Keep running on network fail
      }
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [attemptId]);

  // Guard beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmitting) {
        e.preventDefault();
        e.returnValue = "You have an exam in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSubmitting]);

  const handleAnswerChange = (value: string) => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const newAnswers = { ...answers, [currentQ.id]: value };
    setAnswers(newAnswers);

    // Persist immediately in localStorage
    try {
      localStorage.setItem(`pe_attempt_${attemptId}_answers`, JSON.stringify(newAnswers));
    } catch {
      // Storage error
    }

    // Enqueue to reliable sync manager
    syncManagerRef.current?.enqueue(currentQ.id, value);
  };

  // handleFinalSubmit is declared above (useCallback) — see line ~74

  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  const currentQuestion = questions[currentIndex];

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const isLowTime = timeLeftSeconds < 300; // < 5 min

  return (
    <div className="student-experience min-h-screen bg-[#F4F0E7] flex flex-col select-none">
      {/* Proctoring Guard */}
      <ProctoringGuard
        attemptId={attemptId}
        tabSwitchDetection={settings.tabSwitchDetection}
        fullscreenRequired={settings.fullscreenRequired}
        warningLimit={settings.warningLimit}
        onAutoSubmit={() => handleFinalSubmit(true)}
      />

      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#191916]/95 backdrop-blur border-b border-[rgba(244,240,231,0.08)] px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#AAA69B]">
              <span>{subject}</span>
              <span>·</span>
              <span>{className}</span>
            </div>
            <h1 className="text-[15px] sm:text-[17px] font-bold text-[#F4F0E7] truncate max-w-xs sm:max-w-md">
              {testTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <div className="block">
              <SyncStatus state={syncState} />
            </div>

            {/* Countdown Display */}
            <div
              className={[
                "flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[14px] font-bold transition-colors sm:text-[15px]",
                isLowTime
                  ? "bg-[#E4572E]/15 text-[#E4572E] border-[#E4572E]/40 animate-pulse"
                  : "bg-[#22211C] text-[#F4F0E7] border-[rgba(244,240,231,0.12)]",
              ].join(" ")}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>{formatTimer(timeLeftSeconds)}</span>
            </div>

            <Button
              variant="primary"
              onClick={() => setShowSubmitModal(true)}
              className="h-11 bg-[#7A9E7E] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#688a6c]"
            >
              Submit Exam
            </Button>
          </div>
        </div>
      </header>

      {/* Main Exam Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Center Area: Question Card & Controls (8 or 9 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              currentAnswer={answers[currentQuestion.id]}
              onAnswerChange={handleAnswerChange}
            />
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <Button
              variant="secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="min-w-[100px]"
            >
              ← Previous
            </Button>

            {/* Mobile Navigator trigger */}
            <button
              type="button"
              onClick={() => setShowMobileNavigator(true)}
              className="lg:hidden text-[13px] text-[#AAA69B] px-3 py-2 rounded-lg bg-[#191916] border border-[rgba(244,240,231,0.08)]"
            >
              Q {currentIndex + 1} / {questions.length} (View All)
            </button>

            {currentIndex === questions.length - 1 ? (
              <Button
                variant="primary"
                onClick={() => setShowSubmitModal(true)}
                className="bg-[#7A9E7E] hover:bg-[#688a6c] min-w-[120px]"
              >
                Review & Submit
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="min-w-[100px]"
              >
                Next →
              </Button>
            )}
          </div>
        </div>

        {/* Right Rail: Desktop Question Navigator + Persistent Camera (4 cols) */}
        <div className="hidden lg:block lg:col-span-4 sticky top-24 space-y-4">
          {/* Persistent Camera Feed Widget */}
          <ProctoringCameraFeed
            enabled={settings.cameraRequired}
            onDisconnect={() => {
              reportEvent("CAMERA_DISCONNECTED", "HIGH", "Camera connection lost.");
            }}
            onReconnect={() => {
              reportEvent("CAMERA_RECONNECTED", "LOW", "Camera connection restored.");
            }}
          />

          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(244,240,231,0.06)]">
              <span className="text-[14px] font-semibold text-[#F4F0E7]">
                Question Navigator
              </span>
              <span className="text-[12px] font-mono text-[#AAA69B]">
                {answeredCount} of {questions.length} answered
              </span>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!answers[q.id]?.trim();

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={[
                      "w-full aspect-square rounded-[8px] flex items-center justify-center text-[13px] font-mono font-medium transition-all",
                      isCurrent
                        ? "border-2 border-[#E4572E] text-white font-bold bg-[#E4572E]/20"
                        : isAnswered
                        ? "bg-[#7A9E7E]/20 text-[#7A9E7E] border border-[#7A9E7E]/40"
                        : "bg-[#22211C] text-[#AAA69B] border border-[rgba(244,240,231,0.06)] hover:border-[rgba(244,240,231,0.18)] hover:text-[#F4F0E7]",
                    ].join(" ")}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-2 border-t border-[rgba(244,240,231,0.06)] flex items-center justify-around text-[11px] text-[#AAA69B]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-[#7A9E7E]/40 border border-[#7A9E7E]" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-[#22211C] border border-[rgba(244,240,231,0.12)]" />
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded border-2 border-[#E4572E]" />
                <span>Current</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Navigator Drawer / Modal */}
      {showMobileNavigator && (
        <Dialog
          isOpen={true}
          title="All Questions"
          onClose={() => setShowMobileNavigator(false)}
        >
          <div className="space-y-4 py-2">
            <div className="text-[13px] text-[#AAA69B]">
              {answeredCount} of {questions.length} answered
            </div>

            <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = !!answers[q.id]?.trim();

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowMobileNavigator(false);
                    }}
                    className={[
                      "w-full aspect-square rounded-[8px] flex items-center justify-center text-[14px] font-mono font-medium transition-all",
                      isCurrent
                        ? "border-2 border-[#E4572E] text-white font-bold bg-[#E4572E]/20"
                        : isAnswered
                        ? "bg-[#7A9E7E]/20 text-[#7A9E7E] border border-[#7A9E7E]/40"
                        : "bg-[#22211C] text-[#AAA69B] border border-[rgba(244,240,231,0.06)]",
                    ].join(" ")}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowMobileNavigator(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Submit Confirmation Dialog */}
      {showSubmitModal && (
        <Dialog
          isOpen={true}
          title="Ready to Submit Your Exam?"
          onClose={() => !isSubmitting && setShowSubmitModal(false)}
        >
          <div className="space-y-4 py-2">
            {submitError && (
              <div className="p-3 rounded-[10px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[13px] leading-relaxed">
                ⚠️ {submitError}
              </div>
            )}

            <p className="text-[14px] text-[#AAA69B] leading-relaxed">
              You have answered <strong className="text-[#F4F0E7]">{answeredCount}</strong> out of{" "}
              <strong className="text-[#F4F0E7]">{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span className="block text-[#E4572E] font-medium mt-1">
                  ⚠️ You have {questions.length - answeredCount} unanswered questions.
                </span>
              )}
            </p>
            <p className="text-[13px] text-[#AAA69B]">
              Once submitted, you will not be able to modify your answers or re-enter the examination.
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3">
              <Button
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => setShowSubmitModal(false)}
              >
                Return to Exam
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting}
                onClick={() => handleFinalSubmit(false)}
                className="bg-[#7A9E7E] hover:bg-[#688a6c]"
              >
                {isSubmitting ? "Submitting Exam..." : "Yes, Submit Exam"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
