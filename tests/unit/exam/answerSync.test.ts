import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnswerSyncManager } from "@/lib/exam/answerSync";

describe("AnswerSyncManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enqueues answers and flushes debounced save", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    let syncStatus = "";
    const manager = new AnswerSyncManager("att-1", {
      debounceMs: 200,
      onStateChange: (st) => {
        syncStatus = st;
      },
    });

    manager.enqueue("q1", "Option A");
    expect(syncStatus).toBe("saving");
    expect(manager.hasPending()).toBe(true);

    // Before debounce timer expires, fetch has not been called
    expect(fetchMock).not.toHaveBeenCalled();

    // Fast-forward debounce
    await vi.advanceTimersByTimeAsync(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/student/attempts/att-1/answer", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ questionId: "q1", answer: "Option A" }),
    }));
    expect(manager.hasPending()).toBe(false);
    expect(syncStatus).toBe("saved");

    manager.destroy(true);
  });

  it("deduplicates rapid changes to the same question before flush", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    const manager = new AnswerSyncManager("att-1", { debounceMs: 200 });

    manager.enqueue("q1", "1");
    manager.enqueue("q1", "2");
    manager.enqueue("q1", "3");

    await vi.advanceTimersByTimeAsync(200);

    // Only the latest answer should be posted
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/student/attempts/att-1/answer", expect.objectContaining({
      body: JSON.stringify({ questionId: "q1", answer: "3" }),
    }));

    manager.destroy(true);
  });

  it("flush() immediately forces pending saves and returns success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    const manager = new AnswerSyncManager("att-1", { debounceMs: 5000 });

    manager.enqueue("q1", "A");
    manager.enqueue("q2", "B");

    // Immediate flush without waiting 5000ms
    const flushPromise = manager.flush();
    const success = await flushPromise;

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(manager.hasPending()).toBe(false);

    manager.destroy(true);
  });

  it("handles network failure and reports error state", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network disconnect"));
    globalThis.fetch = fetchMock;

    let syncStatus = "";
    const manager = new AnswerSyncManager("att-1", {
      debounceMs: 100,
      onStateChange: (st) => {
        syncStatus = st;
      },
    });

    manager.enqueue("q1", "A");
    const success = await manager.flush();

    expect(success).toBe(false);
    expect(manager.hasPending()).toBe(true);
    expect(syncStatus).toBe("error");

    manager.destroy(true);
  });

  it("waits for slow in-flight answer request during flush", async () => {
    let resolveSlowFetch: (val: unknown) => void;
    const slowFetchPromise = new Promise((res) => {
      resolveSlowFetch = res;
    });

    const fetchMock = vi.fn().mockImplementation(() => slowFetchPromise);
    globalThis.fetch = fetchMock;

    const manager = new AnswerSyncManager("att-1", { debounceMs: 50 });
    manager.enqueue("q1", "A");

    // Advance timer so debounced save begins and becomes in-flight
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manager.hasPending()).toBe(true);

    // Now call flush() while request is still in flight
    const flushPromise = manager.flush();

    // Resolve the slow fetch
    resolveSlowFetch!({ ok: true });
    const success = await flushPromise;

    expect(success).toBe(true);
    expect(manager.hasPending()).toBe(false);

    manager.destroy(true);
  });

  it("automatically flushes when window receives online event", async () => {
    const listeners: Record<string, () => void> = {};
    const mockWindow = {
      addEventListener: (evt: string, cb: () => void) => {
        listeners[evt] = cb;
      },
      removeEventListener: (evt: string) => {
        delete listeners[evt];
      },
    };
    (globalThis as unknown as { window: unknown }).window = mockWindow;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    const manager = new AnswerSyncManager("att-1", { debounceMs: 10000 });
    manager.enqueue("q1", "Offline Answer");

    expect(fetchMock).not.toHaveBeenCalled();

    // Trigger online callback
    listeners["online"]?.();

    // Allow promise microtasks to run
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledWith("/api/student/attempts/att-1/answer", expect.objectContaining({
      body: JSON.stringify({ questionId: "q1", answer: "Offline Answer" }),
    }));

    manager.destroy(true);
    delete (globalThis as unknown as { window?: unknown }).window;
  });
});

