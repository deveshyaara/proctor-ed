"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

export interface AttemptItem {
  id: string;
  studentName: string;
  rollNumber: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  riskScore: number;
  warningCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  eventCount: number;
}

export interface QuestionAnswerDetail {
  id: string;
  order: number;
  type: "MCQ" | "TRUE_FALSE" | "NUMERICAL" | "SHORT_ANSWER";
  questionText: string;
  imageUrl?: string | null;
  marks: number;
  negativeMarks: number;
  explanation: string | null;
  isAnswered: boolean;
  submittedAnswer: string | null;
  submittedOptionIndex: number | null;
  submittedOptionLetter: string | null;
  correctAnswer: string;
  correctOptionIndex: number | null;
  correctOptionLetter: string | null;
  options: {
    index: number;
    letter: string;
    text: string;
    isCorrect: boolean;
    isSelected: boolean;
  }[] | null;
  isCorrect: boolean | null;
  marksAwarded: number;
  answeredAt: string | null;
}

export interface AttemptAnswersResponse {
  test: {
    id: string;
    title: string;
    subject: string;
    className: string;
  };
  attempt: {
    id: string;
    studentName: string;
    rollNumber: string;
    status: string;
    score: number | null;
    maxScore: number | null;
    startedAt: string | null;
    submittedAt: string | null;
  };
  summary: {
    totalQuestions: number;
    answeredCount: number;
    unansweredCount: number;
    correctCount: number;
    incorrectCount: number;
    score: number;
    maxScore: number;
  };
  questions: QuestionAnswerDetail[];
}

export interface ProctoringEventDetail {
  id: string;
  eventType: string;
  severity: string;
  description: string | null;
  confidence?: number;
  metadata?: { model?: string; confidence?: number; durationMs?: number } & Record<string, unknown>;
  timestamp: string;
}

interface ResultsClientProps {
  test: {
    id: string;
    title: string;
    subject: string;
    className: string;
  };
  attempts: AttemptItem[];
  summary: {
    total: number;
    submitted: number;
    averageScore: number | null;
    highestScore: number | null;
    lowestScore: number | null;
    flaggedCount: number;
  };
}

