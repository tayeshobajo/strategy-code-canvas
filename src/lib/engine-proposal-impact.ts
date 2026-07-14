// Phase H6.5 · J4 wire-up — Zod schema for `engine_project_chat_proposals.impact_summary`.
//
// This mirrors the shape rendered by `ProposalImpactPanel` and is used by
// `updateProposalImpact` on write. Keep in sync with `ProposalImpactSummary`
// in src/components/ProposalImpactPanel.tsx.

import { z } from "zod";

export const impactSummarySchema = z.object({
  scope: z.string().max(500).nullable().optional(),
  budgetDelta: z
    .object({
      currency: z.string().min(1).max(8),
      amount: z.number().finite(),
      note: z.string().max(200).optional(),
    })
    .nullable()
    .optional(),
  timelineDelta: z
    .object({
      days: z.number().int(),
      note: z.string().max(200).optional(),
    })
    .nullable()
    .optional(),
  dependencies: z.array(z.string().max(200)).max(50).nullable().optional(),
  clientExpectations: z.string().max(1000).nullable().optional(),
  reversibility: z.enum(["trivial", "reversible", "hard", "irreversible"]).nullable().optional(),
  risks: z.array(z.string().max(500)).max(50).nullable().optional(),
});

export type ImpactSummaryInput = z.infer<typeof impactSummarySchema>;
