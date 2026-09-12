"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const navItems = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Examinations",
    href: "/tests",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

export function DashboardShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const currentMenuButton = menuButtonRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (previous ?? currentMenuButton)?.focus();
    };
  }, [mobileMenuOpen]);

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const signOut = async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  const navigation = (mobile = false) => (
    <nav className="teacher-navigation space-y-1" aria-label="Teacher navigation">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => mobile && setMobileMenuOpen(false)}
            className={`flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm transition-colors ${
              active
                ? "border-l-2 border-[#E4572E] bg-[#191916] font-semibold text-[#F4F0E7]"
                : "text-[#C9C3B5] hover:bg-[#191916] hover:text-[#F4F0E7]"
            }`}
          >
            <span className={active ? "text-[#E4572E]" : "text-[#C9C3B5]"}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#E4572E] text-xs font-bold text-white">
        PE
      </div>
      <div>
        <div className="text-[13px] font-semibold tracking-tight text-[#F4F0E7]">
          ProctorED
        </div>
        <div className="text-[12px] text-[#C9C3B5]">Teacher workspace</div>
      </div>
    </div>
  );

  const sidebarFooter = (
    <div className="space-y-3 border-t border-[rgba(244,240,231,0.12)] pt-4">
      <div
        className="flex items-center justify-between rounded-[8px] border border-[rgba(244,240,231,0.12)] bg-[#191916] px-3 py-2.5 text-[13px] text-[#C9C3B5]"
        title="Proctoring services are online and ready to record exam sessions."
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#8FB392]" aria-hidden="true" />
          Systems online
        </span>
      </div>
      <button
        onClick={signOut}
        className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-sm text-[#C9C3B5] hover:bg-[#191916] hover:text-[#E07A7A]"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </div>
  );

  return (
    <div className="app-shell flex min-h-screen bg-[#11110F] text-[#F4F0E7]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[rgba(244,240,231,0.12)] bg-[#11110F] p-4 lg:flex">
        <div className="space-y-8">{brand}{navigation()}</div>
        <div className="mt-auto">{sidebarFooter}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[rgba(244,240,231,0.12)] bg-[#11110F] px-4 py-3 lg:hidden">
          <button
            ref={menuButtonRef}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-11 w-11 items-center justify-center rounded-[8px] text-[#C9C3B5] hover:bg-[#191916]"
          >
            ☰
          </button>
          <div className="text-xs font-semibold tracking-tight text-[#F4F0E7]">ProctorED</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#22211C] text-xs font-bold">{initials}</div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button aria-label="Close navigation menu" className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
            <aside
              ref={drawerRef}
              className="relative flex h-full w-[min(320px,86vw)] flex-col border-r border-[rgba(244,240,231,0.12)] bg-[#11110F] p-4 shadow-2xl"
            >
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-[0.04em]">ProctorED</span>
                  <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" className="h-11 w-11 text-xl">
                    ×
                  </button>
                </div>
                {navigation(true)}
              </div>
              <div className="mt-auto">{sidebarFooter}</div>
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
