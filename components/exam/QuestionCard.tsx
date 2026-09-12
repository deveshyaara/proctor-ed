"use client";

import { StudentQuestion } from "@/lib/exam/questions";
import { Badge } from "@/components/ui/Badge";

interface QuestionCardProps {
  question: StudentQuestion;
  currentAnswer?: string;
  onAnswerChange: (answer: string) => void;
  readOnly?: boolean;
}

export function QuestionCard({
  question,
  currentAnswer = "",
  onAnswerChange,
  readOnly = false,
}: QuestionCardProps) {
  return (
    <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[16px] p-5 sm:p-7 space-y-6 shadow-sm">
      {/* Header with tags and marks */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-[rgba(244,240,231,0.06)]">
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{question.type.replace("_", " ")}</Badge>
          <span className="text-[13px] font-mono text-[#AAA69B]">
            Question {question.order}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[13px] font-mono">
          <span className="text-[#7A9E7E] font-semibold">+{question.marks} marks</span>
          {question.negativeMarks > 0 && (
            <span className="text-[#E4572E]">-{question.negativeMarks} marks</span>
          )}
        </div>
      </div>

      {/* Question Text */}
      <div className="space-y-4">
        <h2 className="text-[17px] sm:text-[19px] font-medium text-[#F4F0E7] leading-relaxed whitespace-pre-wrap">
          {question.questionText}
        </h2>

        {question.imageUrl && (
          <div className="rounded-[10px] overflow-hidden border border-[rgba(244,240,231,0.08)] max-h-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.imageUrl}
              alt="Question illustration"
              className="w-full h-auto object-contain max-h-80"
            />
          </div>
        )}
      </div>

      {/* Answer Form per Question Type */}
      <div className="pt-2">
        {/* MCQ Type */}
        {question.type === "MCQ" && question.options && (
          <div className="space-y-2.5">
            {question.options.map((option, idx) => {
              const optionKey = String(idx);
              const isSelected = currentAnswer === optionKey;

              return (
                <label
                  key={idx}
                  className={[
                    "flex items-center gap-3.5 p-4 rounded-[12px] border transition-all cursor-pointer select-none min-h-[52px]",
                    isSelected
                      ? "bg-[#E4572E]/10 border-[#E4572E]/40 text-[#F4F0E7]"
                      : "bg-[#22211C] border-[rgba(244,240,231,0.06)] text-[#AAA69B] hover:border-[rgba(244,240,231,0.14)] hover:text-[#F4F0E7]",
                    readOnly ? "pointer-events-none opacity-80" : "",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={optionKey}
                    checked={isSelected}
                    onChange={() => onAnswerChange(optionKey)}
                    disabled={readOnly}
                    className="sr-only"
                  />
                  <span
                    className={[
                      "w-7 h-7 rounded-full flex items-center justify-center font-mono text-[13px] font-semibold shrink-0 transition-colors",
                      isSelected
                        ? "bg-[#E4572E] text-white"
                        : "bg-[#191916] text-[#AAA69B] border border-[rgba(244,240,231,0.12)]",
                    ].join(" ")}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-[15px] leading-snug flex-1">{option}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* TRUE / FALSE Type */}
        {question.type === "TRUE_FALSE" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {["true", "false"].map((val) => {
              const label = val === "true" ? "True" : "False";
              const isSelected = currentAnswer === val;

              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onAnswerChange(val)}
                  disabled={readOnly}
                  className={[
                    "flex items-center justify-center gap-3 p-4 rounded-[12px] border text-[16px] font-semibold transition-all min-h-[56px]",
                    isSelected
                      ? "bg-[#E4572E]/10 border-[#E4572E]/40 text-[#E4572E]"
                      : "bg-[#22211C] border-[rgba(244,240,231,0.06)] text-[#AAA69B] hover:border-[rgba(244,240,231,0.14)] hover:text-[#F4F0E7]",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0",
                      isSelected
                        ? "bg-[#E4572E] text-white"
                        : "bg-[#191916] text-[#AAA69B] border border-[rgba(244,240,231,0.12)]",
                    ].join(" ")}
                  >
                    {val === "true" ? "T" : "F"}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* NUMERICAL Type */}
        {question.type === "NUMERICAL" && (
          <div className="space-y-2">
            <label htmlFor={`question-${question.id}-answer`} className="block text-[13px] text-[#AAA69B]">
              Enter your numerical answer:
            </label>
            <input
              type="number"
              step="any"
              value={currentAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 42 or 3.14"
              id={`question-${question.id}-answer`}
              className="w-full max-w-sm h-12 px-4 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.12)] text-[#F4F0E7] text-[16px] font-mono focus:outline-none focus:border-[#E4572E] transition-colors"
            />
          </div>
        )}

        {/* SHORT ANSWER Type */}
        {question.type === "SHORT_ANSWER" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[13px] text-[#AAA69B]">
              <label htmlFor={`question-${question.id}-answer`}>Write your answer clearly below:</label>
              <span className="font-mono text-[11px]">
                {currentAnswer.length} / 2000
              </span>
            </div>
            <textarea
              rows={5}
              maxLength={2000}
              value={currentAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              disabled={readOnly}
              placeholder="Type your explanation or response..."
              id={`question-${question.id}-answer`}
              className="w-full p-4 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.12)] text-[#F4F0E7] text-[16px] focus:outline-none focus:border-[#E4572E] transition-colors resize-y leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
}
