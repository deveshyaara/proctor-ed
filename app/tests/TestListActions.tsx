"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { DeleteTestDialog } from "@/components/teacher/DeleteTestDialog";
import { ArchiveTestDialog } from "@/components/teacher/ArchiveTestDialog";
import { useToast } from "@/components/ui/Toast";

export interface ActionTestItem {
  id: string;
  status: string;
  testCode: string;
  title: string;
  attemptsCount?: number;
  questionsCount?: number;
  _count?: { attempts: number; questions: number };
}

interface TestListActionsProps {
  test: ActionTestItem;
  compact?: boolean;
  onDeleted?: (testId: string) => void;
  onArchived?: (testId: string) => void;
  onRestored?: (testId: string) => void;
  onClosed?: (testId: string) => void;
}

export function TestListActions({
  test,
  compact,
  onDeleted,
  onArchived,
  onRestored,
  onClosed,
}: TestListActionsProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [closeDialog, setCloseDialog] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const attemptsCount = test.attemptsCount ?? test._count?.attempts ?? 0;
  const questionsCount = test.questionsCount ?? test._count?.questions ?? 0;

  const handleClose = async () => {
    setLoadingAction("close");
    try {
      const res = await fetch(`/api/tests/${test.id}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to close examination.");
      setCloseDialog(false);
      toast(`Examination "${test.title}" has been closed.`, "info");
      if (onClosed) onClosed(test.id);
      router.refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to close examination.", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestore = async () => {
    setLoadingAction("restore");
    try {
      const res = await fetch(`/api/tests/${test.id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to restore examination.");
      toast(`Examination "${test.title}" restored successfully.`, "success");
      if (onRestored) onRestored(test.id);
      router.refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to restore examination.", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <>
      <div className={compact ? "flex flex-wrap gap-2 w-full" : "flex items-center gap-2"}>
        {/* Open examination */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => router.push(`/tests/${test.id}`)}
          className="h-8 px-2.5 text-xs font-medium"
        >
          Open
        </Button>

        {/* View results */}
        {(test.status === "PUBLISHED" || test.status === "CLOSED" || test.status === "ARCHIVED") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/tests/${test.id}/results`)}
            className="h-8 px-2.5 text-xs text-[var(--foreground-muted,#AAA69B)]"
          >
            Results
          </Button>
        )}

        {/* Close active exam */}
        {test.status === "PUBLISHED" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCloseDialog(true)}
            className="h-8 px-2.5 text-xs text-[var(--warning,#D6A84F)]"
          >
            Close
          </Button>
        )}

        {/* Archive closed/draft exam */}
        {(test.status === "CLOSED" || test.status === "DRAFT") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setArchiveDialogOpen(true)}
            className="h-8 px-2.5 text-xs text-[var(--foreground-muted,#AAA69B)]"
          >
            Archive
          </Button>
        )}

        {/* Restore archived exam */}
        {test.status === "ARCHIVED" && (
          <Button
            size="sm"
            variant="ghost"
            loading={loadingAction === "restore"}
            disabled={loadingAction !== null}
            onClick={handleRestore}
            className="h-8 px-2.5 text-xs text-[var(--success,#7A9E7E)] hover:bg-[var(--success-subtle,rgba(122,158,126,0.14))]"
          >
            Restore
          </Button>
        )}

        {/* Delete examination (Destructive styled button) */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDeleteDialogOpen(true)}
          className="h-8 px-2.5 text-xs text-[var(--danger,#C94C4C)] hover:text-[var(--foreground,#F4F0E7)] hover:bg-[var(--danger,#C94C4C)]/15 border border-[var(--danger,#C94C4C)]/30 font-medium"
          leftIcon={
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          }
          aria-label={`Delete examination ${test.title}`}
        >
          Delete
        </Button>
      </div>

      {/* Close Confirmation Dialog */}
      <Dialog
        open={closeDialog}
        onClose={() => setCloseDialog(false)}
        title={`Close "${test.title}"?`}
        description="No new students will be able to start this examination. Students currently in progress can still submit. Existing results remain accessible."
        actions={
          <>
            <Button
              variant="ghost"
              disabled={loadingAction === "close"}
              onClick={() => setCloseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={loadingAction === "close"}
              disabled={loadingAction === "close"}
              onClick={handleClose}
            >
              Close examination
            </Button>
          </>
        }
      />

      {/* Archive Dialog */}
      <ArchiveTestDialog
        open={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        test={{
          id: test.id,
          title: test.title,
          testCode: test.testCode,
          attemptsCount,
        }}
        onArchived={(testId) => {
          toast(`Examination "${test.title}" was archived.`, "info");
          if (onArchived) onArchived(testId);
          router.refresh();
        }}
      />

      {/* Delete Dialog with Submissions & Live Guards */}
      <DeleteTestDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        test={{
          id: test.id,
          title: test.title,
          testCode: test.testCode,
          status: test.status,
          attemptsCount,
          questionsCount,
        }}
        onDeleted={(testId) => {
          toast(`Examination "${test.title}" was permanently deleted.`, "success");
          if (onDeleted) onDeleted(testId);
          router.refresh();
        }}
        onArchived={(testId) => {
          toast(`Examination "${test.title}" was archived.`, "info");
          if (onArchived) onArchived(testId);
          router.refresh();
        }}
        onClosed={(testId) => {
          toast(`Examination "${test.title}" was closed.`, "info");
          if (onClosed) onClosed(testId);
          router.refresh();
        }}
      />
    </>
  );
}

