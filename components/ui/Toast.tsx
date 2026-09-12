"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalToastHandler: ((message: string, type?: ToastType, title?: string) => void) | null = null;

export function showToast(message: string, type: ToastType = "info", title?: string) {
  if (globalToastHandler) {
    globalToastHandler(message, type, title);
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info", title?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastMessage = { id, message, type, title, duration: 4000 };
    setToasts((prev) => [...prev.slice(-4), newToast]);
  }, []);

  useEffect(() => {
    globalToastHandler = toast;
    return () => {
      globalToastHandler = null;
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      {/* Toast viewport */}
      <aside
        aria-label="Notifications"
        aria-live="polite"
        role="region"
        className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)] pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const iconByType = {
    success: (
      <span className="w-5 h-5 rounded-full bg-[var(--success-subtle,rgba(122,158,126,0.14))] text-[var(--success,#7A9E7E)] flex items-center justify-center text-xs font-bold shrink-0">
        ✓
      </span>
    ),
    error: (
      <span className="w-5 h-5 rounded-full bg-[var(--danger-subtle,rgba(201,76,76,0.14))] text-[var(--danger,#C94C4C)] flex items-center justify-center text-xs font-bold shrink-0">
        ✕
      </span>
    ),
    info: (
      <span className="w-5 h-5 rounded-full bg-[var(--brand-subtle,rgba(228,87,46,0.12))] text-[var(--brand,#E4572E)] flex items-center justify-center text-xs font-bold shrink-0">
        ℹ
      </span>
    ),
  };

  const borderByType = {
    success: "border-[var(--success,#7A9E7E)]/30",
    error: "border-[var(--danger,#C94C4C)]/40",
    info: "border-[var(--border,rgba(244,240,231,0.09))]",
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 p-4 rounded-[12px] bg-[var(--surface,#191916)] text-[var(--foreground,#F4F0E7)] border ${borderByType[toast.type]} shadow-2xl backdrop-blur-md transition-all duration-200 animate-fade-in`}
    >
      {iconByType[toast.type]}
      <div className="flex-1 min-w-0 space-y-0.5">
        {toast.title && (
          <p className="text-[13px] font-semibold tracking-tight text-[var(--foreground,#F4F0E7)]">
            {toast.title}
          </p>
        )}
        <p className="text-xs text-[var(--foreground-muted,#AAA69B)] leading-relaxed break-words">
          {toast.message}
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Close notification"
        className="text-[var(--foreground-muted,#AAA69B)] hover:text-[var(--foreground,#F4F0E7)] p-1 -mr-1 -mt-1 rounded-[6px] hover:bg-[var(--surface-elevated,#22211C)] transition-colors cursor-pointer text-xs"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: (msg: string, type?: ToastType, title?: string) => showToast(msg, type, title),
      removeToast: () => {},
    };
  }
  return context;
}
