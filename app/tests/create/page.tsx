"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProgressStepper } from "@/components/ui/ProgressStepper";
import { WizardActionBar } from "@/components/teacher/WizardActionBar";
import { QuestionList } from "@/components/teacher/QuestionList";
import { QuestionEditor, QuestionDraft } from "@/components/teacher/QuestionEditor";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { SyncStatus } from "@/components/ui/SyncStatus";

const STEPS = [
  { label: "Details" },
  { label: "Questions" },
  { label: "Settings" },
  { label: "Review & Publish" },
];

export default function CreateTestPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: Details
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [className, setClassName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [detailsErrors, setDetailsErrors] = useState<Record<string, string>>({});

  // Step 2: Questions
  const [questions, setQuestions] = useState<(QuestionDraft & { id: string })[]>([]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // Step 3: Settings
  const [cameraRequired, setCameraRequired] = useState(true);
  const [fullscreenRequired, setFullscreenRequired] = useState(true);
  const [tabSwitchDetection, setTabSwitchDetection] = useState(true);
  const [warningLimit, setWarningLimit] = useState(3);
  const [autoSubmitOnExpiry, setAutoSubmitOnExpiry] = useState(true);
  const [showResultImmediately, setShowResultImmediately] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishedTest, setPublishedTest] = useState<{ id: string; testCode: string; title: string } | null>(null);

  // Validation
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!subject.trim()) errs.subject = "Subject is required";
    if (!className.trim()) errs.className = "Class / Grade is required";
    if (durationMinutes < 1 || durationMinutes > 180) errs.duration = "Duration must be between 1 and 180 minutes";
    setDetailsErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
    } else if (step === 2) {
      if (questions.length === 0) {
        setErrorMessage("Please add at least 1 question before proceeding.");
        return;
      }
      setErrorMessage(null);
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      handleSaveOrPublish(true);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setErrorMessage(null);
      setStep(step - 1);
    }
  };

  // Question Handlers
  const handleSaveQuestion = async (draft: QuestionDraft) => {
    if (editingQuestionId) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestionId ? { ...draft, id: editingQuestionId } : q))
      );
      setEditingQuestionId(null);
    } else {
      const newQ = { ...draft, id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
      setQuestions((prev) => [...prev, newQ]);
    }
    setIsAddingQuestion(false);
  };

  const handleDeleteQuestion = async (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleMoveUp = async (id: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const temp = copy[idx - 1];
      copy[idx - 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  const handleMoveDown = async (id: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const copy = [...prev];
      const temp = copy[idx + 1];
      copy[idx + 1] = copy[idx];
      copy[idx] = temp;
      return copy;
    });
  };

  // Submit test (as draft or published)
  const handleSaveOrPublish = async (publish: boolean) => {
    setIsSubmitting(true);
    setSaveStatus("saving");
    setErrorMessage(null);

    try {
      const payload = {
        title: title.trim(),
        subject: subject.trim(),
        className: className.trim(),
        description: description.trim() || undefined,
        durationSeconds: durationMinutes * 60,
        maxAttempts,
        settings: {
          cameraRequired,
          fullscreenRequired,
          tabSwitchDetection,
          warningLimit,
          autoSubmitOnExpiry,
          showResultImmediately,
          showCorrectAnswers,
          randomizeQuestions,
          randomizeOptions,
        },
      };

      // 1. Create Test
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || "Failed to create test.");
      }

      const testId = resData.test.id;

      // 2. Add Questions
      for (const q of questions) {
        const qPayload = {
          type: q.type,
          questionText: q.questionText,
          options: q.type === "MCQ" ? q.options : undefined,
          correctAnswer: q.correctAnswer,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          explanation: q.explanation || undefined,
        };

        const qRes = await fetch(`/api/tests/${testId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(qPayload),
        });

        if (!qRes.ok) {
          const qErr = await qRes.json();
          throw new Error(qErr.error?.message || "Failed to add some questions.");
        }
      }

      // 3. Publish if requested
      if (publish) {
        const pubRes = await fetch(`/api/tests/${testId}/publish`, { method: "POST" });
        const pubData = await pubRes.json();
        if (!pubRes.ok) {
          throw new Error(pubData.error?.message || "Failed to publish test.");
        }
        setSaveStatus("saved");
        setPublishedTest({
          id: testId,
          testCode: pubData.test.testCode,
          title: pubData.test.title,
        });
      } else {
        setSaveStatus("saved");
        router.push(`/tests/${testId}`);
      }
    } catch (err: unknown) {
      setSaveStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Wizard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[rgba(244,240,231,0.08)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/tests" className="text-[13px] text-[#AAA69B] hover:text-[#F4F0E7]">
              ← Back to Tests
            </Link>
            <span className="text-[#AAA69B]">/</span>
            <span className="text-[13px] text-[#F4F0E7] font-medium">New Exam</span>
          </div>
          <h1 className="text-[24px] font-bold text-[#F4F0E7] tracking-tight">Create Examination</h1>
        </div>

        <div className="flex items-center gap-3">
          <SyncStatus state={saveStatus} />
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-4">
        <ProgressStepper steps={STEPS} currentStep={step} />
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-[12px] bg-[#E4572E]/10 border border-[#E4572E]/30 text-[#E4572E] text-[14px] flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-[13px] font-bold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 space-y-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[#F4F0E7]">Basic Information</h2>
            <p className="text-[13px] text-[#AAA69B]">Provide general details about this exam.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                Exam Title <span className="text-[#E4572E]">*</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Physics Assessment"
                className="w-full"
              />
              {detailsErrors.title && <p className="text-[12px] text-[#E4572E] mt-1">{detailsErrors.title}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                  Subject <span className="text-[#E4572E]">*</span>
                </label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Physics, Mathematics"
                />
                {detailsErrors.subject && <p className="text-[12px] text-[#E4572E] mt-1">{detailsErrors.subject}</p>}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                  Class / Grade <span className="text-[#E4572E]">*</span>
                </label>
                <Input
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Grade 10 - Section A"
                />
                {detailsErrors.className && <p className="text-[12px] text-[#E4572E] mt-1">{detailsErrors.className}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                  Duration (Minutes) <span className="text-[#E4572E]">*</span>
                </label>
                <Input
                  type="number"
                  min={1}
                  max={180}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                />
                {detailsErrors.duration && <p className="text-[12px] text-[#E4572E] mt-1">{detailsErrors.duration}</p>}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                  Max Attempts per Student
                </label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#F4F0E7] mb-1.5">
                Instructions / Description
              </label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional instructions for students before they begin..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Questions */}
      {step === 2 && (
        <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-[#F4F0E7]">Questions ({questions.length})</h2>
              <p className="text-[13px] text-[#AAA69B]">Total marks: {totalMarks}</p>
            </div>

            {!isAddingQuestion && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingQuestionId(null);
                  setIsAddingQuestion(true);
                }}
              >
                + Add Question
              </Button>
            )}
          </div>

          {isAddingQuestion ? (
            <div className="border border-[rgba(244,240,231,0.12)] rounded-[12px] p-5 bg-[#121210]">
              <div className="text-[15px] font-semibold text-[#F4F0E7] mb-4">
                {editingQuestionId ? "Edit Question" : "New Question"}
              </div>
              <QuestionEditor
                initial={editingQuestionId ? questions.find((q) => q.id === editingQuestionId) : undefined}
                onSave={handleSaveQuestion}
                onCancel={() => {
                  setIsAddingQuestion(false);
                  setEditingQuestionId(null);
                }}
              />
            </div>
          ) : (
            <QuestionList
              questions={questions}
              onEdit={(id) => {
                setEditingQuestionId(id);
                setIsAddingQuestion(true);
              }}
              onDelete={handleDeleteQuestion}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              editingId={editingQuestionId}
            />
          )}
        </div>
      )}

      {/* Step 3: Settings */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Proctoring Settings */}
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold text-[#F4F0E7]">Proctoring & Anti-Cheating</h2>
              <p className="text-[13px] text-[#AAA69B]">Configure automated supervision and integrity checks.</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Require Web Camera</div>
                  <div className="text-[12px] text-[#AAA69B]">Student camera feed is active and periodic checks are performed.</div>
                </div>
                <input
                  type="checkbox"
                  checked={cameraRequired}
                  onChange={(e) => setCameraRequired(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Force Fullscreen Mode</div>
                  <div className="text-[12px] text-[#AAA69B]">Locks exam into fullscreen; exiting logs a proctoring violation.</div>
                </div>
                <input
                  type="checkbox"
                  checked={fullscreenRequired}
                  onChange={(e) => setFullscreenRequired(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Detect Tab Switching</div>
                  <div className="text-[12px] text-[#AAA69B]">Flags when a student blurs the browser tab or switches windows.</div>
                </div>
                <input
                  type="checkbox"
                  checked={tabSwitchDetection}
                  onChange={(e) => setTabSwitchDetection(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <div className="p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] flex items-center justify-between gap-4">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Warning Limit Before Auto-Submit</div>
                  <div className="text-[12px] text-[#AAA69B]">Number of violations allowed before the exam auto-terminates.</div>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={warningLimit}
                  onChange={(e) => setWarningLimit(parseInt(e.target.value) || 3)}
                  className="w-20 text-center"
                />
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Auto-Submit on Timer Expiry</div>
                  <div className="text-[12px] text-[#AAA69B]">Automatically submits all saved answers when duration ends.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoSubmitOnExpiry}
                  onChange={(e) => setAutoSubmitOnExpiry(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Test Experience Settings */}
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold text-[#F4F0E7]">Exam Experience & Scoring</h2>
              <p className="text-[13px] text-[#AAA69B]">Configure order randomization and result visibility.</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Randomize Question Order</div>
                  <div className="text-[12px] text-[#AAA69B]">Every student receives questions in a unique random sequence.</div>
                </div>
                <input
                  type="checkbox"
                  checked={randomizeQuestions}
                  onChange={(e) => setRandomizeQuestions(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Randomize MCQ Option Order</div>
                  <div className="text-[12px] text-[#AAA69B]">Shuffles answer choices for each student.</div>
                </div>
                <input
                  type="checkbox"
                  checked={randomizeOptions}
                  onChange={(e) => setRandomizeOptions(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Show Score Immediately After Submit</div>
                  <div className="text-[12px] text-[#AAA69B]">Displays final score and percentage to student on submission page.</div>
                </div>
                <input
                  type="checkbox"
                  checked={showResultImmediately}
                  onChange={(e) => setShowResultImmediately(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-[10px] bg-[#22211C] border border-[rgba(244,240,231,0.08)] cursor-pointer">
                <div>
                  <div className="text-[14px] font-medium text-[#F4F0E7]">Show Correct Answers to Students</div>
                  <div className="text-[12px] text-[#AAA69B]">Reveals correct solutions and explanations after submission.</div>
                </div>
                <input
                  type="checkbox"
                  checked={showCorrectAnswers}
                  onChange={(e) => setShowCorrectAnswers(e.target.checked)}
                  className="w-5 h-5 accent-[#E4572E] rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review & Publish */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="bg-[#191916] border border-[rgba(244,240,231,0.08)] rounded-[14px] p-6 space-y-6">
            <div>
              <h2 className="text-[18px] font-semibold text-[#F4F0E7]">Review Examination</h2>
              <p className="text-[13px] text-[#AAA69B]">Review all settings and questions before publishing.</p>
            </div>

            {/* Test Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-[12px] bg-[#22211C] border border-[rgba(244,240,231,0.08)]">
              <div>
                <span className="text-[12px] text-[#AAA69B] block">Subject & Class</span>
                <span className="text-[14px] font-medium text-[#F4F0E7]">{subject} · {className}</span>
              </div>
              <div>
                <span className="text-[12px] text-[#AAA69B] block">Duration</span>
                <span className="text-[14px] font-medium text-[#F4F0E7]">{durationMinutes} Minutes</span>
              </div>
              <div>
                <span className="text-[12px] text-[#AAA69B] block">Questions</span>
                <span className="text-[14px] font-medium text-[#F4F0E7]">{questions.length} Items</span>
              </div>
              <div>
                <span className="text-[12px] text-[#AAA69B] block">Total Marks</span>
                <span className="text-[14px] font-medium text-[#F4F0E7]">{totalMarks} Marks</span>
              </div>
            </div>

            {/* Config Badges */}
            <div className="space-y-2">
              <span className="text-[13px] font-medium text-[#AAA69B]">Active Safeguards & Configuration:</span>
              <div className="flex flex-wrap gap-2">
                <Badge variant={cameraRequired ? "success" : "neutral"}>
                  {cameraRequired ? "Camera Required" : "Camera Disabled"}
                </Badge>
                <Badge variant={fullscreenRequired ? "success" : "neutral"}>
                  {fullscreenRequired ? "Fullscreen Lock" : "Standard Window"}
                </Badge>
                <Badge variant={tabSwitchDetection ? "success" : "neutral"}>
                  {tabSwitchDetection ? "Tab Switch Guard" : "No Tab Guard"}
                </Badge>
                <Badge variant="warning">{warningLimit} Warnings Allowed</Badge>
                {randomizeQuestions && <Badge variant="neutral">Questions Shuffled</Badge>}
                {randomizeOptions && <Badge variant="neutral">MCQ Options Shuffled</Badge>}
                <Badge variant={showResultImmediately ? "success" : "neutral"}>
                  {showResultImmediately ? "Immediate Results" : "Results Hidden"}
                </Badge>
              </div>
            </div>

            {/* Questions Summary */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#F4F0E7]">Question Breakdown</span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-[13px] text-[#E4572E] hover:underline"
                >
                  Edit Questions
                </button>
              </div>
              <div className="divide-y divide-[rgba(244,240,231,0.06)] border border-[rgba(244,240,231,0.08)] rounded-[12px] overflow-hidden">
                {questions.map((q, idx) => (
                  <div key={q.id} className="p-3 bg-[#191916] flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-3">
                      <span className="text-[#AAA69B] font-mono">#{idx + 1}</span>
                      <Badge variant="neutral">{q.type}</Badge>
                      <span className="text-[#F4F0E7] truncate max-w-sm sm:max-w-md">{q.questionText}</span>
                    </div>
                    <span className="text-[#AAA69B] font-medium shrink-0">{q.marks} m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <WizardActionBar
        currentStep={step}
        totalSteps={STEPS.length}
        isStepValid={step === 2 ? questions.length > 0 : true}
        isSubmitting={isSubmitting}
        onBack={handleBack}
        onNext={handleNext}
        onSaveDraft={() => handleSaveOrPublish(false)}
        submitLabel="Publish Exam Now"
      />

      {/* Published Success Dialog */}
      {publishedTest && (
        <Dialog
          isOpen={true}
          title="Exam Published Successfully!"
          onClose={() => router.push(`/tests/${publishedTest.id}`)}
        >
          <div className="space-y-5 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-[#7A9E7E]/20 text-[#7A9E7E] flex items-center justify-center text-2xl mx-auto">
              ✓
            </div>
            <div>
              <h3 className="text-[18px] font-bold text-[#F4F0E7]">{publishedTest.title}</h3>
              <p className="text-[13px] text-[#AAA69B] mt-1">Share this test code with your students to take the exam.</p>
            </div>

            <div className="p-4 rounded-[12px] bg-[#22211C] border border-[rgba(244,240,231,0.12)]">
              <span className="text-[11px] text-[#AAA69B] uppercase font-mono tracking-widest block mb-1">Test Code</span>
              <span className="text-[28px] font-mono font-bold text-[#E4572E] tracking-wider select-all">
                {publishedTest.testCode}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(publishedTest.testCode);
                }}
              >
                Copy Code
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => router.push(`/tests/${publishedTest.id}`)}
              >
                View Exam Dashboard →
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
