// Reusable "AI action" panel rendered at the top of each workflow step page.
// Shows: what this step knows, what's missing, what AI can draft,
// what requires human approval, and the next trigger. Pure presentation —
// callers pass the derived flags.

import { Sparkles, CheckCircle2, AlertTriangle, Lock, ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/engine/primitives";

// Static per-step spec: describes what AI can draft on each step, what always
// needs human approval, and what the natural next trigger is. Combined with
// live "knows/missing" flags derived from project state at render time.
type StepKey =
  | "point-a"
  | "point-b"
  | "hidden-assets"
  | "gap-map"
  | "blueprint"
  | "sequencing"
  | "deadlines"
  | "investment";

const STEP_SPEC: Record<
  StepKey,
  { label: string; canDraft: string[]; requiresApproval: string[]; nextTrigger: string }
> = {
  "point-a": {
    label: "Point A Diagnosis",
    canDraft: [
      "6-lens business snapshot from extracted signals",
      "Current-state diagnosis cards (partial / limited / missing / risk)",
      "One-line key diagnosis",
    ],
    requiresApproval: ["Operator confirms diagnosis is truthful before it feeds Point B"],
    nextTrigger: "Approve Point A → unlocks Point B drafting.",
  },
  "point-b": {
    label: "Point B Definition",
    canDraft: [
      "12-month desired-state narrative",
      "Success metrics per pillar",
      "North-star outcome sentence",
    ],
    requiresApproval: ["Operator + client confirm target state before Gap Map"],
    nextTrigger: "Approve Point B → unlocks Gap Map + Hidden Asset drafting.",
  },
  "hidden-assets": {
    label: "Hidden Asset Map",
    canDraft: [
      "Underused people/data/tools/IP inventory from signals",
      "Suggested activation moves per asset",
    ],
    requiresApproval: ["Operator verifies asset exists and is truly underused"],
    nextTrigger: "Confirm hidden assets → feeds Blueprint.",
  },
  "gap-map": {
    label: "Gap Map",
    canDraft: [
      "Gap list between Point A and Point B",
      "Severity + owner suggestion per gap",
    ],
    requiresApproval: ["Operator confirms gap severity before it drives milestones"],
    nextTrigger: "Approve gaps → feeds Blueprint and Milestones.",
  },
  blueprint: {
    label: "System Blueprint",
    canDraft: [
      "System nodes (people, tools, data, workflows)",
      "Connections + failure points",
    ],
    requiresApproval: ["Operator validates the blueprint reflects reality"],
    nextTrigger: "Approve Blueprint → unlocks Roadmap Builder.",
  },
  sequencing: {
    label: "Sequencing View",
    canDraft: [
      "30/60/90 phase assignment for each milestone",
      "Dependency ordering",
    ],
    requiresApproval: ["Operator confirms order matches client capacity"],
    nextTrigger: "Approve sequencing → unlocks Deadline Plan.",
  },
  deadlines: {
    label: "Deadline Plan",
    canDraft: [
      "Suggested due dates per milestone from phase + effort",
      "Critical-path flag",
    ],
    requiresApproval: ["Operator commits dates with client"],
    nextTrigger: "Approve dates → unlocks Investment Builder.",
  },
  investment: {
    label: "Investment Builder",
    canDraft: [
      "Cost estimate per milestone (agent hours + services)",
      "Recommended monthly budget envelope",
    ],
    requiresApproval: [
      "Admin-only confirmation of investment plan (never agent-authored)",
    ],
    nextTrigger: "Admin confirms investment → unlocks Client Preview.",
  },
};

export function stepAiSpec(step: StepKey) {
  return STEP_SPEC[step];
}

export type ComputedStepPanel = {
  knows: string[];
  missing: string[];
};

// Compute knows/missing from the workspace project's per-step JSON blob.
// Callers pass any object; we look for a small set of well-known keys.
export function computeStepKnowsMissing(step: StepKey, data: unknown): ComputedStepPanel {
  const d = (data ?? {}) as Record<string, unknown>;
  const has = (k: string): boolean => {
    const v = d[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
    return true;
  };
  const knows: string[] = [];
  const missing: string[] = [];
  const check = (key: string, label: string) => {
    (has(key) ? knows : missing).push(label);
  };
  switch (step) {
    case "point-a":
      check("lenses", "6-lens business snapshot");
      check("diagnosis", "Current-state diagnosis cards");
      check("key_diagnosis", "Key diagnosis sentence");
      break;
    case "point-b":
      check("narrative", "12-month desired-state narrative");
      check("success_metrics", "Success metrics per pillar");
      check("north_star", "North-star outcome");
      break;
    case "hidden-assets":
      check("assets", "Hidden asset inventory");
      check("activation_moves", "Activation moves");
      break;
    case "gap-map":
      check("gaps", "Gap list");
      check("severity_scored", "Severity assessment");
      break;
    case "blueprint":
      check("nodes", "System nodes");
      check("connections", "Node connections");
      check("failure_points", "Failure points");
      break;
    case "sequencing":
      check("phases", "30/60/90 phase assignments");
      check("dependencies", "Dependency ordering");
      break;
    case "deadlines":
      check("dates", "Milestone due dates");
      check("critical_path", "Critical-path flags");
      break;
    case "investment":
      check("estimates", "Per-milestone cost estimates");
      check("monthly_budget", "Monthly budget envelope");
      break;
  }
  return { knows, missing };
}


export type StepAiPanelProps = {
  stepLabel: string;
  knows: string[];
  missing: string[];
  canDraft: string[];
  requiresApproval: string[];
  nextTrigger: string;
  onDraft?: () => void;
  draftLabel?: string;
  draftDisabled?: boolean;
  draftPending?: boolean;
  draftHint?: string;
};

function List({
  items,
  icon,
  iconClass,
  empty,
}: {
  items: string[];
  icon: React.ReactNode;
  iconClass: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <div className="text-xs text-ink/50 italic">{empty}</div>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-ink/80">
          <span className={`mt-0.5 shrink-0 ${iconClass}`}>{icon}</span>
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function StepAiPanel(p: StepAiPanelProps) {
  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-royal" />
          AI action — {p.stepLabel}
        </span>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink/60 mb-1.5">Knows</div>
          <List
            items={p.knows}
            icon={<CheckCircle2 className="w-3 h-3" />}
            iconClass="text-emerald-600"
            empty="Nothing captured yet."
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink/60 mb-1.5">Missing</div>
          <List
            items={p.missing}
            icon={<AlertTriangle className="w-3 h-3" />}
            iconClass="text-amber-600"
            empty="Nothing missing."
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink/60 mb-1.5">AI can draft</div>
          <List
            items={p.canDraft}
            icon={<Sparkles className="w-3 h-3" />}
            iconClass="text-royal"
            empty="No AI drafting available for this step."
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink/60 mb-1.5">Requires human approval</div>
          <List
            items={p.requiresApproval}
            icon={<Lock className="w-3 h-3" />}
            iconClass="text-ink/60"
            empty="No approval gate."
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-3">
        <div className="text-xs text-ink/70">
          <span className="uppercase tracking-widest text-[10px] text-ink/50 mr-2">Next trigger</span>
          <ArrowRight className="inline w-3 h-3 mr-1" />
          {p.nextTrigger}
        </div>
        {p.onDraft ? (
          <div className="flex items-center gap-2">
            {p.draftHint ? <span className="text-[11px] text-ink/60">{p.draftHint}</span> : null}
            <button
              type="button"
              onClick={p.onDraft}
              disabled={p.draftDisabled || p.draftPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-royal/90 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {p.draftPending ? "Drafting…" : p.draftLabel ?? "Ask AI to draft"}
            </button>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
