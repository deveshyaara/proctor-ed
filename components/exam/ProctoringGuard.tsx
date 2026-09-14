"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  isFullscreenActive,
  requestBrowserFullscreen,
} from "@/lib/exam/fullscreen";

interface ProctoringGuardProps {
  attemptId: string;
  tabSwitchDetection?: boolean;
  fullscreenRequired?: boolean;
  warningLimit?: number;
  initialWarningCount?: number;
  onAutoSubmit: () => void;
}

export function ProctoringGuard({
  attemptId,
  tabSwitchDetection = true,
  fullscreenRequired = true,
  warningLimit = 3,
  initialWarningCount = 0,
  onAutoSubmit,
}: ProctoringGuardProps) {
  const [warnings, setWarnings] = useState(initialWarningCount);
  const [currentViolation, setCurrentViolation] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return isFullscreenActive();
  });

  // Debounce ref to prevent duplicate event logs within 3 seconds
  const lastEventTimeRef = useRef<Record<string, number>>({});

  const reportViolation = useCallback(
    async (
      eventType: string,
      severity: "LOW" | "MEDIUM" | "HIGH",
      description: string
    ) => {
      const now = Date.now();
      const lastTime = lastEventTimeRef.current[eventType] || 0;
      if (now - lastTime < 3000) return; // Debounce 3s
      lastEventTimeRef.current[eventType] = now;

      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType,
            severity,
            description,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (typeof data.warningCount === "number") {
            setWarnings(data.warningCount);
          }
          if (
            data.autoTerminated ||
            (typeof data.warningCount === "number" &&
              data.warningCount >= (data.warningLimit || warningLimit))
          ) {
            // Server-side authoritative auto-submit triggered
            onAutoSubmit();
          }
        }
      } catch {
        // Network hiccup logging event
      }
    },
    [attemptId, warningLimit, onAutoSubmit]
  );

  // 1. Tab switch / Visibility change
  useEffect(() => {
    if (!tabSwitchDetection) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation(
          "TAB_SWITCH",
          "HIGH",
          "Student switched away from the examination tab."
        );
        setCurrentViolation({
          type: "Tab Switch Detected",
          message:
            "Leaving the exam window is prohibited. This incident has been logged for teacher review.",
        });
      }
    };

    const handleBlur = () => {
      // If window blurs but visibility didn't trigger
      if (!document.hidden) {
        reportViolation(
          "TAB_SWITCH",
          "LOW",
          "Browser window lost focus."
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [tabSwitchDetection, reportViolation]);

  // 2. Fullscreen change
  useEffect(() => {
    if (!fullscreenRequired) return;

    const handleFullscreenChange = () => {
      const isFs = isFullscreenActive();
      setIsFullscreen(isFs);
      if (!isFs) {
        reportViolation(
          "FULLSCREEN_EXIT",
          "HIGH",
          "Student exited fullscreen mode."
        );
        setCurrentViolation({
          type: "Fullscreen Exited",
          message:
            "This examination must be completed in fullscreen mode. Please return to fullscreen immediately.",
        });
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    // Initial check: if loaded directly or refreshed, prompt immediately
    if (!isFullscreenActive()) {
      setCurrentViolation({
        type: "Fullscreen Required",
        message:
          "This examination must be completed in fullscreen mode. Please enter fullscreen to continue.",
      });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [fullscreenRequired, reportViolation]);

  // 3. Prevent Copy / Paste & Context Menu
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("COPY_PASTE_DETECTED", "MEDIUM", "Copy attempted.");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation("COPY_PASTE_DETECTED", "MEDIUM", "Paste attempted.");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [reportViolation]);

  const requestFullscreen = async () => {
    const success = await requestBrowserFullscreen();
    if (success) {
      setIsFullscreen(true);
      setCurrentViolation(null);
    }
  };

  return (
    <>
      {/* Non-fullscreen banner if fullscreen is required and inactive */}
      {fullscreenRequired && !isFullscreen && (
        <div className="sticky top-0 inset-x-0 z-50 bg-[#E4572E] text-white py-2 px-4 flex items-center justify-between text-[13px] font-medium shadow-md">
          <div className="flex items-center gap-2">
            <span>⚠️ Fullscreen required for this exam session.</span>
          </div>
          <button
            onClick={requestFullscreen}
            className="px-3 py-1 bg-white text-[#E4572E] rounded-[6px] font-semibold hover:bg-white/90 transition-colors"
          >
            Enter Fullscreen
          </button>
        </div>
      )}

      {/* Warning Notification Dialog */}
      {currentViolation && (
        <Dialog
          isOpen={true}
          title={currentViolation.type}
          onClose={() => setCurrentViolation(null)}
        >
          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-[10px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[13px] leading-relaxed">
              {currentViolation.message}
            </div>

            <div className="flex items-center justify-between text-[13px] font-mono p-3 bg-[#22211C] rounded-[8px] border border-[rgba(244,240,231,0.08)]">
              <span className="text-[#AAA69B]">Warning Status:</span>
              <span className="font-bold text-[#E4572E]">
                {warnings} of {warningLimit} allowed
              </span>
            </div>

            {warnings >= warningLimit ? (
              <p className="text-[12px] text-[#E4572E] font-medium text-center">
                Warning limit exceeded. Examination will be auto-submitted.
              </p>
            ) : (
              <p className="text-[12px] text-[#AAA69B] text-center">
                Subsequent violations will result in automatic examination termination.
              </p>
            )}

            <div className="flex justify-end pt-2">
              {fullscreenRequired && !isFullscreen ? (
                <Button variant="primary" onClick={requestFullscreen}>
                  Return to Fullscreen
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => setCurrentViolation(null)}
                >
                  I Understand, Continue Exam
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
