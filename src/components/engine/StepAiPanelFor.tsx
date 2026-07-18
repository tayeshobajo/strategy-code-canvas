// Thin wrapper that builds StepAiPanel props from a workspace project + step.
// Keeps each step route to a single-line panel insertion.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { StepAiPanel, stepAiSpec, computeStepKnowsMissing } from "@/components/engine/StepAiPanel";
import { fillMissingSpineDetailsFromIntake } from "@/lib/engine-spine-ai-fill.functions";

type StepKey =
  | "point-a"
  | "point-b"
  | "hidden-assets"
  | "gap-map"
  | "blueprint"
  | "sequencing"
  | "deadlines"
  | "investment";

export function StepAiPanelFor({
  step,
  data,
  projectId,
}: {
  step: StepKey;
  data: unknown;
  projectId?: string;
}) {
  const spec = stepAiSpec(step);
  const { knows, missing } = computeStepKnowsMissing(step, data);
  const queryClient = useQueryClient();
  const fillMissing = useServerFn(fillMissingSpineDetailsFromIntake);
  const canFillSpine = Boolean(projectId && (step === "point-a" || step === "point-b"));
  const fillMutation = useMutation({
    mutationFn: () => fillMissing({ data: { projectId: projectId! } }),
    onSuccess: async (rawResult) => {
      const result = rawResult as { changed: string[] };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["engine", "spine-status", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["engine", "ceremony-summary", projectId] }),
      ]);
      const count = result.changed.length;
      toast.success(
        count
          ? `AI Product Manager drafted ${count} missing Spine field${count === 1 ? "" : "s"}. Review and approve on the Spine tab.`
          : "AI Product Manager reviewed the Spine. No blank fields were changed.",
      );
    },
    onError: (error) => {
      toast.error(
        (error as Error).message || "AI Product Manager could not fill the missing details.",
      );
    },
  });
  return (
    <StepAiPanel
      stepLabel={spec.label}
      knows={knows}
      missing={missing}
      canDraft={spec.canDraft}
      requiresApproval={spec.requiresApproval}
      nextTrigger={spec.nextTrigger}
      onDraft={canFillSpine ? () => fillMutation.mutate() : undefined}
      draftLabel="Fill missing details"
      draftPending={fillMutation.isPending}
      draftDisabled={!canFillSpine}
      draftHint={
        canFillSpine
          ? "Drafts missing Point A and Point B fields from intake. Human approval still required."
          : "Per-step AI drafting is coming next slice."
      }
    />
  );
}
