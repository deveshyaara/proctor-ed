"use client";

import { useState, use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CameraSetup } from "@/components/exam/CameraSetup";
import { Button } from "@/components/ui/Button";

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

  useEffect(() => {
    fetch(`/api/student/tests/${code}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.test?.cameraRequired === "boolean") {
          setCameraRequired(data.test.cameraRequired);
        }
      })
      .catch(() => {
        // Keep the secure default when test metadata is unavailable.
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

  const handleCameraReady = async () => {
    setStarting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/student/attempts/${attemptId}/start`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to start examination session.");
      }

      // Enter exam room
      router.push(`/exam/${code}/attempt/${attemptId}`);
    } catch (err: unknown) {
      setStarting(false);
      setErrorMessage(err instanceof Error ? err.message : "Failed to start exam.");
    }
  };

  return (
    <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {errorMessage && (
          <div className="p-4 rounded-[12px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[13px] text-center">
            {errorMessage}
          </div>
        )}

        {starting ? (
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-12 text-center space-y-4 shadow-sm">
            <div className="w-10 h-10 border-3 border-[#E4572E] border-t-transparent rounded-full animate-spin mx-auto" />
            <h2 className="text-[18px] font-bold text-[#F4F0E7]">
              Preparing Your Exam Session...
            </h2>
            <p className="text-[13px] text-[#AAA69B]">
              Shuffling questions, establishing integrity monitors, and seeding timer.
            </p>
          </div>
        ) : (
          <CameraSetup onReady={handleCameraReady} required={cameraRequired} />
        )}
      </div>
    </div>
  );
}
