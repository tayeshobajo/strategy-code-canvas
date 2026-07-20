import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, GitBranch, User2, Calendar, Activity, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { RoadmapMilestoneView, RoadmapPhase } from "@/lib/roadmap-view";
import { phasePalette } from "@/lib/roadmap-studio-layout";

type Selection =
  | { kind: "none" }
  | { kind: "milestone"; milestone: RoadmapMilestoneView; phase: RoadmapPhase | null; phaseIndex: number; index: string; unlocks: RoadmapMilestoneView[] }
  | { kind: "phase"; phase: RoadmapPhase; index: number; milestones: RoadmapMilestoneView[] }
  | { kind: "point"; which: "A" | "B"; label: string; detail: string | null };

const readinessLabel: Record<string, string> = {
  done: "Complete",
  ready: "Ready",
  review: "In Review",
  blocked: "Blocked",
  pending: "Pending",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-rule py-2 text-[12px] last:border-b-0">
      <span className="text-ink/55">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/45">
      {children}
    </div>
  );
}

export function StudioInspector({
  projectId,
  selection,
  onClose,
  collapsed,
  onToggle,
}: {
  projectId: string;
  selection: Selection;
  onClose: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  if (collapsed) {
    return (
      <aside className="flex h-full w-[36px] shrink-0 flex-col items-center border-l border-rule bg-white py-2" aria-label="Inspector (collapsed)">
        <button
          type="button"
          onClick={onToggle}
          title="Expand inspector"
          aria-label="Expand inspector"
          className="rounded-md border border-rule bg-white p-1.5 text-ink/70 hover:text-ink"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </button>
      </aside>
    );
  }
  return (
    <aside
      className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-rule bg-white"
      data-qa-panel="studio-inspector"
      aria-label="Inspector"
    >
      <button
        type="button"
        onClick={onToggle}
        title="Collapse inspector"
        aria-label="Collapse inspector"
        className="absolute right-2 top-2 z-10 rounded p-1 text-ink/50 hover:text-ink"
      >
        <PanelRightClose className="h-3.5 w-3.5" />
      </button>

      {selection.kind === "none" && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">Inspector</div>
          <p className="text-sm text-ink/60">
            Select a milestone, phase, or Point A / Point B to inspect it.
          </p>
        </div>
      )}

      {selection.kind === "milestone" && (
        <MilestoneInspector projectId={projectId} sel={selection} onClose={onClose} />
      )}

      {selection.kind === "phase" && <PhaseInspector sel={selection} onClose={onClose} />}

      {selection.kind === "point" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-sm bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white">
              Point {selection.which}
            </span>
            <button onClick={onClose} className="text-xs text-ink/50 hover:text-ink" aria-label="Close inspector">✕</button>
          </div>
          <h2 className="font-display text-xl text-ink">{selection.label}</h2>
          {selection.detail && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/70">{selection.detail}</p>
          )}
        </div>
      )}
    </aside>
  );
}

