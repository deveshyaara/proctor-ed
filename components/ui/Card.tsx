import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: "sm" | "md" | "lg" | "none";
  variant?: "solid" | "elevated" | "muted";
}

const paddingClasses = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
};

const variantClasses = {
  solid: "bg-[#191916] border border-[rgba(244,240,231,0.08)]",
  elevated: "bg-[#22211C] border border-[rgba(244,240,231,0.09)]",
  muted: "bg-[#151513] border border-[rgba(244,240,231,0.05)]",
};

export function Card({
  children,
  className = "",
  hover = false,
  padding = "md",
  variant = "solid",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-[14px] relative transition-colors duration-150 shadow-[0_1px_3px_0_rgba(0,0,0,0.3)]",
        variantClasses[variant],
        hover ? "hover:border-[rgba(244,240,231,0.18)] cursor-pointer" : "",
        paddingClasses[padding],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between border-b border-[rgba(244,240,231,0.06)] pb-3.5 mb-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-[15px] font-semibold text-[#F4F0E7] tracking-tight ${className}`}>
      {children}
    </h3>
  );
}
