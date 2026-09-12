type BadgeVariant =
  | "default"
  | "live"
  | "operational"
  | "review"
  | "high-priority"
  | "info"
  | "success"
  | "warning"
  | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "bg-[#22211C] text-[#C9C3B5] border border-[rgba(244,240,231,0.12)]",
  neutral:
    "bg-[#22211C] text-[#C9C3B5] border border-[rgba(244,240,231,0.12)]",
  live:
    "bg-[#8FB392]/10 text-[#8FB392] border border-[#8FB392]/25 font-semibold",
  operational:
    "bg-[#8FB392]/10 text-[#8FB392] border border-[#8FB392]/25",
  success:
    "bg-[#8FB392]/10 text-[#8FB392] border border-[#8FB392]/25",
  review:
    "bg-[#D6A84F]/10 text-[#D6A84F] border border-[#D6A84F]/25",
  warning:
    "bg-[#D6A84F]/10 text-[#D6A84F] border border-[#D6A84F]/25",
  "high-priority":
    "bg-[#C94C4C]/10 text-[#C94C4C] border border-[#C94C4C]/25",
  info:
    "bg-[#7193A8]/10 text-[#7193A8] border border-[#7193A8]/25",
};

const dotClasses: Record<BadgeVariant, string> = {
  default: "bg-[#C9C3B5]",
  neutral: "bg-[#C9C3B5]",
  live: "bg-[#8FB392]",
  operational: "bg-[#8FB392]",
  success: "bg-[#8FB392]",
  review: "bg-[#D6A84F]",
  warning: "bg-[#D6A84F]",
  "high-priority": "bg-[#C94C4C]",
  info: "bg-[#7193A8]",
};

export function Badge({
  variant = "default",
  children,
  className = "",
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-0.5",
        "text-[12px] font-medium tracking-wide rounded-full select-none",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClasses[variant]}`}
        />
      )}
      {children}
    </span>
  );
}

// Convenience status badge for tests
export function TestStatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return (
      <Badge variant="live" dot>
        Live
      </Badge>
    );
  }
  if (status === "CLOSED") {
    return (
      <Badge variant="default" dot>
        Closed
      </Badge>
    );
  }
  if (status === "ARCHIVED") {
    return (
      <Badge variant="high-priority" dot>
        Archived
      </Badge>
    );
  }
  return (
    <Badge variant="review" dot>
      Draft
    </Badge>
  );
}
