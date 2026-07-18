/**
 * Dependency graph — SVG connectors between milestones across phases.
 *
 * Layout: each phase becomes a column; milestones stack top-to-bottom
 * inside the column ordered by due date. Connectors are drawn from
 * every dependency (from_id → to_id) as smooth cubic Beziers.
 *
 * Invalid / unknown sequencing is marked when:
 *  - upstream is in a later phase than downstream (backward dependency)
 *  - upstream is missing from the current milestone set
 *  - upstream is blocked (edge inherits blocked tone)
 *
 * Controls (client-side, no data refetch):
 *  - Toggle phase columns visible in the graph.
 *  - Highlight-only-invalid: dims all edges except backward / missing.
 *  - Focus milestone: dims everything not connected (up- or downstream)
 *    to the selected milestone.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Filter, X } from "lucide-react";
import type {
  RoadmapDependency,
  RoadmapMilestoneView,
  RoadmapPhase,
} from "@/lib/roadmap-view";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NodePos = { id: string; x: number; y: number; phaseIdx: number };

const COL_WIDTH = 220;
const ROW_HEIGHT = 46;
const PAD_X = 24;
const PAD_Y = 32;
const NODE_W = 176;
const NODE_H = 34;

export function RoadmapDependencyGraph({
  phases,
  milestones,
  dependencies,
}: {
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  dependencies: RoadmapDependency[];
}) {
  const allPhaseKeys = useMemo(() => phases.map((p) => p.key), [phases]);
  const [hiddenPhases, setHiddenPhases] = useState<Set<string>>(new Set());
  const [invalidOnly, setInvalidOnly] = useState(false);
  const [focusId, setFocusId] = useState<string | "">("");

  const visibleMilestones = useMemo(() => {
    if (hiddenPhases.size === 0) return milestones;
    const visiblePhaseMilestoneIds = new Set<string>();
    for (const p of phases) {
      if (!hiddenPhases.has(p.key)) {
        for (const id of p.milestone_ids) visiblePhaseMilestoneIds.add(id);
      }
    }
    // Keep orphans (not in any phase) visible always.
    const placed = new Set(phases.flatMap((p) => p.milestone_ids));
    return milestones.filter(
      (m) => visiblePhaseMilestoneIds.has(m.id) || !placed.has(m.id),
    );
  }, [milestones, phases, hiddenPhases]);

  const visiblePhases = useMemo(
    () => phases.filter((p) => !hiddenPhases.has(p.key)),
    [phases, hiddenPhases],
  );

  const layout = useMemo(() => {
    const columns: Array<{ phase: RoadmapPhase; ms: RoadmapMilestoneView[] }> =
      visiblePhases.map((p) => ({
        phase: p,
        ms: visibleMilestones
          .filter((m) => p.milestone_ids.includes(m.id))
          .sort((a, b) => {
            const da = a.due_date ? new Date(a.due_date).getTime() : 0;
            const db = b.due_date ? new Date(b.due_date).getTime() : 0;
            return da - db;
          }),
      }));
    const placed = new Set(columns.flatMap((c) => c.ms.map((m) => m.id)));
    const orphans = visibleMilestones.filter((m) => !placed.has(m.id));
    if (orphans.length > 0) {
      columns.push({
        phase: {
          key: "__unphased__",
          order: columns.length + 1,
          name: "Unphased",
          outcome: null,
          rationale: null,
          status: "planned",
          health: "unknown",
          client_safe_summary: null,
          owner: null,
          start: null,
          end: null,
          milestone_ids: orphans.map((m) => m.id),
          milestone_count: orphans.length,
          completed_count: 0,
          active_count: 0,
          blocked_count: 0,
        },
        ms: orphans,
      });
    }

    const nodes = new Map<string, NodePos>();
    columns.forEach((col, i) => {
      col.ms.forEach((m, j) => {
        nodes.set(m.id, {
          id: m.id,
          x: PAD_X + i * COL_WIDTH,
          y: PAD_Y + 24 + j * ROW_HEIGHT,
          phaseIdx: i,
        });
      });
    });

    const maxRows = Math.max(1, ...columns.map((c) => c.ms.length));
    const width = PAD_X * 2 + Math.max(1, columns.length) * COL_WIDTH;
    const height = PAD_Y * 2 + 24 + maxRows * ROW_HEIGHT;

    const edges = dependencies
      .map((d) => {
        const from = nodes.get(d.from_id);
        const to = nodes.get(d.to_id);
        const missingUpstream = !from;
        const backward = from && to ? from.phaseIdx > to.phaseIdx : false;
        return { d, from, to, missingUpstream, backward };
      })
      .filter((e) => e.to);

    return { columns, nodes, width, height, edges };
  }, [visiblePhases, visibleMilestones, dependencies]);

  // Build connected set for focus mode via BFS both directions.
  const connectedSet = useMemo<Set<string> | null>(() => {
    if (!focusId) return null;
    const adj = new Map<string, Set<string>>();
    for (const d of dependencies) {
      if (!adj.has(d.from_id)) adj.set(d.from_id, new Set());
      if (!adj.has(d.to_id)) adj.set(d.to_id, new Set());
      adj.get(d.from_id)!.add(d.to_id);
      adj.get(d.to_id)!.add(d.from_id);
    }
    const seen = new Set<string>([focusId]);
    const queue = [focusId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  }, [focusId, dependencies]);

  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-sm text-ink/60">
        No milestones to graph yet.
      </div>
    );
  }

  const invalidCount = layout.edges.filter(
    (e) => e.backward || e.missingUpstream,
  ).length;

  const togglePhase = (key: string) => {
    setHiddenPhases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-qa-section="roadmap-dependency-graph"
      aria-label="Dependency graph"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Dependencies
          </div>
          <h2 className="font-display text-base text-ink">Milestone graph</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Focus milestone */}
          <Select
            value={focusId}
            onValueChange={(v) => setFocusId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Focus milestone">
              <SelectValue placeholder="Focus a milestone…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All milestones</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {focusId && (
            <button
              type="button"
              onClick={() => setFocusId("")}
              className="inline-flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-[11px] text-ink/70 hover:bg-muted"
              aria-label="Clear focus"
            >
              <X className="h-3 w-3" /> clear focus
            </button>
          )}

          {/* Invalid-only toggle */}
          <button
            type="button"
            onClick={() => setInvalidOnly((v) => !v)}
            aria-pressed={invalidOnly}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
              invalidOnly
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-border bg-white text-ink/70 hover:bg-muted"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            {invalidOnly ? "showing invalid" : "highlight invalid"}
            {invalidCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-200/70 px-1.5 py-px font-mono text-[10px] text-amber-900">
                {invalidCount}
              </span>
            )}
          </button>

          {/* Phase filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-[11px] text-ink/70 hover:bg-muted"
                aria-label="Filter phases"
              >
                <Filter className="h-3 w-3" />
                Phases
                {hiddenPhases.size > 0 && (
                  <span className="ml-1 rounded-full bg-ink/10 px-1.5 py-px font-mono text-[10px] text-ink/70">
                    {allPhaseKeys.length - hiddenPhases.size}/{allPhaseKeys.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
                  Show phases
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setHiddenPhases(new Set())}
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-ink/60 hover:bg-muted"
                  >
                    <Eye className="h-3 w-3" /> all
                  </button>
                  <button
                    type="button"
                    onClick={() => setHiddenPhases(new Set(allPhaseKeys))}
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-ink/60 hover:bg-muted"
                  >
                    <EyeOff className="h-3 w-3" /> none
                  </button>
                </div>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {phases.map((p) => {
                  const visible = !hiddenPhases.has(p.key);
                  return (
                    <label
                      key={p.key}
                      className="flex items-center gap-2 rounded p-1 text-xs hover:bg-muted"
                    >
                      <Checkbox
                        checked={visible}
                        onCheckedChange={() => togglePhase(p.key)}
                        aria-label={`Toggle phase ${p.name}`}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-ink/40">
                        {p.milestone_count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-1.5 text-[11px] text-ink/70">
        <span className="font-mono uppercase tracking-wider text-ink/50">Legend</span>
        <LegendSwatch color="#94a3b8" label="dependency" />
        <LegendSwatch color="#d97706" label="at risk" />
        <LegendSwatch color="#e11d48" label="blocked" />
        <LegendSwatch color="#d97706" label="invalid / backward" dashed />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border-2 border-royal bg-royal/10" />
          on critical path
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-rose-500 bg-white" />
          blocked
        </span>
      </div>

      <div className="overflow-auto">
        <svg
          role="img"
          aria-label="Dependency graph"
          width={layout.width}
          height={layout.height}
          className="min-w-full"
        >
          {/* Phase column headers */}
          {layout.columns.map((col, i) => (
            <g key={col.phase.key}>
              <rect
                x={PAD_X + i * COL_WIDTH - 8}
                y={PAD_Y - 22}
                width={NODE_W + 16}
                height={layout.height - PAD_Y - 8}
                rx={10}
                className="fill-ink/[0.025]"
              />
              <text
                x={PAD_X + i * COL_WIDTH}
                y={PAD_Y - 4}
                className="fill-ink/60"
                fontSize={11}
                fontFamily="ui-monospace,monospace"
              >
                {col.phase.name.toUpperCase().slice(0, 30)}
              </text>
            </g>
          ))}

          {/* Edges */}
          {layout.edges.map((e, idx) => {
            const from = e.from;
            const to = e.to!;
            const isInvalid = e.backward || e.missingUpstream;
            const inFocus =
              !connectedSet ||
              (connectedSet.has(e.d.to_id) &&
                (e.d.from_id === focusId ||
                  connectedSet.has(e.d.from_id)));
            const dim =
              (invalidOnly && !isInvalid) || (connectedSet && !inFocus);
            const stroke = isInvalid
              ? "#d97706"
              : e.d.status === "blocked"
                ? "#e11d48"
                : e.d.status === "at_risk"
                  ? "#d97706"
                  : "#94a3b8";
            const dash = isInvalid ? "4 3" : undefined;
            const x1 = from ? from.x + NODE_W : Math.max(0, to.x - 60);
            const y1 = from ? from.y + NODE_H / 2 : to.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const dx = Math.max(30, (x2 - x1) / 2);
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            return (
              <g key={`e-${idx}`} opacity={dim ? 0.12 : 1}>
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isInvalid ? 2 : 1.5}
                  strokeDasharray={dash}
                >
                  <title>
                    {e.missingUpstream
                      ? `Unknown upstream ${e.d.from_id.slice(0, 8)} → ${to.id.slice(0, 8)}`
                      : e.backward
                        ? "Backward dependency across phases"
                        : (e.d.reason ?? "dependency")}
                  </title>
                </path>
              </g>
            );
          })}

          {/* Nodes */}
          {layout.columns.map((col) =>
            col.ms.map((m) => {
              const pos = layout.nodes.get(m.id)!;
              const onCp = m.on_critical_path;
              const border =
                m.status === "blocked"
                  ? "#e11d48"
                  : m.health === "at_risk"
                    ? "#d97706"
                    : onCp
                      ? "#7c3aed"
                      : "#cbd5e1";
              const fill = onCp ? "#f5f3ff" : "#ffffff";
              const dim =
                connectedSet && !connectedSet.has(m.id) && m.id !== focusId;
              const isFocus = m.id === focusId;
              return (
                <g key={m.id} opacity={dim ? 0.25 : 1}>
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={fill}
                    stroke={isFocus ? "#1e40af" : border}
                    strokeWidth={isFocus ? 2.5 : onCp ? 2 : 1}
                    className="cursor-pointer"
                    onClick={() =>
                      setFocusId((cur) => (cur === m.id ? "" : m.id))
                    }
                  />
                  <text
                    x={pos.x + 10}
                    y={pos.y + 14}
                    fontSize={11}
                    className="pointer-events-none fill-ink"
                  >
                    {truncate(m.name, 24)}
                  </text>
                  <text
                    x={pos.x + 10}
                    y={pos.y + 27}
                    fontSize={10}
                    className="pointer-events-none fill-ink/50"
                  >
                    {m.due_date
                      ? new Date(m.due_date).toLocaleDateString()
                      : "no date"}
                    {onCp ? " · CP" : ""}
                  </text>
                  <title>
                    {m.name}
                    {onCp ? " — on critical path" : ""}
                    {m.blocked_by.length > 0
                      ? ` — blocked by ${m.blocked_by.length}`
                      : ""}
                    {"\nClick to focus this milestone."}
                  </title>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </section>
  );
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={22} height={6}>
        <line
          x1={0}
          y1={3}
          x2={22}
          y2={3}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "3 2" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
