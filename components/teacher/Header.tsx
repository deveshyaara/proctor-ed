import { getSession } from "@/lib/auth/helpers";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  action?: React.ReactNode;
}

export async function Header({ title, subtitle, actions, action }: HeaderProps) {
  const renderedActions = actions ?? action;
  const session = await getSession();
  const userName = session?.user?.name ?? "Teacher";
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="border-b border-[rgba(244,240,231,0.12)] bg-[#11110F] px-6 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-[#C9C3B5]">
            ProctorED <span className="text-[#B8B2A4]">/</span>{" "}
            <span className="text-[#F4F0E7]">{title}</span>
          </p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[#F4F0E7]">{title}</h1>
            {subtitle && <span className="text-sm text-[#C9C3B5]">{subtitle}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-[40px] items-center gap-1.5 rounded-[8px] border border-[rgba(244,240,231,0.12)] bg-[#191916] px-3 py-2 text-sm font-medium text-[#C9C3B5] transition-colors hover:bg-[#22211C] hover:text-[#F4F0E7] md:inline-flex"
          >
            <span>Student gateway</span>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {renderedActions ? (
            renderedActions
          ) : (
            <Link href="/tests/create">
              <Button
                variant="primary"
                size="md"
                className="h-[40px] px-4 font-medium"
                leftIcon={
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                }
              >
                Create examination
              </Button>
            </Link>
          )}

          <div className="flex items-center gap-2 border-l border-[rgba(244,240,231,0.12)] pl-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[rgba(244,240,231,0.12)] bg-[#22211C] text-xs font-bold text-[#F4F0E7]">
              {initials}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
