"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDuration } from "@/lib/utils/format";

interface TestMeta {
  title: string;
  subject: string;
  className: string;
  durationSeconds: number;
}

export default function StudentEntrancePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  const [test, setTest] = useState<TestMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadTest() {
      try {
        const res = await fetch(`/api/student/tests/${code}`);
        const data = await res.json();
        if (!res.ok) {
          setErrorCode(data.error?.code || "ERROR");
          setErrorMessage(data.error?.message || "Failed to find test.");
        } else {
          setTest(data.test || data);
        }
      } catch {
        setErrorCode("NETWORK_ERROR");
        setErrorMessage("Network error. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    }
    loadTest();
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!studentName.trim() || studentName.trim().length < 2) {
      errors.studentName = "Please enter your full name (minimum 2 characters).";
    }
    if (!rollNumber.trim()) {
      errors.rollNumber = "Roll number or Student ID is required.";
    }

    if (Object.keys(errors).length > 0) {
      setInputErrors(errors);
      return;
    }

    setSubmitting(true);
    setInputErrors({});

    try {
      const res = await fetch("/api/student/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCode: code,
          studentName: studentName.trim(),
          rollNumber: rollNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Could not start attempt.");
      }

      // Next step: setup camera and proctoring
      router.push(`/exam/${code}/setup?attemptId=${data.attemptId}`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to enter exam.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#E4572E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-[#AAA69B]">Loading examination details...</p>
        </div>
      </div>
    );
  }

  if (errorCode || !test) {
    return (
      <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex items-center justify-center p-4">
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-6 sm:p-8 max-w-md w-full text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-[#E4572E]/15 text-[#E4572E] flex items-center justify-center text-xl mx-auto">
            ✕
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-[#F4F0E7]">
              Examination Unavailable
            </h1>
            <p className="mt-2 text-[13px] text-[#AAA69B] leading-relaxed">
              {errorMessage || "The test code you entered could not be found or is not active."}
            </p>
          </div>
          <div className="pt-2">
            <Link href="/">
              <Button variant="secondary" className="w-full">
                ← Return to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#11110F] text-[#F4F0E7] flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="max-w-lg w-full mx-auto space-y-6">
        {/* Branding header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <span className="w-7 h-7 rounded-[8px] bg-[#E4572E] flex items-center justify-center text-white font-bold text-sm">
              P
            </span>
            <span className="font-bold text-[18px] tracking-tight text-[#F4F0E7]">
              Proctor<span className="text-[#E4572E]">ED</span>
            </span>
          </Link>
          <h1 className="text-[28px] font-bold text-[#F4F0E7] tracking-tight">
            Student Examination Portal
          </h1>
          <p className="text-[13px] text-[#AAA69B]">
            Please enter your identification details to proceed.
          </p>
        </div>

        {/* Test Card Preview */}
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="neutral">{test.subject}</Badge>
            <span className="text-[12px] font-mono text-[#AAA69B]">
              Duration: {formatDuration(test.durationSeconds)}
            </span>
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-[#F4F0E7]">{test.title}</h2>
            <p className="text-[13px] text-[#AAA69B]">{test.className}</p>
          </div>
        </div>

        {/* Identity Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-6 sm:p-7 space-y-5 shadow-sm"
        >
          {errorMessage && (
            <div className="p-3 rounded-[10px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[13px]">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="student-name" className="mb-2 block text-[13px] font-medium text-[#F4F0E7]">
                Full Name <span className="text-[#E4572E]">*</span>
              </label>
              <Input
                type="text"
                id="student-name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full text-[16px]"
                autoFocus
              />
              {inputErrors.studentName && (
                <p className="text-[12px] text-[#E4572E] mt-1">
                  {inputErrors.studentName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="roll-number" className="mb-2 block text-[13px] font-medium text-[#F4F0E7]">
                Roll Number / Student ID <span className="text-[#E4572E]">*</span>
              </label>
              <Input
                type="text"
                id="roll-number"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 10B-24"
                className="w-full text-[16px]"
              />
              {inputErrors.rollNumber && (
                <p className="text-[12px] text-[#E4572E] mt-1">
                  {inputErrors.rollNumber}
                </p>
              )}
            </div>
          </div>

          <div className="p-3 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.06)] text-[12px] text-[#AAA69B] leading-relaxed">
            ℹ️ <strong className="text-[#F4F0E7]">Important:</strong> Make sure your roll number matches your school/tuition records. In the next step, your camera and environment will be checked.
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            className="w-full h-12 text-[15px] font-medium"
          >
            {submitting ? "Verifying..." : "Continue to Environment Check →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
