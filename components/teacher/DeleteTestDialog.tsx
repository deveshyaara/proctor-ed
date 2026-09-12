"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface DeleteTestDialogProps {
  open: boolean;
  onClose: () => void;
  test: {
    id: string;
    title: string;
    testCode: string;
    status: string;
    attemptsCount: number;
    questionsCount: number;
  };
  onDeleted?: (testId: string) => void;
  onArchived?: (testId: string) => void;
  onClosed?: (testId: string) => void;
}

export function DeleteTestDialog({
  open,
  onClose,
  test,
  onDeleted,
  onArchived,
  onClosed,
}: DeleteTestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // For tests with submissions: typed confirmation
  const [showForceDelete, setShowForceDelete] = useState(false);
  const [typedCode, setTypedCode] = useState("");

  const isLive = test.status === "PUBLISHED";
  const hasSubmissions = test.attemptsCount > 0;
  const isCodeMatch = typedCode.trim().toUpperCase() === test.testCode.toUpperCase();

  const handleCloseExamFirst = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to close examination.");
      }
      if (onClosed) {
        onClosed(test.id);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to close examination.");
      setLoading(false);
    }
  };

  const handleArchiveInstead = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/archive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to archive examination.");
      }
      if (onArchived) {
        onArchived(test.id);
      }
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to archive examination.");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (loading) return; // double-click prevention
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/tests/${test.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationCode: hasSubmissions ? typedCode.trim().toUpperCase() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete examination.");
      }

      onClose();
      if (onDeleted) {
        onDeleted(test.id);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  };

  // Case A: LIVE Examination
  if (isLive) {
    return (
      <Dialog
        open={open}
        onClose={() => {
          if (!loading) onClose();
        }}
        title={`Cannot Delete Live Examination`}
        description={`"${test.title}" is currently LIVE and accepting student entries. Deleting mid-exam will disrupt student test sessions.`}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={loading}
              onClick={handleCloseExamFirst}
            >
              Close examination first
            </Button>
          </>
        }
      >
        <div className="space-y-3 pt-2">
          <div className="p-3.5 rounded-[10px] bg-[var(--danger-subtle,rgba(201,76,76,0.14))] border border-[var(--danger,#C94C4C)]/30 text-xs text-[var(--foreground,#F4F0E7)] space-y-1.5 leading-relaxed">
            <p className="font-semibold text-[var(--danger,#C94C4C)]">Action Required:</p>
            <p className="text-[var(--foreground-muted,#AAA69B)]">
              To delete or archive this examination, first close it to ensure no students are actively testing. You can close it immediately using the button below.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-[8px] bg-[var(--danger-subtle,rgba(201,76,76,0.14))] border border-[var(--danger,#C94C4C)]/30 text-xs text-[var(--danger,#C94C4C)]"
            >
              {errorMessage}
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  const isArchived = test.status === "ARCHIVED";

  // Case B & C: Closed, Draft, or Archived examinations
  const shouldRecommendArchive = !isArchived && hasSubmissions && !showForceDelete;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) {
          setTypedCode("");
          setShowForceDelete(false);
          onClose();
        }
      }}
      title={isArchived ? `Delete archived examination "${test.title}"?` : `Delete "${test.title}"?`}
      description={
        isArchived
          ? hasSubmissions
            ? `This archived examination has ${test.attemptsCount} recorded student submission${test.attemptsCount === 1 ? "" : "s"}. Permanently deleting it will remove all student scores, answers, and proctoring records. This cannot be undone.`
            : `This will permanently remove archived examination "${test.title}" and its ${test.questionsCount} question${test.questionsCount === 1 ? "" : "s"}. This action cannot be undone.`
          : hasSubmissions
            ? `This examination has ${test.attemptsCount} recorded student submission${test.attemptsCount === 1 ? "" : "s"}. We strongly recommend archiving to protect student academic history.`
            : `This will permanently remove "${test.title}" and its ${test.questionsCount} question${test.questionsCount === 1 ? "" : "s"}. This action cannot be undone.`
      }
      actions={
        shouldRecommendArchive ? (
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setTypedCode("");
                setShowForceDelete(false);
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={loading}
              onClick={handleArchiveInstead}
            >
              Archive examination instead
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => {
                if (showForceDelete && !isArchived) {
                  setShowForceDelete(false);
                  setTypedCode("");
                } else {
                  setTypedCode("");
                  setShowForceDelete(false);
                  onClose();
                }
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={loading || (hasSubmissions && !isCodeMatch)}
              onClick={handleDelete}
            >
              Delete permanently
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {/* Breakdown Card */}
        <div className="p-3.5 rounded-[10px] bg-[var(--surface-elevated,#22211C)] border border-[var(--border,rgba(244,240,231,0.09))] text-xs text-[var(--foreground-muted,#AAA69B)] space-y-2">
          <div className="flex items-center justify-between font-mono text-[var(--foreground,#F4F0E7)]">
            <span>Test Code: {test.testCode}</span>
            <span>Status: {test.status}</span>
          </div>
          <div className="space-y-1 text-[11px] pt-1 border-t border-[var(--border-subtle,rgba(244,240,231,0.05))]">
            <p>• {test.questionsCount} question{test.questionsCount === 1 ? "" : "s"} will be deleted</p>
            <p>• {test.attemptsCount} student submission{test.attemptsCount === 1 ? "" : "s"} and integrity logs</p>
            <p>• Code &quot;{test.testCode}&quot; will be freed for reassignment</p>
          </div>
        </div>

        {/* For Archived exams with submissions: show code confirmation directly */}
        {isArchived && hasSubmissions && (
          <div className="space-y-2 p-3.5 rounded-[10px] bg-[var(--danger-subtle,rgba(201,76,76,0.12))] border border-[var(--danger,#C94C4C)]/30 animate-fade-in">
            <label
              htmlFor="confirm-test-code"
              className="block text-xs font-semibold text-[var(--danger,#C94C4C)]"
            >
              Type examination code &quot;<span className="font-mono">{test.testCode}</span>&quot; to confirm permanent deletion:
            </label>
            <input
              id="confirm-test-code"
              type="text"
              value={typedCode}
              onChange={(e) => setTypedCode(e.target.value.toUpperCase())}
              placeholder={test.testCode}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full h-10 px-3 rounded-[8px] bg-[var(--surface,#191916)] border border-[var(--danger,#C94C4C)]/40 text-[var(--foreground,#F4F0E7)] font-mono text-sm tracking-wider focus:outline-none focus:ring-1 focus:ring-[var(--danger,#C94C4C)]"
            />
            <p className="text-[11px] text-[var(--foreground-muted,#AAA69B)]">
              Permanent deletion completely removes all student scores, answered questions, and proctoring video audits.
            </p>
          </div>
        )}

        {/* For non-archived exams with submissions: allow toggling force delete */}
        {!isArchived && hasSubmissions && (
          <div className="space-y-3">
            {!showForceDelete ? (
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setShowForceDelete(true)}
                  className="text-xs text-[var(--danger,#C94C4C)] hover:underline cursor-pointer transition-colors"
                >
                  I understand the risks, permanently delete student records →
                </button>
              </div>
            ) : (
              <div className="space-y-2 p-3.5 rounded-[10px] bg-[var(--danger-subtle,rgba(201,76,76,0.12))] border border-[var(--danger,#C94C4C)]/30 animate-fade-in">
                <label
                  htmlFor="confirm-test-code"
                  className="block text-xs font-semibold text-[var(--danger,#C94C4C)]"
                >
                  Type examination code &quot;<span className="font-mono">{test.testCode}</span>&quot; to confirm:
                </label>
                <input
                  id="confirm-test-code"
                  type="text"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value.toUpperCase())}
                  placeholder={test.testCode}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-10 px-3 rounded-[8px] bg-[var(--surface,#191916)] border border-[var(--danger,#C94C4C)]/40 text-[var(--foreground,#F4F0E7)] font-mono text-sm tracking-wider focus:outline-none focus:ring-1 focus:ring-[var(--danger,#C94C4C)]"
                />
                <p className="text-[11px] text-[var(--foreground-muted,#AAA69B)]">
                  Permanent deletion completely removes all student scores, answered questions, and proctoring video audits.
                </p>
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-[8px] bg-[var(--danger-subtle,rgba(201,76,76,0.14))] border border-[var(--danger,#C94C4C)]/30 text-xs text-[var(--danger,#C94C4C)]"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </Dialog>
  );
}
