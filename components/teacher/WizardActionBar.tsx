"use client";

import { Button } from "@/components/ui/Button";

interface WizardActionBarProps {
  currentStep: number;
  totalSteps: number;
  isStepValid?: boolean;
  isSavingDraft?: boolean;
  isSubmitting?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft?: () => void;
  submitLabel?: string;
}

export function WizardActionBar({
  currentStep,
  totalSteps,
  isStepValid = true,
  isSavingDraft = false,
  isSubmitting = false,
  onBack,
  onNext,
  onSaveDraft,
  submitLabel = "Publish Exam",
}: WizardActionBarProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="pt-6 border-t border-[rgba(244,240,231,0.08)] flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
      <div className="w-full sm:w-auto">
        {onSaveDraft && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            className="w-full sm:w-auto text-[14px] text-[#AAA69B] hover:text-[#F4F0E7] disabled:opacity-50 transition-colors py-2 px-3 text-center"
          >
            {isSavingDraft ? "Saving draft..." : "Save as Draft"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {!isFirstStep && (
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            disabled={isSubmitting || isSavingDraft}
            className="flex-1 sm:flex-none min-w-[100px]"
          >
            ← Back
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          onClick={onNext}
          disabled={!isStepValid || isSubmitting || isSavingDraft}
          className="flex-1 sm:flex-none min-w-[130px]"
        >
          {isSubmitting
            ? "Processing..."
            : isLastStep
            ? submitLabel
            : "Continue →"}
        </Button>
      </div>
    </div>
  );
}
