import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type Step = 1 | 2 | 3;

// The button row under a three step admin form (admin-place-detail.tsx and
// admin-business-detail.tsx): Cancel or Back on the left, Next or the save
// button on the right. One component so both forms behave the same.
//
// The keys are load-bearing: Next (type="button") and the submit button share
// a slot, and without keys React reuses the one DOM button and flips its type
// mid-click, submitting the form. Next gets a key per step for the same reason.
export function StepFooter({
  step,
  missingCount,
  canSubmit,
  saveLabel,
  onCancel,
  onStep,
}: Readonly<{
  step: Step;
  /** Required fields the current step still lacks; Next stays disabled above zero. */
  missingCount: number;
  canSubmit: boolean;
  saveLabel: string;
  onCancel: () => void;
  onStep: (step: Step) => void;
}>) {
  return (
    <div className="flex justify-between gap-2">
      {step === 1 ? (
        <Button key="cancel" type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button key="back" type="button" variant="outline" onClick={() => onStep(step === 3 ? 2 : 1)}>
          <CaretLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      {step < 3 && (
        <Button key={`next-${step}`} type="button" disabled={missingCount > 0} onClick={() => onStep(step === 1 ? 2 : 3)}>
          Next
          <CaretRight className="h-4 w-4" />
        </Button>
      )}
      {step === 3 && (
        <Button key="save" type="submit" disabled={!canSubmit}>
          {saveLabel}
        </Button>
      )}
    </div>
  );
}
