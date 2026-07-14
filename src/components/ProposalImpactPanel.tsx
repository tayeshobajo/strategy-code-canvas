// Phase H6 · J4 — Universal proposal impact panel.
//
// Renders the standardised `impact_summary` payload that every
// `engine_project_chat_proposals` row will carry once PENDING §H6-J4
// migration lands. Until then, callers may pass a locally computed
// summary — the shape is identical.
//
// Purpose: give reviewers a consistent "what changes if this is
// approved" view across every proposal type (spine edit, milestone
// body, plan body, roadmap adjustment, workflow diff, etc.).

import { AlertTriangle, DollarSign, Users, Calendar, GitBranch, Target } from "lucide-react";

export type ProposalImpactSummary = {
  scope?: string | null;
  budgetDelta?: { currency: string; amount: number; note?: string } | null;
  timelineDelta?: { days: number; note?: string } | null;
  dependencies?: string[] | null;
  clientExpectations?: string | null;
  reversibility?: "trivial" | "reversible" | "hard" | "irreversible" | null;
  risks?: string[] | null;
};

const REVERSIBILITY_COLOR: Record<NonNullable<ProposalImpactSummary["reversibility"]>, string> = {
  trivial: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  reversible: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  hard: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  irreversible: "bg-red-500/20 text-red-300 border-red-500/30",
};

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-white/50 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
        <div className="text-xs text-white/80 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function ProposalImpactPanel({ summary }: { summary: ProposalImpactSummary | null | undefined }) {
  if (!summary) {
    return (
      <div className="rounded border border-dashed border-white/10 bg-white/[0.02] p-3 text-xs text-white/40">
        No impact summary provided.
      </div>
    );
  }

  const {
    scope, budgetDelta, timelineDelta, dependencies, clientExpectations, reversibility, risks,
  } = summary;

  const hasSomething = scope || budgetDelta || timelineDelta ||
    (dependencies && dependencies.length) ||
    clientExpectations || reversibility || (risks && risks.length);

  if (!hasSomething) {
    return (
      <div className="rounded border border-dashed border-white/10 bg-white/[0.02] p-3 text-xs text-white/40">
        No material impact recorded.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/50 font-medium">Impact Summary</div>
        {reversibility && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${REVERSIBILITY_COLOR[reversibility]}`}>
            {reversibility}
          </span>
        )}
      </div>

      {scope && <Row icon={<Target className="w-3.5 h-3.5" />} label="Scope">{scope}</Row>}

      {budgetDelta && (
        <Row icon={<DollarSign className="w-3.5 h-3.5" />} label="Budget">
          {budgetDelta.amount >= 0 ? "+" : ""}
          {budgetDelta.amount.toLocaleString()} {budgetDelta.currency}
          {budgetDelta.note && <span className="text-white/50"> · {budgetDelta.note}</span>}
        </Row>
      )}

      {timelineDelta && (
        <Row icon={<Calendar className="w-3.5 h-3.5" />} label="Timeline">
          {timelineDelta.days >= 0 ? "+" : ""}
          {timelineDelta.days} day{Math.abs(timelineDelta.days) === 1 ? "" : "s"}
          {timelineDelta.note && <span className="text-white/50"> · {timelineDelta.note}</span>}
        </Row>
      )}

      {dependencies && dependencies.length > 0 && (
        <Row icon={<GitBranch className="w-3.5 h-3.5" />} label="Dependencies">
          {dependencies.join(", ")}
        </Row>
      )}

      {clientExpectations && (
        <Row icon={<Users className="w-3.5 h-3.5" />} label="Client Expectations">
          {clientExpectations}
        </Row>
      )}

      {risks && risks.length > 0 && (
        <Row icon={<AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />} label="Risks">
          <ul className="list-disc pl-4 space-y-0.5">
            {risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Row>
      )}
    </div>
  );
}

/**
 * Helper for callers that haven't yet backfilled `impact_summary` at write
 * time — derive a best-effort payload from a proposal row.
 */
export function deriveImpactSummary(row: {
  proposal_type?: string | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): ProposalImpactSummary {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const stored = (meta.impact_summary ?? payload.impact_summary) as ProposalImpactSummary | undefined;
  if (stored && typeof stored === "object") return stored;

  return {
    scope: typeof payload.scope === "string" ? payload.scope : null,
    reversibility: row.proposal_type === "implementation_prompt" ? "hard" : "reversible",
    dependencies: Array.isArray(payload.depends_on) ? (payload.depends_on as string[]) : null,
  };
}
