"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

interface NavItem {
  label: string;
  href: string;
  badge?: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Examinations",
    href: "/tests",
    badge: "1 Live",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: "Question Bank",
    href: "/questions",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    label: "Students",
    href: "/students",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: "Proctoring Review",
    href: "/proctoring",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const futureItems = new Set(["/questions", "/students", "/proctoring", "/settings"]);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 bg-[#11110F] border-r border-[rgba(244,240,231,0.08)] flex flex-col justify-between shrink-0 min-h-screen">
      {/* Top section */}
      <div className="p-4 space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-7 h-7 rounded-[6px] bg-[#E4572E] flex items-center justify-center text-white font-bold text-xs tracking-wider shrink-0">
            PE
          </div>
          <div>
            <div className="text-[13px] font-bold text-[#F4F0E7] tracking-[0.05em] uppercase font-mono">
              PROCTOR<span className="text-[#E4572E]">ED</span>
            </div>
            <div className="text-[11px] text-[#AAA69B]">Tuition Platform</div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const isFuture = futureItems.has(item.href);

            return (
              <Link
                key={item.href}
                href={isFuture ? "#" : item.href}
                onClick={isFuture ? (e) => e.preventDefault() : undefined}
                className={[
                  "relative flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] transition-colors duration-150",
                  active
                    ? "bg-[#191916] text-[#F4F0E7] font-semibold border-l-2 border-[#E4572E] pl-2.5"
                    : "text-[#AAA69B] hover:text-[#F4F0E7] hover:bg-[#191916]/50 font-normal",
                  isFuture ? "opacity-40 cursor-not-allowed hover:bg-transparent" : "",
                ].join(" ")}
              >
                <span className={active ? "text-[#E4572E]" : "text-[#AAA69B]"}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && !isFuture && (
                  <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-[#E4572E]/10 text-[#E4572E] border border-[#E4572E]/20">
                    {item.badge}
                  </span>
                )}
                {isFuture && (
                  <span className="text-[9px] font-mono text-[#737067] uppercase">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="p-4 border-t border-[rgba(244,240,231,0.06)] space-y-3">
        {/* Operational indicator */}
        <div className="px-3 py-2 rounded-[8px] bg-[#191916] border border-[rgba(244,240,231,0.06)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7A9E7E]" />
            <span className="text-[11px] text-[#AAA69B]">Proctoring System</span>
          </div>
          <span className="text-[10px] font-mono text-[#7A9E7E] uppercase font-medium">Ready</span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#AAA69B] hover:text-[#C94C4C] transition-colors rounded-[8px] hover:bg-[#191916] cursor-pointer"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
