"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface CameraSetupProps {
  onReady: () => void | Promise<void>;
  required?: boolean;
  fullscreenRequired?: boolean;
  loading?: boolean;
}

export function CameraSetup({
  onReady,
  required = true,
  fullscreenRequired = true,
  loading = false,
}: CameraSetupProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"requesting" | "granted" | "denied" | "unavailable">("requesting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startCamera = async () => {
    setStatus("requesting");
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by your browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("granted");
    } catch (error) {
      const cameraError = error as Error;
      setStatus(cameraError.name === "NotAllowedError" ? "denied" : "unavailable");
      setErrorMessage(cameraError.message || "Unable to access the camera.");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void startCamera(), 0);
    return () => {
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const canContinue = (status === "granted" || !required) && !loading;

  const buttonLabel = loading
    ? "Entering secure exam environment..."
    : status === "granted"
    ? fullscreenRequired
      ? "Enter Fullscreen & Begin Exam"
      : "I am ready — begin exam"
    : required
    ? "Awaiting camera access"
    : fullscreenRequired
    ? "Enter Fullscreen & Begin Exam"
    : "Continue to exam";

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-[16px] border border-[rgba(244,240,231,0.08)] bg-[#191916] p-6 shadow-sm sm:p-8">
      <div className="space-y-1 text-center">
        <h2 className="text-[18px] font-bold text-[#F4F0E7]">
          {required ? "Camera & integrity check" : "Environment check"}
        </h2>
        <p className="text-[13px] text-[#AAA69B]">
          {required
            ? "Allow camera access so your teacher can review exam integrity signals."
            : "Camera access is optional for this examination."}
        </p>
      </div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[14px] border border-[rgba(244,240,231,0.12)] bg-[#11110F]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full scale-x-[-1] object-cover ${status === "granted" ? "block" : "hidden"}`}
        />
        {status !== "granted" && (
          <div className="max-w-sm space-y-3 p-6 text-center">
            <div className="mx-auto text-3xl">{status === "requesting" ? "◌" : "📷"}</div>
            <p className="text-[13px] leading-relaxed text-[#AAA69B]">
              {status === "requesting" ? "Requesting camera permission..." : errorMessage}
            </p>
            {status !== "requesting" && (
              <Button variant="secondary" onClick={startCamera}>
                Try again
              </Button>
            )}
          </div>
        )}
        {status === "granted" && (
          <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] font-mono text-[#7A9E7E]">
            ● Camera ready
          </div>
        )}
      </div>
      <div className="rounded-[12px] border border-[rgba(244,240,231,0.06)] bg-[#22211C] p-4 text-[13px] text-[#AAA69B]">
        {required
          ? "Your camera is used only for automated proctoring signals during this assessment."
          : "You can continue without camera access because this examination does not require it."}
      </div>
      <Button
        variant="primary"
        onClick={onReady}
        disabled={!canContinue}
        loading={loading}
        className="h-12 w-full"
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
