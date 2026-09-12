"use client";

interface Step {
  label: string;
}

interface ProgressStepperProps {
  steps: Step[];
  currentStep: number; // 1-indexed
}

export function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <>
      {/* Desktop: horizontal pills */}
      <div className="hidden sm:flex items-center gap-0">
        {steps.map((step, idx) => {
          const num = idx + 1;
          const isCompleted = num < currentStep;
          const isActive = num === currentStep;
          return (
            <div key={num} className="flex items-center">
              <div className={["flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors",
                isActive ? "bg-[#E4572E]/10 text-[#E4572E]" :
                isCompleted ? "text-[#7A9E7E]" : "text-[#737067]",
              ].join(" ")}>
                <span className={["w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                  isActive ? "bg-[#E4572E] text-white" :
                  isCompleted ? "bg-[#7A9E7E] text-white" : "bg-[#22211C] text-[#737067] border border-[rgba(244,240,231,0.09)]",
                ].join(" ")}>
                  {isCompleted ? "✓" : num}
                </span>
                <span>{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className={["w-8 h-px mx-1", num < currentStep ? "bg-[#7A9E7E]/40" : "bg-[rgba(244,240,231,0.08)]"].join(" ")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: compact text + bar */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[#AAA69B]">Step {currentStep} of {steps.length}</span>
          <span className="text-[14px] font-semibold text-[#F4F0E7]">{steps[currentStep - 1]?.label}</span>
        </div>
        <div className="w-full h-1 bg-[#22211C] rounded-full overflow-hidden">
          <div className="h-full bg-[#E4572E] rounded-full transition-all duration-300" style={{ width: `${(currentStep / steps.length) * 100}%` }} />
        </div>
      </div>
    </>
  );
}
