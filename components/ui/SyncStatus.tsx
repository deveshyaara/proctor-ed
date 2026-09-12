"use client";

type SyncState = "idle" | "saving" | "saved" | "error" | "offline";

interface SyncStatusProps {
  state: SyncState;
  onRetry?: () => void;
}

export function SyncStatus({ state, onRetry }: SyncStatusProps) {
  if (state === "idle") return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] tabular-nums" aria-live="polite" aria-atomic="true">
      {state === "saving" && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#D6A84F] animate-pulse" />
          <span className="text-[#D6A84F]">Saving…</span>
        </>
      )}
      {state === "saved" && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#7A9E7E]" />
          <span className="text-[#7A9E7E]">Saved</span>
        </>
      )}
      {state === "offline" && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#E4572E] animate-pulse" />
          <span className="text-[#E4572E]">Offline (Queued)</span>
        </>
      )}
      {state === "error" && (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[#C94C4C]" />
          <span className="text-[#C94C4C]">Failed</span>
          {onRetry && (
            <button onClick={onRetry} className="text-[#E4572E] underline underline-offset-2 ml-0.5 cursor-pointer">
              Retry
            </button>
          )}
        </>
      )}
    </span>
  );
}