export function ResultsClient({ test, attempts, summary }: ResultsClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptItem | null>(null);
  const [eventsCache, setEventsCache] = useState<Record<string, ProctoringEventDetail[]>>({});
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Student Answers Modal State
  const [selectedAnswersAttempt, setSelectedAnswersAttempt] = useState<AttemptItem | null>(null);
  const [answersCache, setAnswersCache] = useState<Record<string, AttemptAnswersResponse>>({});
  const [isLoadingAnswers, setIsLoadingAnswers] = useState(false);
  const [answersError, setAnswersError] = useState<string | null>(null);

  const handleOpenAnswers = async (a: AttemptItem) => {
    setSelectedAnswersAttempt(a);
    setAnswersError(null);

    if (answersCache[a.id]) {
      return;
    }

    setIsLoadingAnswers(true);
    try {
      const res = await fetch(`/api/tests/${test.id}/attempts/${a.id}/answers`);
      if (!res.ok) {
        throw new Error("Failed to load student answers.");
      }
      const data = await res.json();
      setAnswersCache((prev) => ({ ...prev, [a.id]: data }));
    } catch (err: unknown) {
      setAnswersError(err instanceof Error ? err.message : "Failed to load answers.");
    } finally {
      setIsLoadingAnswers(false);
    }
  };

  const handleOpenReview = async (a: AttemptItem) => {
    setSelectedAttempt(a);
    setEventsError(null);

    if (eventsCache[a.id]) {
      return;
    }

    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/tests/${test.id}/attempts/${a.id}/events`);
      if (!res.ok) {
        throw new Error("Failed to load proctoring events.");
      }
      const data = await res.json();
      setEventsCache((prev) => ({ ...prev, [a.id]: data.events || [] }));
    } catch (err: unknown) {
      setEventsError(err instanceof Error ? err.message : "Failed to load events.");
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const filteredAttempts = attempts.filter((a) => {
    const q = searchTerm.toLowerCase();
    return (
      a.studentName.toLowerCase().includes(q) ||
      a.rollNumber.toLowerCase().includes(q)
    );
  });

  const getRiskBadge = (score: number, warnings: number) => {
    if (warnings >= 3 || score >= 50) {
      return <Badge variant="warning">High Risk ({warnings} warnings)</Badge>;
    }
    if (warnings > 0 || score > 0) {
      return <Badge variant="neutral">Med Risk ({warnings} warnings)</Badge>;
    }
    return <Badge variant="success">Clean</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return <Badge variant="success">Submitted</Badge>;
      case "AUTO_SUBMITTED":
        return <Badge variant="warning">Auto-Submitted</Badge>;
      case "IN_PROGRESS":
        return <Badge variant="neutral">In Progress</Badge>;
      case "EXPIRED":
        return <Badge variant="neutral">Expired</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
          <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
            Submissions
          </span>
          <span className="text-[24px] font-bold text-[#F4F0E7]">
            {summary.submitted} / {summary.total}
          </span>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
          <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
            Average Score
          </span>
          <span className="text-[24px] font-bold text-[#F4F0E7]">
            {summary.averageScore !== null ? `${summary.averageScore.toFixed(1)}` : "—"}
          </span>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
          <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
            Highest Score
          </span>
          <span className="text-[24px] font-bold text-[#7A9E7E]">
            {summary.highestScore !== null ? `${summary.highestScore}` : "—"}
          </span>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
          <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
            Lowest Score
          </span>
          <span className="text-[24px] font-bold text-[#E4572E]">
            {summary.lowestScore !== null ? `${summary.lowestScore}` : "—"}
          </span>
        </div>

        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4 col-span-2 sm:col-span-1">
          <span className="text-[12px] text-[#AAA69B] uppercase font-mono tracking-wider block mb-1">
            Proctoring Flags
          </span>
          <span className="text-[24px] font-bold text-[#E4572E]">
            {summary.flaggedCount}
          </span>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-[14px] bg-[#191916] border border-[rgba(244,240,231,0.08)]">
        <div className="w-full sm:w-72">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search student or roll number..."
            className="w-full"
          />
        </div>
        <div className="text-[13px] text-[#AAA69B] self-start sm:self-center">
          Showing {filteredAttempts.length} of {attempts.length} attempts
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] overflow-hidden">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[rgba(244,240,231,0.08)] text-[#AAA69B] bg-[#22211C]/40">
              <th className="p-4 font-medium">Student Name</th>
              <th className="p-4 font-medium">Roll No.</th>
              <th className="p-4 font-medium">Score</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Integrity Risk</th>
              <th className="p-4 font-medium">Violations</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(244,240,231,0.06)] text-[#F4F0E7]">
            {filteredAttempts.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#AAA69B]">
                  No student submissions found.
                </td>
              </tr>
            ) : (
              filteredAttempts.map((a) => {
                const percentage =
                  a.score !== null && a.maxScore
                    ? Math.round((a.score / a.maxScore) * 100)
                    : null;

                return (
                  <tr key={a.id} className="hover:bg-[#22211C]/40 transition-colors">
                    <td className="p-4 font-medium">{a.studentName}</td>
                    <td className="p-4 font-mono text-[#AAA69B]">{a.rollNumber}</td>
                    <td className="p-4">
                      {a.score !== null ? (
                        <div>
                          <span className="font-semibold text-[#F4F0E7]">
                            {a.score}
                          </span>
                          <span className="text-[#AAA69B]"> / {a.maxScore}</span>
                          {percentage !== null && (
                            <span className="text-[11px] text-[#AAA69B] ml-1.5">
                              ({percentage}%)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#AAA69B]">—</span>
                      )}
                    </td>
                    <td className="p-4">{getStatusBadge(a.status)}</td>
                    <td className="p-4">{getRiskBadge(a.riskScore, a.warningCount)}</td>
                    <td className="p-4 font-mono text-[12px]">
                      {a.eventCount > 0 ? (
                        <span className="text-[#E4572E] font-medium">
                          {a.eventCount} events
                        </span>
                      ) : (
                        <span className="text-[#7A9E7E]">0</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenAnswers(a)}
                          className="text-[12px] py-1 px-2.5 h-auto border-[rgba(244,240,231,0.15)] text-[#F4F0E7] hover:bg-[#22211C]"
                        >
                          View Answers
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleOpenReview(a)}
                          className="text-[12px] py-1 px-2.5 h-auto"
                        >
                          Review Log
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredAttempts.length === 0 ? (
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 text-center text-[#AAA69B]">
            No student submissions found.
          </div>
        ) : (
          filteredAttempts.map((a) => {
            const percentage =
              a.score !== null && a.maxScore
                ? Math.round((a.score / a.maxScore) * 100)
                : null;

            return (
              <div
                key={a.id}
                className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#F4F0E7]">
                      {a.studentName}
                    </h3>
                    <span className="text-[12px] font-mono text-[#AAA69B]">
                      Roll: {a.rollNumber}
                    </span>
                  </div>
                  {getStatusBadge(a.status)}
                </div>

                <div className="flex items-center justify-between text-[13px] pt-1">
                  <div>
                    <span className="text-[#AAA69B] block text-[11px]">Score</span>
                    <span className="font-semibold text-[#F4F0E7]">
                      {a.score !== null ? `${a.score} / ${a.maxScore} (${percentage}%)` : "—"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#AAA69B] block text-[11px]">Violations</span>
                    <span className="font-semibold text-[#E4572E]">
                      {a.eventCount} events
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[rgba(244,240,231,0.06)] flex items-center justify-between gap-3">
                  {getRiskBadge(a.riskScore, a.warningCount)}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenAnswers(a)}
                      className="text-[12px] py-1 px-2.5 h-auto border-[rgba(244,240,231,0.15)] text-[#F4F0E7]"
                    >
                      Answers
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenReview(a)}
                      className="text-[12px] py-1 px-2.5 h-auto"
                    >
                      Proctor Log →
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Proctoring Log Review Modal */}
      {selectedAttempt && (
        <Dialog
          isOpen={true}
          title={`Proctoring Log — ${selectedAttempt.studentName}`}
          onClose={() => setSelectedAttempt(null)}
        >
          <div className="space-y-4 py-2">
            <div className="p-3 bg-[#22211C] border border-[rgba(244,240,231,0.08)] rounded-[10px] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
              <div>
                <span className="text-[#AAA69B] block">Roll Number</span>
                <span className="text-[#F4F0E7] font-mono">{selectedAttempt.rollNumber}</span>
              </div>
              <div>
                <span className="text-[#AAA69B] block">Score</span>
                <span className="text-[#F4F0E7] font-semibold">
                  {selectedAttempt.score ?? "—"} / {selectedAttempt.maxScore ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-[#AAA69B] block">Status</span>
                <span className="text-[#F4F0E7]">{selectedAttempt.status}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[13px] font-semibold text-[#F4F0E7] block">
                Recorded Events ({selectedAttempt.eventCount})
              </span>

              {isLoadingEvents ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-[#E4572E] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[13px] text-[#AAA69B]">Loading proctoring events...</p>
                </div>
              ) : eventsError ? (
                <div className="p-4 rounded-[10px] bg-[#E4572E]/10 border border-[#E4572E]/20 text-[#E4572E] text-[13px] text-center space-y-2">
                  <p>{eventsError}</p>
                  <Button variant="secondary" onClick={() => handleOpenReview(selectedAttempt)} className="text-[12px] py-1">
                    Retry
                  </Button>
                </div>
              ) : (eventsCache[selectedAttempt.id] || []).length === 0 ? (
                <div className="p-4 text-center rounded-[10px] bg-[#7A9E7E]/10 border border-[#7A9E7E]/20 text-[#7A9E7E] text-[13px]">
                  ✓ No integrity violations recorded during this exam session.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {(eventsCache[selectedAttempt.id] || []).map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 bg-[#22211C] border border-[rgba(244,240,231,0.08)] rounded-[8px] flex items-center justify-between text-[12px]"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#E4572E] block">
                            {evt.eventType}
                          </span>
                          {evt.metadata?.model && (
                            <span className="text-[10px] bg-[#2a2924] text-[#AAA69B] px-1.5 py-0.5 rounded border border-[rgba(244,240,231,0.06)]">
                              AI Vision
                              {evt.metadata.confidence !== undefined && 
                                ` · ${Math.round(evt.metadata.confidence * 100)}% confidence`}
                            </span>
                          )}
                        </div>
                        {evt.description && (
                          <span className="text-[#AAA69B] text-[11px] block mt-0.5">
                            {evt.description}
                            {evt.metadata?.durationMs ? ` (${Math.round(evt.metadata.durationMs / 1000)}s)` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <Badge
                          variant={
                            evt.severity === "HIGH"
                              ? "warning"
                              : evt.severity === "MEDIUM"
                              ? "neutral"
                              : "neutral"
                          }
                        >
                          {evt.severity}
                        </Badge>
                        <span className="text-[#AAA69B] text-[10px] block mt-0.5 font-mono">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setSelectedAttempt(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Student Answer Sheet Modal */}
      {selectedAnswersAttempt && (
        <Dialog
          isOpen={true}
          maxWidth="max-w-3xl"
          title={`Student Answer Sheet — ${selectedAnswersAttempt.studentName}`}
          description={`Roll No: ${selectedAnswersAttempt.rollNumber} · ${test.title}`}
          onClose={() => setSelectedAnswersAttempt(null)}
        >
          <div className="space-y-4 py-2">
            {isLoadingAnswers ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-[#E4572E] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-[13px] text-[#AAA69B]">Loading student answer sheet...</p>
              </div>
            ) : answersError ? (
              <div className="p-4 rounded-[10px] bg-[#E4572E]/10 border border-[#E4572E]/20 text-[#E4572E] text-[13px] text-center space-y-2">
                <p>{answersError}</p>
                <Button variant="secondary" onClick={() => handleOpenAnswers(selectedAnswersAttempt)} className="text-[12px] py-1">
                  Retry
                </Button>
              </div>
            ) : answersCache[selectedAnswersAttempt.id] ? (
              (() => {
                const sheet = answersCache[selectedAnswersAttempt.id];
                return (
                  <>
                    {/* Performance Summary Banner */}
                    <div className="p-4 bg-[#22211C] border border-[rgba(244,240,231,0.08)] rounded-[12px] space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                        <div>
                          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
                            Total Score
                          </span>
                          <span className="text-[18px] font-bold text-[#7A9E7E] font-mono">
                            {sheet.summary.score} <span className="text-[13px] text-[#AAA69B]">/ {sheet.summary.maxScore}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
                            Questions
                          </span>
                          <span className="text-[18px] font-bold text-[#F4F0E7] font-mono">
                            {sheet.summary.totalQuestions}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
                            Correct / Incorrect
                          </span>
                          <span className="text-[16px] font-semibold text-[#F4F0E7] font-mono">
                            <span className="text-[#7A9E7E]">{sheet.summary.correctCount}</span>
                            <span className="text-[#AAA69B]"> / </span>
                            <span className="text-[#E4572E]">{sheet.summary.incorrectCount}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[#AAA69B] block text-[11px] uppercase font-mono tracking-wider">
                            Unanswered
                          </span>
                          <span className="text-[16px] font-semibold text-[#AAA69B] font-mono">
                            {sheet.summary.unansweredCount}
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-[#AAA69B] pt-2 border-t border-[rgba(244,240,231,0.06)] flex items-center justify-between">
                        <span>Status: <strong className="text-[#F4F0E7]">{sheet.attempt.status}</strong></span>
                        <span>Total marks tally matches roster score ({sheet.summary.score} / {sheet.summary.maxScore})</span>
                      </div>
                    </div>

                    {/* Question by Question Response List */}
                    <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
                      {sheet.questions.map((q, idx) => {
                        return (
                          <div
                            key={q.id}
                            className="p-4 bg-[#22211C] border border-[rgba(244,240,231,0.08)] rounded-[12px] space-y-3"
                          >
                            {/* Question Header & Grading Status Badge */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[rgba(244,240,231,0.06)]">
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

                                    let borderBg = "bg-[#191916] border-[rgba(244,240,231,0.06)] text-[#AAA69B]";
                                    let tag = null;

                                    if (isCorrect && isSelected) {
                                      borderBg = "bg-[#7A9E7E]/15 border-[#7A9E7E]/50 text-[#7A9E7E] font-medium";
                                      tag = (
                                        <span className="ml-auto text-[10px] font-semibold bg-[#7A9E7E]/20 text-[#7A9E7E] px-2 py-0.5 rounded">
                                          ✓ Correct · Selected
                                        </span>
                                      );
                                    } else if (isCorrect && !isSelected) {
                                      borderBg = "bg-[#7A9E7E]/10 border-[#7A9E7E]/30 text-[#7A9E7E]";
                                      tag = (
                                        <span className="ml-auto text-[10px] font-medium text-[#7A9E7E]">
                                          ✓ Correct Answer
                                        </span>
                                      );
                                    } else if (!isCorrect && isSelected) {
                                      borderBg = "bg-[#E4572E]/15 border-[#E4572E]/50 text-[#E4572E] font-medium";
                                      tag = (
                                        <span className="ml-auto text-[10px] font-semibold bg-[#E4572E]/20 text-[#E4572E] px-2 py-0.5 rounded">
                                          ✗ Student Pick · Incorrect
                                        </span>
                                      );
                                    }

                                    return (
                                      <div
                                        key={opt.index}
                                        className={`text-[12px] px-3 py-2 rounded-[8px] border flex items-center gap-2 ${borderBg}`}
                                      >
                                        <span className="font-mono font-bold">{opt.letter}.</span>
                                        <span className="flex-1 leading-snug">{opt.text}</span>
                                        {tag}
                                      </div>
                                    );
                                  })}
                                </div>
                                {!q.isAnswered && (
                                  <p className="text-[12px] text-[#AAA69B] italic">
                                    Student did not submit an answer for this question.
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Non-MCQ Types (Short Answer, True/False, Numerical) */}
                            {q.type !== "MCQ" && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[12px]">
                                <div className="p-3 rounded-[8px] bg-[#191916] border border-[rgba(244,240,231,0.06)] space-y-1">
                                  <span className="text-[11px] uppercase font-mono tracking-wider text-[#AAA69B] block">
                                    Student's Answer
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

                            {/* Explanation Card — Rendered across ALL question types whenever present */}
                            {q.explanation && q.explanation.trim() !== "" && (
                              <div className="p-3 rounded-[8px] bg-[#191916] border border-[rgba(244,240,231,0.08)] text-[12px] space-y-1">
                                <span className="text-[11px] font-semibold text-[#AAA69B] uppercase font-mono tracking-wider block">
                                  Explanation
                                </span>
                                <p className="text-[#AAA69B] leading-relaxed">
                                  {q.explanation}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()
            ) : null}

            <div className="flex justify-end pt-2 border-t border-[rgba(244,240,231,0.06)]">
              <Button variant="secondary" onClick={() => setSelectedAnswersAttempt(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
