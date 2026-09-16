import React from "react";
import { Badge } from "@/components/ui/Badge";
import type { ProcessedStudentQuestion, StudentAnswerSheetResult } from "@/lib/exam/studentAnswers";

interface StudentAnswerBreakdownProps {
  sheet: StudentAnswerSheetResult;
}

export function StudentAnswerBreakdown({ sheet }: StudentAnswerBreakdownProps) {
  const { summary, questions } = sheet;

  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 text-left pt-4 border-t border-[rgba(244,240,231,0.08)]">
      {/* Section Header */}
      <div className="space-y-1">
        <h2 className="text-[18px] font-bold text-[#F4F0E7] tracking-tight">
          Solutions & Explanations
        </h2>
        <p className="text-[13px] text-[#AAA69B]">
          Detailed breakdown of your answers, reference solutions, and explanations.
        </p>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#22211C] border border-[rgba(244,240,231,0.06)] rounded-[14px]">
        <div>
          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
            Answered
          </span>
          <span className="text-[18px] font-bold text-[#F4F0E7] font-mono">
            {summary.answeredCount} / {summary.totalQuestions}
          </span>
        </div>
        <div>
          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
            Correct
          </span>
          <span className="text-[18px] font-bold text-[#7A9E7E] font-mono">
            {summary.correctCount}
          </span>
        </div>
        <div>
          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
            Incorrect
          </span>
          <span className="text-[18px] font-bold text-[#E4572E] font-mono">
            {summary.incorrectCount}
          </span>
        </div>
        <div>
          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
            Unanswered
          </span>
          <span className="text-[18px] font-bold text-[#AAA69B] font-mono">
            {summary.unansweredCount}
          </span>
        </div>
      </div>

      {/* Question by Question List */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="p-4 sm:p-5 bg-[#22211C] border border-[rgba(244,240,231,0.08)] rounded-[14px] space-y-3.5"
          >
            {/* Question Header & Grading Status Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[rgba(244,240,231,0.06)]">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#191916] border border-[rgba(244,240,231,0.08)] flex items-center justify-center text-[11px] font-mono font-bold text-[#F4F0E7]">
                  {idx + 1}
                </span>
                <Badge variant="neutral">{q.type}</Badge>
                <span className="text-[12px] text-[#7A9E7E] font-medium font-mono">
                  +{q.marks} m
                </span>
                {q.negativeMarks > 0 && (
                  <span className="text-[12px] text-[#E4572E] font-medium font-mono">
                    -{q.negativeMarks} m
                  </span>
                )}
              </div>

              <div>
                {!q.isAnswered ? (
                  <Badge variant="neutral">Not Answered (0 m)</Badge>
                ) : q.isCorrect === true ? (
                  <Badge variant="success">✓ Correct (+{q.marksAwarded} m)</Badge>
                ) : (
                  <Badge variant="warning">✗ Incorrect ({q.marksAwarded} m)</Badge>
                )}
              </div>
            </div>

            {/* Question Stem */}
            <p className="text-[14px] text-[#F4F0E7] font-medium leading-relaxed">
              {q.questionText}
            </p>

            {/* MCQ Options Rendering */}
            {q.type === "MCQ" && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options?.map((opt) => {
                    const isCorrect = opt.isCorrect;
                    const isSelected = opt.isSelected;

                    let borderBg =
                      "bg-[#191916] border-[rgba(244,240,231,0.06)] text-[#AAA69B]";
                    let tag = null;

                    if (isCorrect && isSelected) {
                      borderBg =
                        "bg-[#7A9E7E]/15 border-[#7A9E7E]/50 text-[#7A9E7E] font-medium";
                      tag = (
                        <span className="ml-auto text-[10px] font-semibold bg-[#7A9E7E]/20 text-[#7A9E7E] px-2 py-0.5 rounded">
                          ✓ Correct · Selected
                        </span>
                      );
                    } else if (isCorrect && !isSelected) {
                      borderBg =
                        "bg-[#7A9E7E]/10 border-[#7A9E7E]/30 text-[#7A9E7E]";
                      tag = (
                        <span className="ml-auto text-[10px] font-medium text-[#7A9E7E]">
                          ✓ Correct Answer
                        </span>
                      );
                    } else if (!isCorrect && isSelected) {
                      borderBg =
                        "bg-[#E4572E]/15 border-[#E4572E]/50 text-[#E4572E] font-medium";
                      tag = (
                        <span className="ml-auto text-[10px] font-semibold bg-[#E4572E]/20 text-[#E4572E] px-2 py-0.5 rounded">
                          ✗ Your Pick · Incorrect
                        </span>
                      );
                    }

                    return (
                      <div
                        key={opt.index}
                        className={`text-[12px] px-3 py-2.5 rounded-[8px] border flex items-center gap-2 ${borderBg}`}
                      >
                        <span className="font-mono font-bold">{opt.letter}.</span>
                        <span className="flex-1 leading-snug">{opt.text}</span>
                        {tag}
                      </div>
                    );
                  })}
                </div>
                {!q.isAnswered && (
                  <p className="text-[12px] text-[#AAA69B] italic pt-1">
                    You did not submit an answer for this question.
                  </p>
                )}
              </div>
            )}

            {/* Non-MCQ Types (Short Answer, True/False, Numerical) */}
            {q.type !== "MCQ" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[12px]">
                <div className="p-3 rounded-[8px] bg-[#191916] border border-[rgba(244,240,231,0.06)] space-y-1">
                  <span className="text-[11px] uppercase font-mono tracking-wider text-[#AAA69B] block">
                    Your Answer
                  </span>
                  {q.isAnswered ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-medium text-[13px] ${
                          q.isCorrect ? "text-[#7A9E7E]" : "text-[#E4572E]"
                        }`}
                      >
                        {q.submittedAnswer}
                      </span>
                      <span className="text-[11px] text-[#AAA69B]">
                        {q.isCorrect ? "(Correct)" : "(Incorrect)"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[#AAA69B] italic">Not Answered</span>
                  )}
                </div>

                <div className="p-3 rounded-[8px] bg-[#7A9E7E]/10 border border-[#7A9E7E]/30 space-y-1">
                  <span className="text-[11px] uppercase font-mono tracking-wider text-[#7A9E7E] block">
                    Correct / Reference Answer
                  </span>
                  <span className="font-mono font-medium text-[13px] text-[#7A9E7E]">
                    {q.correctAnswer}
                  </span>
                </div>
              </div>
            )}

            {/* Explanation Card */}
            {q.explanation && q.explanation.trim() !== "" && (
              <div className="p-3.5 rounded-[8px] bg-[#191916] border border-[rgba(244,240,231,0.08)] text-[12px] space-y-1.5">
                <span className="text-[11px] font-semibold text-[#AAA69B] uppercase font-mono tracking-wider block">
                  Explanation
                </span>
                <p className="text-[#C9C3B5] leading-relaxed">
                  {q.explanation}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
