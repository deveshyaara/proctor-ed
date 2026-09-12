"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  showCount?: boolean;
  maxLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, showCount, className = "", id, value, maxLength, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const charCount = typeof value === "string" ? value.length : 0;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium text-[#AAA69B]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          value={value}
          maxLength={maxLength}
          rows={3}
          className={[
            "w-full px-3 py-2.5 rounded-[10px] text-[15px] bg-[#22211C] text-[#F4F0E7]",
            "border border-[rgba(244,240,231,0.09)] hover:border-[rgba(244,240,231,0.18)]",
            "focus:outline-none focus:border-[rgba(228,87,46,0.45)] focus:ring-1 focus:ring-[rgba(228,87,46,0.25)]",
            "placeholder:text-[#737067] resize-y transition-colors duration-150",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error ? "border-[#C94C4C]" : "",
            className,
          ].join(" ")}
          {...props}
        />
        <div className="flex items-start justify-between gap-2">
          <div>
            {hint && !error && <p className="text-[12px] text-[#737067]">{hint}</p>}
            {error && <p className="text-[12px] text-[#C94C4C]" role="alert">{error}</p>}
          </div>
          {showCount && maxLength && (
            <span className="text-[11px] text-[#737067] shrink-0 tabular-nums">
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
