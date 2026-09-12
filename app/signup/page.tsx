"use client";

import { useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { authClient, provisionTeacherAccount } from "@/lib/auth/client";

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#11110F]">
          <Spinner size="md" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingRef.current) return;

    pendingRef.current = true;
    setError("");
    setLoading(true);

    try {
      if (!otpSent) {
        const { error: signUpError } = await authClient.signUp.email({
          email: email.trim(),
          password: password,
          name: name.trim() || email.trim().split("@")[0],
        });

        if (signUpError) {
          setError(signUpError.message || "An error occurred during registration. Please try again.");
          return;
        }

        setOtpSent(true);
      } else {
        // Verify OTP
        const { error: verifyError } = await authClient.emailOtp.verifyEmail({
          email: email.trim(),
          otp: otp.trim(),
        });

        if (verifyError) {
          setError(verifyError.message || "Invalid or expired verification code.");
          return;
        }

        const { error: signInError } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message || "Email verified. Sign in again to finish setup.");
          return;
        }

        const provisionResult = await provisionTeacherAccount();
        if (provisionResult.error) {
          setError(provisionResult.error);
          return;
        }

        // Successful verification
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-atmosphere text-[#F4F0E7] selection:bg-[#E4572E]/30 selection:text-[#F4F0E7]">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-[rgba(244,240,231,0.06)] bg-[#11110F]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[6px] bg-[#E4572E] flex items-center justify-center text-white font-bold text-xs font-mono">
            PE
          </div>
          <span className="font-mono text-sm font-bold tracking-[0.06em] text-[#F4F0E7] uppercase">
            PROCTOR<span className="text-[#E4572E]">ED</span>
          </span>
        </div>

        <Link
          href="/"
          className="rounded-[8px] px-3 py-2 text-xs font-medium text-[#AAA69B] transition-colors hover:bg-[#191916] hover:text-[#F4F0E7]"
        >
          ← Student gateway
        </Link>
      </header>

      {/* ── Main SignUp Container ──────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 sm:py-14">
        <div className="w-full max-w-5xl grid items-center gap-10 lg:grid-cols-[1fr_420px]">
          <section className="hidden lg:block max-w-lg space-y-8">
            <div className="flex items-center gap-3 text-xs font-mono uppercase text-[#AAA69B]">
              <span className="h-px w-10 bg-[#E4572E]" />
              New teacher account
            </div>
            <div className="space-y-5">
              <h1 className="max-w-md text-5xl font-semibold leading-[1.05] text-[#F4F0E7]">
                Build assessments with intention.
              </h1>
              <p className="max-w-md text-base leading-7 text-[#AAA69B]">
                Your workspace is designed for the moments around the test: preparation, focus, and confident review.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#AAA69B]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E4572E]/40 font-mono text-xs text-[#E4572E]">1</span>
              <span className={otpSent ? "text-[#737067] line-through" : "text-[#F4F0E7]"}>Create account</span>
              <span className="h-px w-8 bg-[rgba(244,240,231,0.14)]" />
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#7A9E7E]/40 font-mono text-xs text-[#7A9E7E]">2</span>
              <span className={otpSent ? "text-[#F4F0E7]" : "text-[#737067]"}>Verify email</span>
            </div>
          </section>

        <div className="w-full max-w-[420px] space-y-6 lg:justify-self-end">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mb-5 flex items-center justify-center gap-2 lg:hidden">
              <span className={`h-1.5 w-10 rounded-full ${otpSent ? "bg-[#7A9E7E]" : "bg-[#E4572E]"}`} />
              <span className={`h-1.5 w-10 rounded-full ${otpSent ? "bg-[#7A9E7E]" : "bg-[#22211C]"}`} />
            </div>
            <h1 className="text-[28px] font-bold tracking-tight text-[#F4F0E7]">
              {otpSent ? "Verify Email" : "Create an Account"}
            </h1>
            <p className="text-xs sm:text-sm text-[#AAA69B]">
              {otpSent
                ? "Enter the 6-digit code sent to your email."
                : "Sign up for a teacher account to manage examinations."}
            </p>
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#E4572E]/20 bg-[#E4572E]/10 px-3 py-1.5 text-[11px] text-[#AAA69B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E4572E]" />
              {otpSent ? "One last step" : "Takes about a minute"}
            </div>
          </div>

          {/* Form Card */}
          <div className="rounded-[16px] border border-[rgba(244,240,231,0.11)] bg-[#191916]/95 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-8 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4" id="signup-form">
              {!otpSent ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor="name" className="block text-xs font-medium text-[#AAA69B]">
                      Full Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      autoFocus
                      className="w-full h-[50px] bg-[#11110F] border border-[rgba(244,240,231,0.1)] hover:border-[rgba(244,240,231,0.2)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50 rounded-[10px] px-4 text-sm text-[#F4F0E7] placeholder:text-[#55524A] transition-colors outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-xs font-medium text-[#AAA69B]">
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
                      className="w-full h-[50px] bg-[#11110F] border border-[rgba(244,240,231,0.1)] hover:border-[rgba(244,240,231,0.2)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50 rounded-[10px] px-4 text-sm text-[#F4F0E7] placeholder:text-[#55524A] transition-colors outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-xs font-medium text-[#AAA69B]">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="w-full h-[50px] bg-[#11110F] border border-[rgba(244,240,231,0.1)] hover:border-[rgba(244,240,231,0.2)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50 rounded-[10px] pl-4 pr-12 text-sm text-[#F4F0E7] placeholder:text-[#55524A] transition-colors outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1 w-11 h-11 flex items-center justify-center text-[#AAA69B] hover:text-[#F4F0E7] cursor-pointer"
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#737067]">Use at least 8 characters. You will need it after verification.</p>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="mb-4 rounded-[10px] border border-[#7A9E7E]/20 bg-[#7A9E7E]/10 px-3 py-2 text-xs leading-5 text-[#AAA69B]">
                    We sent a six-digit code to your email. It may take a minute to arrive.
                  </p>
                  <label htmlFor="otp" className="block text-xs font-medium text-[#AAA69B]">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    className="w-full h-[50px] text-center tracking-[0.2em] font-mono bg-[#11110F] border border-[rgba(244,240,231,0.1)] hover:border-[rgba(244,240,231,0.2)] focus:border-[#E4572E]/50 focus:ring-1 focus:ring-[#E4572E]/50 rounded-[10px] px-4 text-lg text-[#F4F0E7] placeholder:text-[#55524A] transition-colors outline-none"
                  />
                </div>
              )}

              {error && (
                <div role="alert" aria-live="polite" className="p-3 rounded-[8px] bg-[#C94C4C]/10 border border-[#C94C4C]/25 text-xs text-[#C94C4C] flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
                className="w-full h-[50px] text-sm font-medium rounded-[10px]"
                id="submit-signup"
              >
                {loading ? (otpSent ? "Verifying..." : "Creating account...") : (otpSent ? "Verify Account" : "Create account")}
              </Button>
            </form>

            <div className="pt-4 border-t border-[rgba(244,240,231,0.06)] text-center space-y-3">
              <div className="text-sm text-[#AAA69B]">
                {otpSent ? "Entered the wrong email?" : "Already have an account?"}{" "}
                {otpSent ? (
                  <button
                    type="button"
                    onClick={() => {
                      router.push("/signup");
                      setOtpSent(false);
                      setOtp("");
                      setError("");
                    }}
                    className="text-[#E4572E] hover:text-[#F4F0E7] transition-colors font-medium"
                  >
                    Go back
                  </button>
                ) : (
                  <Link href="/login" className="text-[#E4572E] hover:text-[#F4F0E7] transition-colors font-medium">
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="text-center py-4 text-xs text-[#737067] border-t border-[rgba(244,240,231,0.06)]">
        ProctorED — Secure Proctoring Administration
      </footer>
    </div>
  );
}
