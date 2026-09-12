"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function StudentLandingPage() {
  const router = useRouter();
  const [testCode, setTestCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleCodeChange(val: string) {
    const raw = val.replace(/\s+/g, "").toUpperCase();
    setTestCode(raw);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const code = testCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter a test code.");
      return;
    }
    if (code.length < 4 || code.length > 12) {
      setError("Test code must be between 4 and 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/student/tests/${code}/validate`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? "Test code not found. Check the code provided by your teacher.");
        return;
      }

      router.push(`/exam/${code}`);
    } catch {
      setError("Unable to connect to the examination server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayValue =
    testCode.length > 4 ? `${testCode.slice(0, 4)} ${testCode.slice(4)}` : testCode;

  return (
    <div className="flex min-h-screen min-w-0 flex-col justify-between overflow-x-hidden bg-atmosphere text-[#F4F0E7] selection:bg-[#E4572E]/30 selection:text-[#F4F0E7]">
      <header className="flex items-center justify-between border-b border-[rgba(244,240,231,0.12)] bg-[#11110F] px-6 py-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#E4572E] text-xs font-bold text-white">
            PE
          </div>
          <span className="truncate text-sm font-semibold tracking-tight text-[#F4F0E7]">ProctorED</span>
        </div>

        <Link
          href="/login"
          className="shrink-0 rounded-[8px] px-3 py-2 text-sm font-medium text-[#C9C3B5] transition-colors hover:bg-[#191916] hover:text-[#F4F0E7]"
        >
          Teacher login →
        </Link>
      </header>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-[480px] space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-[28px] font-semibold leading-snug tracking-tight text-[#F4F0E7] sm:text-[32px]">
              Begin your examination
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-normal text-[#C9C3B5]">
              Enter the unique test code provided by your tuition teacher.
            </p>
          </div>

          <div className="min-w-0 space-y-8 overflow-visible rounded-[16px] border border-[rgba(244,240,231,0.12)] bg-[#191916] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.3)] sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5" id="test-code-form">
              <div className="space-y-2">
                <label htmlFor="test-code" className="block text-sm font-medium text-[#C9C3B5]">
                  Test code
                </label>

                <input
                  id="test-code"
                  type="text"
                  value={displayValue}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="MATH 7284"
                  maxLength={13}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                  className={[
                    "h-[56px] w-full min-w-0 rounded-[10px] border bg-[#11110F] px-3 text-center font-mono text-xl tracking-[0.18em] text-[#F4F0E7] sm:px-4 sm:text-2xl",
                    "transition-colors duration-150",
                    "placeholder:text-base placeholder:italic placeholder:tracking-normal placeholder:text-[#B8B2A4]",
                    "focus:outline-none focus:ring-1",
                    error
                      ? "border-[#E07A7A] focus:border-[#E07A7A] focus:ring-[#E07A7A]/40"
                      : "border-[rgba(244,240,231,0.12)] hover:border-[rgba(244,240,231,0.22)] focus:border-[#E4572E]/50 focus:ring-[#E4572E]/50",
                  ].join(" ")}
                />

                {error && (
                  <p className="flex items-center gap-2 pt-1 text-sm text-[#E07A7A]">
                    <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </p>
                )}
              </div>

              <Button
                type="submit"
                loading={loading}
                variant="primary"
                size="lg"
                className="h-[50px] w-full rounded-[10px] text-base font-medium"
                id="enter-test-code"
              >
                {loading ? "Verifying code..." : "Continue to verification"}
              </Button>

              {process.env.NODE_ENV === "development" && (
                <p className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-[#C9C3B5]">
                  <span>Demo test code</span>
                  <button
                    type="button"
                    onClick={() => handleCodeChange("MATH7284")}
                    className="cursor-pointer font-mono text-sm font-medium text-[#F4F0E7] underline-offset-2 hover:underline"
                  >
                    MATH7284
                  </button>
                </p>
              )}
            </form>

            <div className="space-y-4 border-t border-[rgba(244,240,231,0.12)] pt-6">
              <div className="text-center text-sm font-medium text-[#C9C3B5]">Before you begin</div>

              <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <li className="flex items-center gap-2 font-medium text-[#F4F0E7]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E4572E] text-[11px] font-semibold text-white">
                    1
                  </span>
                  <span className="text-sm">Identity</span>
                </li>
                <li className="hidden h-px flex-1 bg-[rgba(244,240,231,0.12)] sm:block" aria-hidden="true" />
                <li className="flex items-center gap-2 text-[#C9C3B5]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22211C] text-[11px] font-semibold">
                    2
                  </span>
                  <span className="text-sm">Environment</span>
                </li>
                <li className="hidden h-px flex-1 bg-[rgba(244,240,231,0.12)] sm:block" aria-hidden="true" />
                <li className="flex items-center gap-2 text-[#C9C3B5]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#22211C] text-[11px] font-semibold">
                    3
                  </span>
                  <span className="text-sm">Examination</span>
                </li>
              </ol>
            </div>
          </div>

          <div className="space-y-1 text-center text-sm text-[#C9C3B5]">
            <p>No student account required.</p>
            <p>Answers are automatically saved during the examination.</p>
          </div>
        </div>
      </main>

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-[rgba(244,240,231,0.12)] px-6 py-4 text-sm text-[#C9C3B5] sm:flex-row sm:px-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#F4F0E7]">ProctorED</span>
          <span aria-hidden="true">·</span>
          <span>Online examination platform</span>
        </div>
        <div className="text-center sm:text-right">Need help? Ask your teacher for the test code and exam instructions.</div>
      </footer>
    </div>
  );
}
