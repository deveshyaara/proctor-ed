"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";

interface TestDetailClientProps {
  test: {
    id: string;
    title: string;
    testCode: string;
    status: string;
    subject: string;
    className: string;
    questionsCount: number;
    attemptsCount: number;
  };
}

export function TestDetailClient({ test }: TestDetailClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const copyCode = () => {
    navigator.clipboard.writeText(test.testCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getShareUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/exam/${test.testCode}`;
    }
    return `/exam/${test.testCode}`;
  };

  const shareWhatsApp = () => {
    const text = `Hello Students, please take your ${test.subject} exam (${test.title}) by going to: ${getShareUrl()} or enter test code: ${test.testCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handlePublish = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to publish test.");
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to publish.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to close test.");
      setShowCloseDialog(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to close.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/archive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to archive test.");
      setShowArchiveDialog(false);
      router.push("/tests");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to archive.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {errorMessage && (
        <div className="p-4 rounded-[12px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[14px] flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-[13px] font-bold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Prominent Test Code Banner */}
      {test.status === "PUBLISHED" && (
        <div className="bg-gradient-to-r from-[#191916] to-[#22211C] border border-[#E4572E]/30 rounded-[16px] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <span className="text-[12px] font-mono tracking-wider text-[#AAA69B] uppercase font-semibold">
              Live Examination Code
            </span>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <span className="text-[32px] sm:text-[40px] font-mono font-bold text-[#E4572E] tracking-widest select-all">
                {test.testCode}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#7A9E7E]/15 text-[#7A9E7E] border border-[#7A9E7E]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7A9E7E] animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-[13px] text-[#AAA69B]">
              Share this code with your class. Students enter it at the homepage to take the exam.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center">
            <Button
              variant="secondary"
              onClick={copyCode}
              className="min-w-[130px]"
            >
              {copied ? "✓ Copied!" : "Copy Code"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowShareModal(true)}
              className="min-w-[130px] border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10"
            >
              Share Link
            </Button>
          </div>
        </div>
      )}

      {/* Action Bar based on Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[14px] bg-[#191916] border border-[rgba(244,240,231,0.08)]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[#AAA69B]">Actions:</span>
          {test.status === "DRAFT" && (
            <Badge variant="warning">Draft (Unpublished)</Badge>
          )}
          {test.status === "PUBLISHED" && (
            <Badge variant="success">Published & Accepting Submissions</Badge>
          )}
          {test.status === "CLOSED" && (
            <Badge variant="neutral">Closed</Badge>
          )}
          {test.status === "ARCHIVED" && (
            <Badge variant="neutral">Archived</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {test.status === "DRAFT" && (
            <Button
              variant="primary"
              onClick={handlePublish}
              disabled={actionLoading || test.questionsCount === 0}
            >
              {actionLoading ? "Publishing..." : "Publish Exam"}
            </Button>
          )}

          <Link href={`/tests/${test.id}/results`}>
            <Button variant="secondary">
              View Results ({test.attemptsCount})
            </Button>
          </Link>

          {test.status === "PUBLISHED" && (
            <Button
              variant="secondary"
              onClick={() => setShowCloseDialog(true)}
              className="text-[#E4572E] hover:bg-[#E4572E]/10"
            >
              Close Exam
            </Button>
          )}

          {test.status === "CLOSED" && (
            <Button
              variant="secondary"
              onClick={() => setShowArchiveDialog(true)}
              className="text-[#AAA69B] hover:text-[#F4F0E7]"
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* WhatsApp / Share Modal */}
      {showShareModal && (
        <Dialog
          isOpen={true}
          title="Share Examination Link"
          onClose={() => setShowShareModal(false)}
        >
          <div className="space-y-4 py-2">
            <p className="text-[13px] text-[#AAA69B]">
              Send this direct link to your students on WhatsApp or Google Classroom:
            </p>

            <div className="p-3 bg-[#22211C] border border-[rgba(244,240,231,0.12)] rounded-[10px] font-mono text-[13px] text-[#F4F0E7] select-all break-all">
              {getShareUrl()}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(getShareUrl());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "✓ Copied!" : "Copy Direct Link"}
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-black font-semibold"
                onClick={shareWhatsApp}
              >
                Share via WhatsApp
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Close Exam Confirmation Dialog */}
      {showCloseDialog && (
        <Dialog
          isOpen={true}
          title="Close Examination?"
          onClose={() => setShowCloseDialog(false)}
        >
          <div className="space-y-4 py-2">
            <p className="text-[14px] text-[#AAA69B]">
              Closing this exam will prevent new students from starting. Any students currently writing will still be permitted to finish and submit.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowCloseDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleClose}
                disabled={actionLoading}
                className="bg-[#E4572E] hover:bg-[#F06A43]"
              >
                {actionLoading ? "Closing..." : "Yes, Close Exam"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Archive Confirmation Dialog */}
      {showArchiveDialog && (
        <Dialog
          isOpen={true}
          title="Archive Examination?"
          onClose={() => setShowArchiveDialog(false)}
        >
          <div className="space-y-4 py-2">
            <p className="text-[14px] text-[#AAA69B]">
              Archived exams will be moved out of your active exams list. All student attempt scores and submissions remain securely preserved.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowArchiveDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleArchive}
                disabled={actionLoading}
              >
                {actionLoading ? "Archiving..." : "Yes, Archive Exam"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
