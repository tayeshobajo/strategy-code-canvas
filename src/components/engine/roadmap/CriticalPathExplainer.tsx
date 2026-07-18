/**
 * Popover explainer for critical-path membership.
 *
 * Surfaces the *exact* deterministic rules used by
 * `computeCriticalPath` in `src/lib/roadmap-view.ts` and shows which
 * ones apply to the given milestone or phase.
 *
 * Rules (mirror of the read model):
 *  R1. Chain membership — the milestone sits on the longest path
 *      through the dependency graph (memoized DFS on `from_id → to_id`).
 *  R2. Bottleneck — first milestone on the chain whose status is
 *      `blocked`, or whose health is `at_risk`.
 *  R3. Upstream drag — milestone has one or more upstream `blocked_by`
 *      predecessors that gate its start.
 *  R4. Phase inheritance — a phase is on the critical path when at
 *      least one of its milestones is on the chain.
 */

import * as React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RoadmapMilestoneView, RoadmapPhase } from "@/lib/roadmap-view";

type Rule = {
  id: "R1" | "R2" | "R3" | "R4";
  label: string;
  detail: string;
  applies: boolean;
};

export function MilestoneCpExplainer({
  milestone,
  isBottleneck,
  children,
}: {
  milestone: RoadmapMilestoneView;
  isBottleneck: boolean;
  children: React.ReactNode;
}) {
  const rules: Rule[] = [
    {
      id: "R1",
      label: "On longest dependency chain",
      detail:
        "This milestone lies on the longest path through the dependency graph, computed by memoized DFS over from_id → to_id edges.",
      applies: milestone.on_critical_path,
    },
    {
      id: "R2",
      label: "Bottleneck on the chain",
      detail:
        "First milestone on the critical chain whose status is blocked, or whose health is at_risk. This is what sets the projected delay.",
      applies: isBottleneck,
    },
    {
      id: "R3",
      label: "Gated by upstream",
      detail:
        milestone.blocked_by.length > 0
          ? `Held by ${milestone.blocked_by.length} upstream milestone${
              milestone.blocked_by.length === 1 ? "" : "s"
            } that must land first.`
          : "No upstream dependencies currently gate this milestone.",
      applies: milestone.blocked_by.length > 0,
    },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        data-qa-section="cp-explainer-milestone"
      >
        <ExplainerHeader
          title={milestone.name}
          subtitle={
            milestone.on_critical_path
              ? isBottleneck
                ? "Critical-path bottleneck"
                : "On critical path"
              : "Not on critical path"
          }
          tone={
            milestone.on_critical_path
              ? isBottleneck
                ? "rose"
                : "royal"
              : "muted"
          }
        />
        <RuleList rules={rules} />
        <FactRow label="Status" value={milestone.status} />
        <FactRow label="Health" value={milestone.health} />
        {milestone.due_date && (
          <FactRow
            label="Due"
            value={new Date(milestone.due_date).toLocaleDateString()}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PhaseCpExplainer({
  phase,
  milestonesOnCp,
  children,
}: {
  phase: RoadmapPhase;
  milestonesOnCp: RoadmapMilestoneView[];
  children: React.ReactNode;
}) {
  const rules: Rule[] = [
    {
      id: "R4",
      label: "Contains a critical milestone",
      detail:
        milestonesOnCp.length > 0
          ? `${milestonesOnCp.length} milestone${
              milestonesOnCp.length === 1 ? "" : "s"
            } in this phase sit on the longest dependency chain.`
          : "No milestones in this phase currently sit on the critical chain.",
      applies: milestonesOnCp.length > 0,
    },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        data-qa-section="cp-explainer-phase"
      >
        <ExplainerHeader
          title={phase.name}
          subtitle={
            milestonesOnCp.length > 0
              ? "Phase on critical path"
              : "Phase not on critical path"
          }
          tone={milestonesOnCp.length > 0 ? "royal" : "muted"}
        />
        <RuleList rules={rules} />
        {milestonesOnCp.length > 0 && (
          <div className="mt-2 rounded-md bg-royal/5 p-2">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-royal">
              On the chain
            </div>
            <ul className="space-y-0.5 text-[11px] text-ink/80">
              {milestonesOnCp.slice(0, 6).map((m) => (
                <li key={m.id}>· {m.name}</li>
              ))}
              {milestonesOnCp.length > 6 && (
                <li className="text-ink/50">
                  + {milestonesOnCp.length - 6} more
                </li>
              )}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ExplainerHeader({
  title,
  subtitle,
  tone,
}: {
  title: string;
  subtitle: string;
  tone: "royal" | "rose" | "muted";
}) {
  const chip =
    tone === "rose"
      ? "bg-rose-100 text-rose-800"
      : tone === "royal"
        ? "bg-royal/15 text-royal"
        : "bg-ink/10 text-ink/70";
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-ink/50" />
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${chip}`}
        >
          {subtitle}
        </span>
      </div>
      <div className="mt-1 truncate font-medium text-ink">{title}</div>
    </div>
  );
}

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ol className="space-y-1.5 border-t border-border pt-2 text-[11px]">
      {rules.map((r) => (
        <li key={r.id} className="flex gap-2">
          <span
            className={`mt-0.5 inline-flex h-4 w-6 flex-none items-center justify-center rounded font-mono text-[9px] tracking-wider ${
              r.applies
                ? "bg-royal text-white"
                : "bg-ink/10 text-ink/50 line-through"
            }`}
            aria-label={r.applies ? "rule applies" : "rule does not apply"}
          >
            {r.id}
          </span>
          <span>
            <span
              className={
                r.applies ? "font-medium text-ink" : "text-ink/60"
              }
            >
              {r.label}
            </span>
            <span className="ml-1 text-ink/60">{r.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex justify-between text-[11px] text-ink/60">
      <span>{label}</span>
      <span className="font-medium text-ink/80">{value}</span>
    </div>
  );
}
