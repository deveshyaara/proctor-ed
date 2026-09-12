import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, rightAddon, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[#C9C3B5]"
          >
            {label}
            {props.required && (
              <span className="ml-1 text-[#E4572E]">*</span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 text-[#AAA69B] pointer-events-none">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={[
              "min-h-11 w-full rounded-[10px] border bg-[#191916] px-4 py-2 text-base text-[#F4F0E7] sm:text-sm",
              "placeholder:italic placeholder:text-[#B8B2A4]",
              "transition-colors duration-150",
              "focus:outline-none focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error ? "border-[#C94C4C] focus:border-[#C94C4C] focus:ring-[#C94C4C]/40" : "border-[rgba(244,240,231,0.09)] hover:border-[rgba(244,240,231,0.18)]",
              leftAddon ? "pl-10" : "",
              rightAddon ? "pr-10" : "",
              className,
            ].join(" ")}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-3 text-[#AAA69B]">
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-2 text-xs text-[#C94C4C]">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}

        {hint && !error && (
          <p className="text-sm text-[#C9C3B5]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
