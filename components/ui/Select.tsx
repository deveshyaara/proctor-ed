"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className = "", id, children, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium text-[#AAA69B]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={[
            "w-full px-3 py-2.5 rounded-[10px] text-[15px] bg-[#22211C] text-[#F4F0E7]",
            "border border-[rgba(244,240,231,0.09)] hover:border-[rgba(244,240,231,0.18)]",
            "focus:outline-none focus:border-[rgba(228,87,46,0.45)] focus:ring-1 focus:ring-[rgba(228,87,46,0.25)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-150 cursor-pointer appearance-none",
            error ? "border-[#C94C4C] focus:border-[#C94C4C]" : "",
            className,
          ].join(" ")}
          {...props}
        >
          {children}
        </select>
        {hint && !error && <p className="text-[12px] text-[#737067]">{hint}</p>}
        {error && <p className="text-[12px] text-[#C94C4C]" role="alert">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";
