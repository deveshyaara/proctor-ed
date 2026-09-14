import { InferenceSessionManager } from "@/lib/ai/runtime/inferenceSession";
import { describe, it, expect, vi } from "vitest";
import * as ort from "onnxruntime-web";

vi.mock("onnxruntime-web", () => {
  return {
    InferenceSession: {
      create: vi.fn(),
    },
  };
});

describe("InferenceSessionManager - Leak Regression", () => {
  it("should release session if disposed during WASM init", async () => {
    const manager = new InferenceSessionManager();
    
    // Create a deferred promise to simulate a slow init
    let resolveCreate: (session: any) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });

    // Mock ort.InferenceSession.create to return the slow promise
    (ort.InferenceSession.create as any).mockReturnValue(createPromise);

    // 1. Start session acquisition (simulating slow/pending WASM init)
    const getSessionPromise = manager.getSession();

    // 2. Caller bails and unmounts before resolution
    manager.dispose();

    // 3. Resolve the mock creation with a fake session that has a spy release method
    const releaseSpy = vi.fn();
    const fakeSession = { release: releaseSpy };
    resolveCreate!(fakeSession);

    // Wait for the original call to settle
    await getSessionPromise;

    // 4. Assert that the orphaned session was released immediately
    expect(releaseSpy).toHaveBeenCalledOnce();
  });
});
