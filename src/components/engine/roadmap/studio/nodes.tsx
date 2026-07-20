import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, Circle, AlertTriangle, Clock, GitBranch, Users } from "lucide-react";
import { STUDIO_LAYOUT, phasePalette } from "@/lib/roadmap-studio-layout";

type MilestoneData = {
  index: string;
  name: string;
  outcome: string | null;
  status: string;
  owner: string | null;
  hasDeps: boolean;
  onCriticalPath: boolean;
  phaseIndex: number;
  isCurrent: boolean;
};

const statusChip: Record<string, { label: string; cls: string }> = {
  complete: { label: "Complete",    cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  done:     { label: "Complete",    cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  in_progress: { label: "In Progress", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  active:   { label: "In Progress", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  in_review: { label: "In Review",  cls: "bg-amber-50 text-amber-800 border-amber-200" },
  review:   { label: "In Review",   cls: "bg-amber-50 text-amber-800 border-amber-200" },
  blocked:  { label: "Blocked",     cls: "bg-rose-50 text-rose-800 border-rose-200" },
  at_risk:  { label: "At Risk",     cls: "bg-amber-50 text-amber-800 border-amber-200" },
};

function StatusPill({ status }: { status: string }) {
  const s = statusChip[status] ?? { label: "Planned", cls: "bg-slate-50 text-slate-700 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function MilestoneNode({ data, selected }: NodeProps) {
  const d = data as unknown as MilestoneData;
  const palette = phasePalette(d.phaseIndex);
  return (
    <div
      className="group relative rounded-md border bg-white shadow-sm transition-shadow"
      style={{
        width: STUDIO_LAYOUT.cardW,
        minHeight: STUDIO_LAYOUT.cardH,
        borderColor: selected ? "var(--ink)" : "var(--rule)",
        borderWidth: selected ? 1.5 : 1,
        boxShadow: selected
          ? "0 0 0 3px color-mix(in oklch, var(--royal) 18%, transparent), 0 6px 20px -12px rgba(15,23,42,.25)"
          : "0 1px 2px rgba(15,23,42,.05)",
      }}
      data-qa-node="milestone"
      aria-label={`Milestone ${d.name}, ${d.status}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: palette.ring, width: 6, height: 6, border: 0 }} />
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50">{d.index}</span>
        {d.onCriticalPath && (
          <span title="On critical path" className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
        )}
      </div>
      <div className="px-3 pb-2.5">
        <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-tight text-ink">{d.name}</div>
        {d.outcome && (
          <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink/60">{d.outcome}</div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <StatusPill status={d.status} />
          <div className="ml-auto flex items-center gap-1 text-ink/40">
            {d.hasDeps && <GitBranch className="h-3 w-3" aria-label="Has dependencies" />}
            {d.owner && <Users className="h-3 w-3" aria-label={`Owner ${d.owner}`} />}
          </div>
        </div>
      </div>
      {d.isCurrent && (
        <div className="absolute -top-2 left-2 rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
          You are here
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: palette.ring, width: 6, height: 6, border: 0 }} />
    </div>
  );
}

type PointData = { kind: "A" | "B"; label: string; detail: string | null };

export function PointNode({ data }: NodeProps) {
  const d = data as unknown as PointData;
  return (
    <div
      className="relative flex flex-col rounded-md border border-ink bg-ink text-white shadow-md"
      style={{ width: 190, minHeight: 170 }}
      data-qa-node={`point-${d.kind.toLowerCase()}`}
    >
      {d.kind === "B" && <Handle type="target" position={Position.Left} style={{ background: "white", width: 6, height: 6, border: 0 }} />}
      <div className="flex items-center gap-2 border-b border-white/15 px-3 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 font-mono text-[11px]">{d.kind}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">POINT {d.kind}</span>
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <div className="text-[13px] font-semibold text-white">{d.label}</div>
        {d.detail && <div className="mt-1.5 line-clamp-4 text-[11px] leading-snug text-white/70">{d.detail}</div>}
      </div>
      {d.kind === "A" && <Handle type="source" position={Position.Right} style={{ background: "white", width: 6, height: 6, border: 0 }} />}
    </div>
  );
}

type PhaseData = {
  index: number;
  order: number;
  name: string;
  outcome: string | null;
  count: number;
};

export function PhaseHeaderNode({ data }: NodeProps) {
  const d = data as unknown as PhaseData;
  const palette = phasePalette(d.index);
  return (
    <div
      className="pointer-events-none rounded-md border bg-white/70 backdrop-blur-sm"
      style={{
        width: STUDIO_LAYOUT.cardW,
        minHeight: STUDIO_LAYOUT.laneHeaderH,
        borderColor: palette.ring,
        borderTopWidth: 3,
      }}
      data-qa-node="phase-header"
    >
      <div className="px-3 pt-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
          Phase {d.order}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-ink">{d.name}</div>
        {d.outcome && <div className="mt-0.5 line-clamp-2 text-[11px] text-ink/55">{d.outcome}</div>}
      </div>
    </div>
  );
}

export const STUDIO_NODE_TYPES = {
  milestone: MilestoneNode,
  pointA: PointNode,
  pointB: PointNode,
  phaseHeader: PhaseHeaderNode,
} as const;
