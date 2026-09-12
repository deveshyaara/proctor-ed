export interface QueuedAnswer {
  attemptId: string;
  questionId: string;
  answer: string;
  timestamp: number;
  retryCount: number;
}

export class AnswerSyncManager {
  private attemptId: string;
  private pendingWrites: Map<string, string> = new Map();
  private inFlightWrites: Map<string, Promise<boolean>> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private maxRetries: number;
  private onStateChange?: (state: "idle" | "saving" | "saved" | "error" | "offline") => void;

  constructor(
    attemptId: string,
    options: {
      debounceMs?: number;
      maxRetries?: number;
      onStateChange?: (state: "idle" | "saving" | "saved" | "error" | "offline") => void;
    } = {}
  ) {
    this.attemptId = attemptId;
    this.debounceMs = options.debounceMs ?? 400;
    this.maxRetries = options.maxRetries ?? 5;
    this.onStateChange = options.onStateChange;

    // Load any persisted pending offline queue
    this.loadPersistedQueue();

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  }

  private storageKey(): string {
    return `pe_offline_queue_${this.attemptId}`;
  }

  private loadPersistedQueue(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (raw) {
        const items: QueuedAnswer[] = JSON.parse(raw);
        for (const item of items) {
          if (item.attemptId === this.attemptId && item.questionId) {
            this.pendingWrites.set(item.questionId, item.answer);
          }
        }
      }
    } catch {
      // Storage unavailable or invalid JSON
    }
  }

  private persistQueue(): void {
    if (typeof window === "undefined") return;
    try {
      if (this.pendingWrites.size === 0) {
        localStorage.removeItem(this.storageKey());
      } else {
        const items: QueuedAnswer[] = [];
        for (const [questionId, answer] of this.pendingWrites.entries()) {
          items.push({
            attemptId: this.attemptId,
            questionId,
            answer,
            timestamp: Date.now(),
            retryCount: 0,
          });
        }
        localStorage.setItem(this.storageKey(), JSON.stringify(items));
      }
    } catch {
      // Storage error
    }
  }

  private handleOnline = (): void => {
    this.flush();
  };

  /**
   * Record a new answer change. Saves to local queue immediately and schedules debounced server sync.
   */
  public enqueue(questionId: string, answer: string): void {
    this.pendingWrites.set(questionId, answer);
    this.persistQueue();
    this.onStateChange?.("saving");

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  /**
   * Save a single answer to the API
   */
  private async saveAnswer(questionId: string, answer: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/student/attempts/${this.attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });

      if (!res.ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Flush all pending writes immediately and wait for their completion.
   * Returns true if all writes succeeded, false if any write failed.
   */
  public async flush(): Promise<boolean> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingWrites.size === 0 && this.inFlightWrites.size === 0) {
      this.onStateChange?.("saved");
      return true;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.onStateChange?.("offline");
      return false;
    }

    this.onStateChange?.("saving");

    // Copy entries to process
    const entries = Array.from(this.pendingWrites.entries());
    const writePromises: Promise<boolean>[] = [];

    for (const [questionId, answer] of entries) {
      // If there's an in-flight write for this question, await it first
      const existingInFlight = this.inFlightWrites.get(questionId);
      const writePromise = (async () => {
        if (existingInFlight) {
          await existingInFlight;
        }

        // Check if value changed while waiting
        const latestAnswer = this.pendingWrites.get(questionId) ?? answer;
        const success = await this.saveAnswer(questionId, latestAnswer);

        if (success) {
          // If answer hasn't been updated since write began, remove from queue
          if (this.pendingWrites.get(questionId) === latestAnswer) {
            this.pendingWrites.delete(questionId);
            this.persistQueue();
          }
          return true;
        } else {
          return false;
        }
      })();

      this.inFlightWrites.set(questionId, writePromise);
      writePromises.push(writePromise);

      writePromise.finally(() => {
        this.inFlightWrites.delete(questionId);
      });
    }

    const results = await Promise.all(writePromises);
    const allSucceeded = results.every(Boolean) && this.pendingWrites.size === 0;

    if (allSucceeded) {
      this.onStateChange?.("saved");
      return true;
    } else {
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.onStateChange?.(isOffline ? "offline" : "error");
      return false;
    }
  }

  /**
   * Has pending writes that haven't confirmed saving to server
   */
  public hasPending(): boolean {
    return this.pendingWrites.size > 0 || this.inFlightWrites.size > 0;
  }

  /**
   * Clean up listeners, timers, and storage when attempt finishes
   */
  public destroy(clearStorage = false): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
    if (clearStorage && typeof window !== "undefined") {
      try {
        localStorage.removeItem(this.storageKey());
      } catch {
        // Ignore
      }
    }
  }
}
