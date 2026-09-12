"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#E4572E] hover:bg-[#F06A43] text-[#F4F0E7] font-medium border border-[#E4572E]/20 shadow-sm",
  secondary:
    "bg-[#22211C] hover:bg-[#2B2923] text-[#F4F0E7] border border-[rgba(244,240,231,0.09)] hover:border-[rgba(244,240,231,0.18)] shadow-sm",
  danger:
    "bg-[#C94C4C] hover:bg-[#D45959] text-[#F4F0E7] border border-[#C94C4C]/30 shadow-sm",
  ghost:
    "bg-transparent hover:bg-[#191916] text-[#C9C3B5] hover:text-[#F4F0E7] border border-[rgba(244,240,231,0.12)]",
  outline:
    "bg-transparent hover:bg-[#191916] text-[#F4F0E7] border border-[rgba(244,240,231,0.12)] hover:border-[rgba(244,240,231,0.24)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "min-h-11 px-3 py-2 text-sm gap-1 rounded-[8px]",
  sm: "min-h-11 min-w-[5.5rem] px-4 py-2 text-sm gap-2 rounded-[8px]",
  md: "min-h-11 px-4 py-2 text-sm gap-2 rounded-[10px]",
  lg: "min-h-12 px-5 py-3 text-sm sm:text-base gap-2 rounded-[12px] font-medium",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          "inline-flex items-center justify-center select-none font-medium",
          "transition-all duration-150 cursor-pointer active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E4572E]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#11110F]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(" ")}
        {...props}
      >
        {loading ? (
          <Spinner size={size === "sm" || size === "xs" ? "xs" : "sm"} />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
