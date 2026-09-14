import { AIProctoringEngine } from "@/components/proctoring/AIProctoringEngine";
import { AI_CONFIG } from "@/lib/ai/config";
import { vi, describe, it, expect } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...(actual as Record<string, unknown>),
    useEffect: vi.fn(),
    useRef: vi.fn(() => ({ current: null })),
    useState: vi.fn((init) => [init, vi.fn()]),
  };
});

describe("AIProctoringEngine Kill Switch", () => {
  it("returns null when AI_PROCTORING_ENABLED is false", () => {
    const originalEnabled = AI_CONFIG.ENABLED;
    Object.defineProperty(AI_CONFIG, 'ENABLED', { value: false, writable: true });
    
    const result = AIProctoringEngine({ 
        videoRef: { current: null }, 
        isStreamStable: true, 
        onAIEvent: () => {} 
    });
    
    expect(result).toBeNull();
    
    Object.defineProperty(AI_CONFIG, 'ENABLED', { value: originalEnabled, writable: true });
  });
});
