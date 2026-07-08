// Thin wrapper that builds StepAiPanel props from a workspace project + step.
// Keeps each step route to a single-line panel insertion.

import { StepAiPanel, stepAiSpec, computeStepKnowsMissing } from "@/components/engine/StepAiPanel";

type StepKey =
  | "point-a"
  | "point-b"
  | "hidden-assets"
  | "gap-map"
  | "blueprint"
  | "sequencing"
  | "deadlines"
  | "investment";

export function StepAiPanelFor({ step, data }: { step: StepKey; data: unknown }) {
  const spec = stepAiSpec(step);
  const { knows, missing } = computeStepKnowsMissing(step, data);
  return (
    <StepAiPanel
      stepLabel={spec.label}
      knows={knows}
      missing={missing}
      canDraft={spec.canDraft}
      requiresApproval={spec.requiresApproval}
      nextTrigger={spec.nextTrigger}
      draftHint="Per-step AI drafting is coming next slice — for now, use Intelligence Layer to regenerate."
    />
  );
}
