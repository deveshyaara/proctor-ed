"use client";

import { useEffect, useRef, useState } from "react";
import { AI_CONFIG } from "@/lib/ai/config";
import { FaceDetector } from "@/lib/ai/vision/faceDetector";
import { TemporalSmoother, EvidenceType } from "@/lib/ai/evidence/temporalSmoother";

import { GazeEstimate } from "@/lib/ai/vision/headPose";

interface AIProctoringEngineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isStreamStable: boolean;
  onAIEvent: (type: EvidenceType, confidence: number, durationMs: number, faceCount: number) => void;
  onGazeUpdate?: (gaze: GazeEstimate | null) => void;
}

export function AIProctoringEngine({ videoRef, isStreamStable, onAIEvent, onGazeUpdate }: AIProctoringEngineProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const onAIEventRef = useRef(onAIEvent);
  useEffect(() => {
    onAIEventRef.current = onAIEvent;
  }, [onAIEvent]);

  const onGazeUpdateRef = useRef(onGazeUpdate);
  useEffect(() => {
    onGazeUpdateRef.current = onGazeUpdate;
  }, [onGazeUpdate]);

  const lastEventFiredAtRef = useRef<Map<EvidenceType, number>>(new Map());

  useEffect(() => {
    if (!AI_CONFIG.ENABLED) return;
    if (!isStreamStable) return;
    if (!videoRef.current) return;

    let isUnmounted = false;
    let animationFrameId: number;
    let lastProcessedTime = 0;

    const faceDetector = new FaceDetector();
    const smootherConfig = [
      { type: 'PERSON_MISSING' as EvidenceType, minConfidence: AI_CONFIG.FACE_PRESENCE.MIN_CONFIDENCE, sustainedMs: AI_CONFIG.FACE_PRESENCE.SUSTAINED_MS, recoveryMs: AI_CONFIG.FACE_PRESENCE.RECOVERY_MS },
      { type: 'MULTIPLE_PEOPLE' as EvidenceType, minConfidence: AI_CONFIG.MULTIPLE_FACES.MIN_CONFIDENCE, sustainedMs: AI_CONFIG.MULTIPLE_FACES.SUSTAINED_MS, recoveryMs: AI_CONFIG.MULTIPLE_FACES.RECOVERY_MS },
    ];
    if (AI_CONFIG.GAZE_DETECTION_ENABLED) {
      smootherConfig.push({ type: 'PROLONGED_GAZE_DEVIATION' as EvidenceType, minConfidence: AI_CONFIG.GAZE_DEVIATION.MIN_CONFIDENCE, sustainedMs: AI_CONFIG.GAZE_DEVIATION.SUSTAINED_MS, recoveryMs: AI_CONFIG.GAZE_DEVIATION.RECOVERY_MS });
    }
    const smoother = new TemporalSmoother(smootherConfig);

    // No hiddenCanvas needed for WebWorker offloading with ImageBitmap

    async function init() {
      setIsInitializing(true);
      try {
        const isOk = await faceDetector.waitForReady();
        if (!isOk) {
          setIsSupported(false);
          return;
        }
        if (isUnmounted) return;
        
        loop();
      } catch (e) {
        setIsSupported(false);
      } finally {
        if (!isUnmounted) setIsInitializing(false);
      }
    }

    async function loop() {
      if (isUnmounted) return;

      const now = performance.now();
      const timeSinceLast = now - lastProcessedTime;
      const msPerFrame = 1000 / AI_CONFIG.TARGET_FPS;

      if (timeSinceLast >= msPerFrame && videoRef.current && videoRef.current.readyState === 4) {
        lastProcessedTime = now;

        let processingTimeMs = 0;
        
        if (!isUnmounted) {
          const t0 = performance.now();
          // Detect off-thread
          const result = await faceDetector.detect(videoRef.current);
          const t1 = performance.now();
          processingTimeMs = t1 - t0;
          
          if (typeof window !== 'undefined' && !(window as any).aiMetrics) {
            (window as any).aiMetrics = {
              count: 0,
              totalMs: 0,
              frameCount: 0,
              lifetimeFrames: 0,
              lifetimeMs: 0,
              avgLatency: 0,
              sustainedFps: 0,
              startT: performance.now()
            };
          }
          if (typeof window !== 'undefined') {
            const m = (window as any).aiMetrics;
            m.count++;
            m.totalMs += processingTimeMs;
            m.frameCount++;
            m.lifetimeFrames = (m.lifetimeFrames || 0) + 1;
            m.lifetimeMs = (m.lifetimeMs || 0) + processingTimeMs;
            m.avgLatency = Number((m.lifetimeMs / m.lifetimeFrames).toFixed(1));
            if (m.count >= 50) {
              const elapsedTotal = performance.now() - m.startT;
              const fps = (m.frameCount / elapsedTotal) * 1000;
              m.sustainedFps = Number(fps.toFixed(1));
              console.log(`[AI Diagnostics] Avg Latency: ${(m.totalMs / m.count).toFixed(1)}ms | Sustained FPS: ${fps.toFixed(1)} | Lifetime frames: ${m.lifetimeFrames}`);
              m.count = 0;
              m.totalMs = 0;
              m.frameCount = 0;
              m.startT = performance.now();
            }
          }

          const numFaces = result.faces.length;
          
          // CONDITION 4 & Gaze Signal:
          // Gaze is evaluated only if GAZE_DETECTION_ENABLED and exactly 1 face was present
          const isGazeDeviated = Boolean(
            AI_CONFIG.GAZE_DETECTION_ENABLED &&
            numFaces === 1 &&
            result.gaze?.isDeviated
          );
          const gazeConfidence = (numFaces === 1 && result.gaze?.confidence) || 0;

          const rawSignals: Record<EvidenceType, { detected: boolean; confidence: number }> = {
            PERSON_MISSING: { detected: numFaces === 0, confidence: 1.0 },
            MULTIPLE_PEOPLE: { detected: numFaces > 1, confidence: 1.0 },
            PROLONGED_GAZE_DEVIATION: {
              detected: isGazeDeviated,
              confidence: gazeConfidence,
            },
          };

          if (typeof window !== 'undefined') {
            (window as any).lastGazeEstimate = result.gaze || null;
          }
          if (onGazeUpdateRef.current) {
            onGazeUpdateRef.current(result.gaze || null);
          }

          const confirmed = smoother.processFrame(rawSignals, Date.now());
          
          confirmed.forEach(ev => {
            const lastFired = lastEventFiredAtRef.current.get(ev.type) || 0;
            if (Date.now() - lastFired >= AI_CONFIG.EVENT_COOLDOWN_MS) {
              lastEventFiredAtRef.current.set(ev.type, Date.now());
              onAIEventRef.current(ev.type, ev.confidence, ev.durationMs, numFaces);
            }
          });
        }

      }

      if (!isUnmounted) {
        animationFrameId = requestAnimationFrame(loop);
      }
    }

    init();

    return () => {
      isUnmounted = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      faceDetector.dispose();
    };
  }, [isStreamStable, videoRef]);

  if (!AI_CONFIG.ENABLED) return null;
  if (!isSupported) return <div className="hidden" data-testid="ai-proctoring-degraded" />;
  
  return (
    <div className="absolute top-2 right-2 flex items-center gap-2 z-50">
      {isInitializing && (
        <span className="bg-black/50 text-[#F4F0E7] text-[10px] px-2 py-1 rounded backdrop-blur">
          AI Vision Initializing...
        </span>
      )}
    </div>
  );
}
