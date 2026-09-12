"use client";

import { useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { authClient, provisionTeacherAccount } from "@/lib/auth/client";

/** Ensure callback URL is an internal relative path (prevent open redirect) */
function getSafeCallbackUrl(rawUrl: string | null): string {
  if (!rawUrl) return "/dashboard";
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//") && !rawUrl.startsWith("/\\")) {
    return rawUrl;
  }
  return "/dashboard";
}

type SignInErrorCode =
  | "INVALID_EMAIL_OR_PASSWORD"
  | "EMAIL_NOT_VERIFIED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "TOO_MANY_REQUESTS"
  | "INVALID_EMAIL"
  | "AUTH_SERVICE_UNAVAILABLE";

type SignInFailure = {
  code?: SignInErrorCode | string;
  message?: string;
};

function getSignInErrorMessage(status: number, failure: SignInFailure): string {
  switch (failure.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "The email or password is incorrect.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email before signing in. Use the verification code from signup, then try again.";
    case "FORBIDDEN":
      return "This sign-in is valid, but the account is not authorized for the ProctorED teacher dashboard.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Too many sign-in attempts. Wait a few minutes before trying again.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "AUTH_SERVICE_UNAVAILABLE":
      return "The authentication service is temporarily unavailable. Try again in a moment.";
    default:
      if (status === 401) return "The email or password is incorrect.";
      if (status === 403) return "This account is not authorized for the ProctorED teacher dashboard.";
      if (status === 400) return "Check your email and password, then try again.";
      if (status >= 500) return "The authentication service is temporarily unavailable. Try again in a moment.";
      return "The sign-in service is unavailable. Try again in a moment.";
  }
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#11110F]">
          <Spinner size="md" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(rawCallbackUrl);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pendingLoginRef = useRef(false);

  async function handleLogin(userEmail: string, userPass: string) {
    if (pendingLoginRef.current) return;

    pendingLoginRef.current = true;
    setError("");
    setLoading(true);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email: userEmail.trim(),
        password: userPass,
      });

      if (signInError) {
        setError(
          getSignInErrorMessage(signInError.status || 401, {
            code: signInError.code,
            message: signInError.message,
          })
        );
        return;
      }

      const provisionResult = await provisionTeacherAccount();
      if (provisionResult.error) {
        setError(provisionResult.error);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("An unexpected authentication error occurred.");
    } finally {
      pendingLoginRef.current = false;
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleLogin(email, password);
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-atmosphere text-[#F4F0E7] selection:bg-[#E4572E]/30 selection:text-[#F4F0E7]">
      <header className="flex items-center justify-between border-b border-[rgba(244,240,231,0.12)] bg-[#11110F] px-6 py-4 sm:px-10">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#E4572E] text-xs font-bold text-white">
            PE
          </div>
          <span className="truncate text-sm font-semibold tracking-tight text-[#F4F0E7]">ProctorED</span>
        </div>

        <Link
          href="/"
          className="rounded-[8px] px-3 py-2 text-sm font-medium text-[#C9C3B5] transition-colors hover:bg-[#191916] hover:text-[#F4F0E7]"
        >
          ← Student gateway
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 sm:py-14">
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_420px]">
          <section className="hidden max-w-lg space-y-8 lg:block">
            <p className="text-sm font-medium uppercase tracking-[0.08em] text-[#C9C3B5]">Teacher access</p>
            <div className="space-y-5">
              <h1 className="max-w-md text-5xl font-semibold leading-[1.05] text-[#F4F0E7]">
                Keep every exam session in view.
              </h1>
              <p className="max-w-md text-base leading-7 text-[#C9C3B5]">
                Create focused assessments, monitor integrity signals, and review results from one calm command center.
              </p>
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div className="border-l-2 border-[#8FB392] bg-[#191916]/70 px-4 py-3">
                <p className="text-base font-semibold text-[#F4F0E7]">Secure sign-in</p>
                <p className="mt-1 text-sm text-[#C9C3B5]">Verified teacher accounts only</p>
              </div>
              <div className="border-l-2 border-[#8AADC0] bg-[#191916]/70 px-4 py-3">
                <p className="text-base font-semibold text-[#F4F0E7]">Always-on visibility</p>
                <p className="mt-1 text-sm text-[#C9C3B5]">Live exams and results in one place</p>
              </div>
            </div>
          </section>

          <div className="mx-auto w-full max-w-[420px] space-y-6 lg:mx-0 lg:justify-self-end">
            <div className="space-y-2 text-center">
              <h2 className="text-[28px] font-semibold tracking-tight text-[#F4F0E7]">Teacher command center</h2>
              <p className="text-sm text-[#C9C3B5]">
                Sign in to manage examinations and review proctoring records.
              </p>
            </div>

            <div className="space-y-5 rounded-[16px] border border-[rgba(244,240,231,0.12)] bg-[#191916]/95 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-[#C9C3B5]">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="teacher@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="h-[50px] w-full rounded-[10px] border border-[rgba(244,240,231,0.12)] bg-[#11110F] px-4 text-base text-[#F4F0E7] outline-none transition-colors placeholder:italic placeholder:text-[#B8B2A4] hover:border-[rgba(244,240,231,0.22)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-[#C9C3B5]">
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-[50px] w-full rounded-[10px] border border-[rgba(244,240,231,0.12)] bg-[#11110F] py-2 pl-4 pr-12 text-lg tracking-wide text-[#F4F0E7] outline-none transition-colors placeholder:text-sm placeholder:italic placeholder:tracking-normal placeholder:text-[#B8B2A4] hover:border-[rgba(244,240,231,0.22)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1 flex h-11 w-11 cursor-pointer items-center justify-center text-[#C9C3B5] hover:text-[#F4F0E7]"
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-[#C9C3B5]">Use the password connected to your verified teacher account.</p>
                </div>

                {error && (
                  <div role="alert" aria-live="polite" className="flex items-center gap-2 rounded-[8px] border border-[#E07A7A]/25 bg-[#E07A7A]/10 p-3 text-sm text-[#E07A7A]">
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  loading={loading}
                  disabled={loading}
                  variant="primary"
                  size="lg"
                  className="h-[50px] w-full rounded-[10px] text-sm font-medium"
                  id="submit-login"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="space-y-3 border-t border-[rgba(244,240,231,0.12)] pt-4 text-center">
                <div className="text-sm text-[#C9C3B5]">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="font-medium text-[#F4F0E7] underline-offset-2 hover:underline">
                    Sign up
                  </Link>
                </div>
                <p className="text-sm text-[#C9C3B5]">
                  Teacher accounts must be verified through email before sign-in.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[rgba(244,240,231,0.12)] px-6 py-4 text-center text-sm text-[#C9C3B5]">
        ProctorED — Secure proctoring administration
      </footer>
    </div>
  );
}
