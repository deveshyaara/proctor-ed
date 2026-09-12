"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { QuestionDraft } from "./QuestionEditor";

interface QuestionListProps {
  questions: (QuestionDraft & { id: string })[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onMoveUp: (id: string) => Promise<void>;
  onMoveDown: (id: string) => Promise<void>;
  editingId?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  MCQ: "MCQ",
  TRUE_FALSE: "T/F",
  NUMERICAL: "NUM",
  SHORT_ANSWER: "SA",
};

export function QuestionList({ questions, onEdit, onDelete, onMoveUp, onMoveDown, editingId }: QuestionListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-[rgba(244,240,231,0.09)] rounded-[14px]">
        <div className="text-[15px] font-medium text-[#F4F0E7] mb-1">No questions added yet.</div>
        <p className="text-[13px] text-[#AAA69B]">Use the button below to add your first question.</p>
      </div>
    );
  }

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await onDelete(deleteId); } finally { setDeleting(false); setDeleteId(null); }
  };

  return (
    <>
      <div className="space-y-2" role="list">
        {questions.map((q, idx) => {
          const isEditing = editingId === q.id;
          const preview = q.questionText.slice(0, 80) + (q.questionText.length > 80 ? "…" : "");

          return (
            <div
              key={q.id}
              role="listitem"
              className={["flex items-center gap-3 p-3 sm:p-4 rounded-[12px] border transition-colors",
                isEditing ? "bg-[#22211C] border-[#E4572E]/30" : "bg-[#191916] border-[rgba(244,240,231,0.08)] hover:border-[rgba(244,240,231,0.14)]",
              ].join(" ")}
            >
              {/* Question number */}
              <span className="w-7 h-7 rounded-full bg-[#22211C] border border-[rgba(244,240,231,0.08)] flex items-center justify-center text-[12px] font-mono text-[#AAA69B] shrink-0">
                {idx + 1}
              </span>

              {/* Type badge */}
              <span className="hidden sm:flex items-center">
                <Badge variant="default">{TYPE_LABELS[q.type] ?? q.type}</Badge>
              </span>

              {/* Preview */}
              <span className="flex-1 text-[14px] text-[#F4F0E7] truncate min-w-0">{preview}</span>

              {/* Marks */}
              <span className="hidden sm:block text-[12px] font-mono text-[#AAA69B] shrink-0">{q.marks}m</span>

              {/* Reorder + actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onMoveUp(q.id)}
                  disabled={idx === 0}
                  aria-label="Move question up"
                  className="p-1.5 rounded-[6px] text-[#737067] hover:text-[#F4F0E7] hover:bg-[#22211C] disabled:opacity-20 disabled:cursor-not-allowed transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >↑</button>
                <button
                  onClick={() => onMoveDown(q.id)}
                  disabled={idx === questions.length - 1}
                  aria-label="Move question down"
                  className="p-1.5 rounded-[6px] text-[#737067] hover:text-[#F4F0E7] hover:bg-[#22211C] disabled:opacity-20 disabled:cursor-not-allowed transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >↓</button>
                <button
                  onClick={() => onEdit(q.id)}
                  aria-label="Edit question"
                  className="p-1.5 rounded-[6px] text-[#AAA69B] hover:text-[#F4F0E7] hover:bg-[#22211C] transition-colors text-[13px] min-w-[36px] min-h-[36px] flex items-center justify-center"
                >✎</button>
                <button
                  onClick={() => setDeleteId(q.id)}
                  aria-label="Delete question"
                  className="p-1.5 rounded-[6px] text-[#737067] hover:text-[#C94C4C] hover:bg-[#22211C] transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total marks */}
      {questions.length > 0 && (
        <div className="text-right text-[13px] text-[#AAA69B]">
          Total: <span className="font-mono text-[#F4F0E7]">{questions.reduce((s, q) => s + q.marks, 0)} marks</span>
          {" · "}{questions.length} question{questions.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete question?"
        description="This question and any existing student answers for it will be permanently removed."
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteConfirm} loading={deleting}>Delete question</Button>
          </>
        }
      />
    </>
  );
}
