"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface ArchiveTestDialogProps {
  open: boolean;
  onClose: () => void;
  test: {
    id: string;
    title: string;
    testCode: string;
    attemptsCount?: number;
  };
  onArchived?: (testId: string) => void;
}

export function ArchiveTestDialog({
  open,
  onClose,
  test,
  onArchived,
}: ArchiveTestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleArchive = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/tests/${test.id}/archive`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to archive examination.");
      }
      onClose();
      if (onArchived) {
        onArchived(test.id);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to archive examination.");
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={`Archive "${test.title}"?`}
      description="Archiving safely removes this examination from your active workspace while permanently preserving all questions, student attempts, and proctoring integrity records."
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
            onClick={handleArchive}
          >
            Archive examination
          </Button>
        </>
      }
    >
      <div className="space-y-3 pt-2">
        <div className="p-3.5 rounded-[10px] bg-[var(--surface-elevated,#22211C)] border border-[var(--border,rgba(244,240,231,0.09))] text-xs text-[var(--foreground-muted,#AAA69B)] space-y-1.5 leading-relaxed">
          <div className="flex items-center justify-between text-[var(--foreground,#F4F0E7)] font-mono">
            <span>Code: {test.testCode}</span>
            <span>{test.attemptsCount ?? 0} submission{(test.attemptsCount ?? 0) === 1 ? "" : "s"}</span>
          </div>
          <p>
            Students will no longer be able to access this examination code. You can view or restore this test anytime under the <strong>Archived</strong> tab.
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
