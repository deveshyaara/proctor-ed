"use client";

import { useState, use, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CameraSetup } from "@/components/exam/CameraSetup";
import { Button } from "@/components/ui/Button";
import {
  isIPhoneDevice,
  isFullscreenSupported,
  isFullscreenActive,
  requestBrowserFullscreen,
  exitBrowserFullscreen,
} from "@/lib/exam/fullscreen";

const emptySubscribe = () => () => {};

function getDeviceErrorSnapshot(): string | null {
  if (isIPhoneDevice()) {
    return "iPhones are not supported for proctored examinations. Apple iOS does not support the Fullscreen API required for exam integrity. Please use a laptop, desktop computer, or iPad to complete this examination.";
  }
  if (!isFullscreenSupported()) {
    return "Your browser does not support the Fullscreen API required for proctored examinations. Please open this examination in Google Chrome, Mozilla Firefox, or Apple Safari.";
  }
  return null;
}

export default function ExamSetupPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const searchParams = useSearchParams();
  const attemptId = searchParams.get("attemptId");
  const router = useRouter();

  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraRequired, setCameraRequired] = useState(true);
  const [fullscreenRequired, setFullscreenRequired] = useState(true);

  const clientDeviceError = useSyncExternalStore(
    emptySubscribe,
    getDeviceErrorSnapshot,
    () => null
  );
  const deviceError = fullscreenRequired ? clientDeviceError : null;

  // Double-click guard ref
  const startingRef = useRef(false);

  useEffect(() => {
    fetch(`/api/student/tests/${code}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.test?.cameraRequired === "boolean") {
          setCameraRequired(data.test.cameraRequired);
        }
        if (typeof data.test?.fullscreenRequired === "boolean") {
          setFullscreenRequired(data.test.fullscreenRequired);
        }
      })
      .catch(() => {
        // Keep secure defaults when test metadata is unavailable.
      });
  }, [code]);

  if (!attemptId) {
    return (
      <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex items-center justify-center p-4">
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-6 max-w-md w-full text-center space-y-4">
          <p className="text-[14px] text-[#E4572E]">
            Missing exam session ID. Please re-enter the examination.
          </p>
          <Link href={`/exam/${code}`}>
            <Button variant="secondary" className="w-full">
              ← Return to Identity Entry
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Blocking unsupported device/browser screen
  if (deviceError) {
    return (
      <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex items-center justify-center p-4">
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-8 max-w-md w-full text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-[#E4572E]/15 text-[#E4572E] flex items-center justify-center text-xl mx-auto">
            ⚠️
          </div>
          <div className="space-y-2">
            <h1 className="text-[18px] font-bold text-[#F4F0E7]">
              Device or Browser Not Supported
            </h1>
            <p className="text-[13px] text-[#AAA69B] leading-relaxed">
              {deviceError}
            </p>
          </div>
          <div className="pt-2">
            <Link href={`/exam/${code}`}>
              <Button variant="secondary" className="w-full">
                ← Return to Start
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleStartExam = async () => {
    // 1. Instant double-click lock
    if (startingRef.current) return;
    startingRef.current = true;

    // 2. Direct User Gesture: Request Fullscreen if required
    // Do this FIRST before any state updates to preserve the user gesture token
    let enteredFullscreen = false;
    if (fullscreenRequired) {
      enteredFullscreen = await requestBrowserFullscreen();

      if (!enteredFullscreen) {
        startingRef.current = false;
        setErrorMessage(
          "Fullscreen mode is required to begin this examination. Please allow fullscreen access when prompted to continue."
        );
        return;
      }
    }

    setStarting(true);
    setErrorMessage(null);

    // 3. Set up in-flight exit monitor (in case student presses Esc while network call is pending)
    let exitedWhileInFlight = false;
    const handleFullscreenChange = () => {
      if (fullscreenRequired && !isFullscreenActive()) {
        exitedWhileInFlight = true;
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    try {
      // 4. Server-side session initialization & timer seed
      const res = await fetch(`/api/student/attempts/${attemptId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullscreenConfirmed: enteredFullscreen,
        }),
      });

      // Remove in-flight listeners
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

      // 5. Check if student exited fullscreen during the loading window
      if (fullscreenRequired && (exitedWhileInFlight || !isFullscreenActive())) {
        await exitBrowserFullscreen();
        startingRef.current = false;
        setStarting(false);
        setErrorMessage(
          "Fullscreen mode was interrupted before the examination could begin. Please remain in fullscreen to proceed."
        );
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to start examination session.");
      }

      // 6. Enter exam room with fullscreen already confirmed and active
      router.push(`/exam/${code}/attempt/${attemptId}`);
    } catch (err: unknown) {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

      // Rollback: Exit fullscreen on network/server error and allow retry
      await exitBrowserFullscreen();
      startingRef.current = false;
      setStarting(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unable to start exam session due to a network error. Your timer has not started. Please try again."
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {errorMessage && (
          <div className="p-4 rounded-[12px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[13px] text-center leading-relaxed">
            {errorMessage}
          </div>
        )}

        {starting ? (
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-12 text-center space-y-4 shadow-sm">
            <div className="w-10 h-10 border-3 border-[#E4572E] border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="text-[18px] font-bold text-[#F4F0E7]">
              Entering Secure Exam Environment...
            </h2>
            <p className="text-[13px] text-[#AAA69B]">
              Seeding authoritative timer, shuffling questions, and establishing proctoring signals.
            </p>
          </div>
        ) : (
          <CameraSetup
            onReady={handleStartExam}
            required={cameraRequired}
            fullscreenRequired={fullscreenRequired}
            loading={starting}
          />
        )}
      </div>
    </div>
  );
}
