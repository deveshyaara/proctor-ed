"use client";

import { useEffect, useRef } from "react";

interface DialogProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidth?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Dialog({ open, isOpen, onClose, title, description, maxWidth, children, actions }: DialogProps) {
  const isDialogOpen = Boolean(open ?? isOpen);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape
  useEffect(() => {
    if (!isDialogOpen) return;
    const prev = document.activeElement as HTMLElement;
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prev?.focus();
    };
  }, [isDialogOpen, onClose]);

  if (!isDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={description ? "dialog-desc" : undefined}>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative z-10 w-full ${maxWidth || "max-w-md"} bg-[#191916] border border-[rgba(244,240,231,0.1)] rounded-[16px] shadow-2xl outline-none`}
        style={{ animation: "dialogIn 150ms ease" }}
      >
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <h2 id="dialog-title" className="text-[17px] font-semibold text-[#F4F0E7] leading-snug">
              {title}
            </h2>
            {description && (
              <p id="dialog-desc" className="text-sm text-[#AAA69B] leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {children}
        </div>

        {actions && (
          <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            {actions}
          </div>
        )}
      </div>

      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes dialogIn { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