function MilestoneInspector({
  projectId,
  sel,
  onClose,
}: {
  projectId: string;
  sel: Extract<Selection, { kind: "milestone" }>;
  onClose: () => void;
}) {
  const { milestone: m, phase, phaseIndex, index, unlocks } = sel;
  const palette = phasePalette(phaseIndex);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-rule px-5 pt-4 pb-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-6 items-center rounded-sm px-2 font-mono text-[10px] uppercase tracking-wider text-white"
              style={{ backgroundColor: palette.ring }}
            >
              {index}
            </span>
            <span className="text-[11px] font-medium text-ink/70">{phase?.name ?? "Unphased"}</span>
          </div>
          <button onClick={onClose} className="text-xs text-ink/50 hover:text-ink" aria-label="Close inspector">✕</button>
        </div>
        <h2 className="text-base font-semibold leading-tight text-ink">{m.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-sm border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
            {(m.status ?? "planned").replace(/_/g, " ")}
          </span>
          <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
            Build
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {m.outcome && (
          <>
            <SectionTitle>Strategic role</SectionTitle>
            <p className="text-[12.5px] leading-snug text-ink/80">{m.outcome}</p>
          </>
        )}

        {unlocks.length > 0 && (
          <>
            <SectionTitle>Unlocks</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {unlocks.slice(0, 6).map((u) => (
                <span
                  key={u.id}
                  className="rounded-sm border border-rule bg-white px-1.5 py-0.5 text-[10.5px] text-ink/80"
                >
                  {u.name}
                </span>
              ))}
            </div>
          </>
        )}

        <SectionTitle>Execution</SectionTitle>
        <Row label="Current Gate"><span className="capitalize">{readinessLabel[m.readiness.criteria] ?? "Brief"}</span></Row>
        <Row label="Readiness"><span>{readinessCount(m)}</span></Row>
        <Row label="Owner"><span className="inline-flex items-center gap-1"><User2 className="h-3 w-3" />{m.owner ?? "—"}</span></Row>
        <Row label="Due Date"><span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{m.due_date ? new Date(m.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</span></Row>
        <Row label="Health"><HealthBadge h={m.health} /></Row>

        {m.blocked_by.length > 0 && (
          <>
            <SectionTitle>Dependencies</SectionTitle>
            <ul className="space-y-1">
              {m.blocked_by.slice(0, 8).map((id) => (
                <li key={id} className="flex items-center gap-2 text-[12px] text-ink/80">
                  <GitBranch className="h-3 w-3 text-ink/40" />
                  <span className="truncate">{id}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-rule p-4">
        <Link
          to="/engine/projects/$projectId/milestones/$milestoneId/brief"
          params={{ projectId, milestoneId: m.id }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-medium text-white hover:bg-ink/90"
        >
          Open Milestone Workspace <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function readinessCount(m: RoadmapMilestoneView): string {
  const gates = ["criteria", "build", "qa_auto", "qa_human", "dependencies", "blockers"] as const;
  const done = gates.filter((g) => m.readiness[g] === "done").length;
  return `${done} / ${gates.length}`;
}

function HealthBadge({ h }: { h: RoadmapMilestoneView["health"] }) {
  const map = {
    on_track: { label: "On Track", cls: "text-emerald-700", Icon: CheckCircle2 },
    needs_attention: { label: "Attention", cls: "text-amber-700", Icon: Activity },
    at_risk: { label: "At Risk", cls: "text-rose-700", Icon: Activity },
    unknown: { label: "Unknown", cls: "text-ink/60", Icon: Activity },
  } as const;
  const { label, cls, Icon } = map[h];
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function PhaseInspector({
  sel,
  onClose,
}: {
  sel: Extract<Selection, { kind: "phase" }>;
  onClose: () => void;
}) {
  const palette = phasePalette(sel.index);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-rule px-5 pt-4 pb-3">
        <div className="mb-2 flex items-start justify-between">
          <span
            className="inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white"
            style={{ backgroundColor: palette.ring }}
          >
            Phase {sel.phase.order}
          </span>
          <button onClick={onClose} className="text-xs text-ink/50 hover:text-ink" aria-label="Close inspector">✕</button>
        </div>
        <h2 className="text-base font-semibold text-ink">{sel.phase.name}</h2>
        {sel.phase.outcome && <p className="mt-1 text-[12.5px] text-ink/70">{sel.phase.outcome}</p>}
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <SectionTitle>Summary</SectionTitle>
        <Row label="Milestones"><span>{sel.milestones.length}</span></Row>
        <Row label="Complete"><span>{sel.phase.completed_count}</span></Row>
        <Row label="Active"><span>{sel.phase.active_count}</span></Row>
        <Row label="Blocked"><span>{sel.phase.blocked_count}</span></Row>
        <Row label="Health"><span className="capitalize">{sel.phase.health.replace(/_/g, " ")}</span></Row>
      </div>
    </div>
  );
}

export type StudioSelection = Selection;
