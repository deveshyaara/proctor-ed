"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

export interface QuestionDraft {
  id?: string;
  type: "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER";
  questionText: string;
  options: string[];
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
  explanation: string;
}

interface QuestionEditorProps {
  initial?: Partial<QuestionDraft>;
  onSave: (q: QuestionDraft) => Promise<void>;
  onCancel: () => void;
}

const BLANK: QuestionDraft = {
  type: "MCQ",
  questionText: "",
  options: ["", ""],
  correctAnswer: "0",
  marks: 1,
  negativeMarks: 0,
  explanation: "",
};

export function QuestionEditor({ initial, onSave, onCancel }: QuestionEditorProps) {
  const [draft, setDraft] = useState<QuestionDraft>({ ...BLANK, ...initial });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof QuestionDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setOption = (idx: number, value: string) =>
    setDraft((d) => { const o = [...d.options]; o[idx] = value; return { ...d, options: o }; });

  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, ""] }));
  const removeOption = (idx: number) =>
    setDraft((d) => {
      const o = d.options.filter((_, i) => i !== idx);
      const ca = parseInt(d.correctAnswer);
      return { ...d, options: o, correctAnswer: ca >= o.length ? "0" : d.correctAnswer };
    });

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!draft.questionText.trim()) e.questionText = "Question text is required.";
    if (draft.type === "MCQ") {
      if (draft.options.length < 2) e.options = "At least 2 options are required.";
      if (draft.options.some((o) => !o.trim())) e.options = "All options must have text.";
    }
    if (!draft.correctAnswer) e.correctAnswer = "Correct answer is required.";
    if (draft.marks <= 0) e.marks = "Marks must be greater than 0.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 p-5 sm:p-6 bg-[#191916] border border-[rgba(244,240,231,0.1)] rounded-[14px]">
      {/* Type selector */}
      <Select
        label="Question Type"
        value={draft.type}
        onChange={(e) => { set("type", e.target.value); set("correctAnswer", e.target.value === "TRUE_FALSE" ? "true" : "0"); }}
      >
        <option value="MCQ">Multiple Choice (MCQ)</option>
        <option value="TRUE_FALSE">True / False</option>
        <option value="NUMERICAL">Numerical</option>
        <option value="SHORT_ANSWER">Short Answer</option>
      </Select>

      {/* Question text */}
      <Textarea
        label="Question Text"
        value={draft.questionText}
        onChange={(e) => set("questionText", e.target.value)}
        error={errors.questionText}
        placeholder="Enter the question..."
        rows={3}
        showCount
        maxLength={5000}
      />

      {/* MCQ Options */}
      {draft.type === "MCQ" && (
        <div className="space-y-3">
          <div className="text-[13px] font-medium text-[#AAA69B]">Options</div>
          {draft.options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="radio"
                name="correct"
                value={String(idx)}
                checked={draft.correctAnswer === String(idx)}
                onChange={() => set("correctAnswer", String(idx))}
                className="w-4 h-4 accent-[#E4572E] shrink-0 cursor-pointer"
                aria-label={`Option ${idx + 1} is correct`}
              />
              <div className="flex-1">
                <Input
                  value={opt}
                  onChange={(e) => setOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                />
              </div>
              {draft.options.length > 2 && (
                <button onClick={() => removeOption(idx)} className="text-[#737067] hover:text-[#C94C4C] p-1 rounded transition-colors" aria-label="Remove option">✕</button>
              )}
            </div>
          ))}
          {errors.options && <p className="text-[12px] text-[#C94C4C]">{errors.options}</p>}
          {draft.options.length < 6 && (
            <button onClick={addOption} className="text-[13px] text-[#E4572E] hover:text-[#F06A43] font-medium transition-colors">
              + Add option
            </button>
          )}
          <p className="text-[12px] text-[#737067]">Select the radio button next to the correct answer.</p>
        </div>
      )}

      {/* True/False correct answer */}
      {draft.type === "TRUE_FALSE" && (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-[#AAA69B]">Correct Answer</div>
          <div className="flex gap-3">
            {["true", "false"].map((val) => (
              <label key={val} className={["flex items-center gap-2.5 px-4 py-3 rounded-[10px] border cursor-pointer flex-1 transition-colors",
                draft.correctAnswer === val ? "bg-[#E4572E]/10 border-[#E4572E]/40 text-[#F4F0E7]" : "border-[rgba(244,240,231,0.09)] text-[#AAA69B] hover:border-[rgba(244,240,231,0.18)]",
              ].join(" ")}>
                <input type="radio" value={val} checked={draft.correctAnswer === val} onChange={() => set("correctAnswer", val)} className="sr-only" />
                <span className="text-[15px] font-medium capitalize">{val}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Numerical answer */}
      {draft.type === "NUMERICAL" && (
        <Input label="Correct Answer (number)" type="number" value={draft.correctAnswer}
          onChange={(e) => set("correctAnswer", e.target.value)}
          error={errors.correctAnswer} placeholder="e.g. 42 or 3.14" />
      )}

      {/* Short answer */}
      {draft.type === "SHORT_ANSWER" && (
        <Input label="Correct Answer (exact match)" value={draft.correctAnswer}
          onChange={(e) => set("correctAnswer", e.target.value)}
          error={errors.correctAnswer} placeholder="Expected answer text" />
      )}

      {/* Marks */}
      <div className="grid grid-cols-2 gap-4">
        <Input label="Marks" type="number" min={0.5} step={0.5} value={draft.marks}
          onChange={(e) => set("marks", parseFloat(e.target.value) || 1)}
          error={errors.marks} />
        <Input label="Negative Marks" type="number" min={0} step={0.25} value={draft.negativeMarks}
          onChange={(e) => set("negativeMarks", parseFloat(e.target.value) || 0)} />
      </div>

      {/* Explanation (optional) */}
      <Textarea label="Explanation (optional)" value={draft.explanation}
        onChange={(e) => set("explanation", e.target.value)}
        placeholder="Shown to students after submission if enabled..." rows={2}
        showCount maxLength={2000} />

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-[rgba(244,240,231,0.06)]">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={saving} className="sm:ml-auto">
          Save question
        </Button>
      </div>
    </div>
  );
}
