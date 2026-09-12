"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type CameraStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "BLOCKED"
  | "UNAVAILABLE";

interface ProctoringCameraFeedProps {
  enabled?: boolean;
  onDisconnect?: () => void;
  onReconnect?: () => void;
}

export function ProctoringCameraFeed({
  enabled = true,
  onDisconnect,
  onReconnect,
}: ProctoringCameraFeedProps) {
  const [status, setStatus] = useState<CameraStatus>("CONNECTING");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isAcquiringRef = useRef(false);
  const hasDisconnectedRef = useRef(false);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
    }
  }, []);

  const acquireCamera = useCallback(
    async (isRetry = false) => {
      if (!enabled) return;
      if (isAcquiringRef.current) return;
      isAcquiringRef.current = true;

      setStatus(isRetry ? "RECONNECTING" : "CONNECTING");
      setErrorMessage(null);

      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          setStatus("UNAVAILABLE");
          setErrorMessage("Camera access is not supported by your browser.");
          return;
        }

        stopTracks();

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            facingMode: "user",
          },
          audio: false,
        });

        streamRef.current = newStream;
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          videoRef.current.play().catch(() => {});
        }

        const videoTrack = newStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setStatus("DISCONNECTED");
            hasDisconnectedRef.current = true;
            setErrorMessage("Camera connection lost.");
            onDisconnect?.();
          };
        }

        setStatus("CONNECTED");

        if (hasDisconnectedRef.current) {
          hasDisconnectedRef.current = false;
          onReconnect?.();
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setStatus("BLOCKED");
          setErrorMessage("Camera permission was denied.");
        } else {
          setStatus("UNAVAILABLE");
          setErrorMessage(error.message || "Failed to connect to camera device.");
        }
      } finally {
        isAcquiringRef.current = false;
      }
    },
    [enabled, stopTracks, onDisconnect, onReconnect]
  );

  useEffect(() => {
    if (!enabled) {
      stopTracks();
      return;
    }

    const timer = setTimeout(() => {
      acquireCamera();
    }, 0);

    const handleDeviceChange = () => {
      acquireCamera(true);
    };

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      clearTimeout(timer);
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
      stopTracks();
    };
  }, [enabled, acquireCamera, stopTracks]);

  if (!enabled) return null;

  return (
    <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#F4F0E7] flex items-center gap-1.5">
          <span
            className={[
              "w-2 h-2 rounded-full",
              status === "CONNECTED"
                ? "bg-[#7A9E7E] animate-pulse"
                : status === "RECONNECTING" || status === "CONNECTING"
                ? "bg-[#D6A84F] animate-ping"
                : "bg-[#E4572E]",
            ].join(" ")}
          />
          Proctoring Feed
        </span>
        <span className="text-[11px] font-mono text-[#AAA69B]">
          {status === "CONNECTED"
            ? "Camera Connected"
            : status === "RECONNECTING"
            ? "Reconnecting..."
            : status === "DISCONNECTED"
            ? "Camera connection lost"
            : status === "BLOCKED"
            ? "Permission Blocked"
            : "Connecting..."}
        </span>
      </div>

      <div className="relative aspect-video w-full rounded-[10px] overflow-hidden bg-[#11110F] border border-[rgba(244,240,231,0.1)] flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={[
            "w-full h-full object-cover scale-x-[-1]",
            status === "CONNECTED" ? "block" : "hidden",
          ].join(" ")}
        />

        {status !== "CONNECTED" && (
          <div className="p-3 text-center space-y-2">
            <p className="text-[12px] text-[#E4572E] font-medium">
              {errorMessage || "Camera connection lost"}
            </p>
            <button
              type="button"
              onClick={() => acquireCamera(true)}
              className="px-2.5 py-1 text-[11px] bg-[#22211C] hover:bg-[#2e2d27] text-[#F4F0E7] border border-[rgba(244,240,231,0.12)] rounded-[6px]"
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
