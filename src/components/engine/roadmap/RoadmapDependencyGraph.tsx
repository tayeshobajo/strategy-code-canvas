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
 */

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type {
  RoadmapDependency,
  RoadmapMilestoneView,
  RoadmapPhase,
} from "@/lib/roadmap-view";

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
  const layout = useMemo(() => {
    // Assign each milestone to its phase column
    const columns: Array<{ phase: RoadmapPhase; ms: RoadmapMilestoneView[] }> =
      phases.map((p) => ({
        phase: p,
        ms: milestones
          .filter((m) => p.milestone_ids.includes(m.id))
          .sort((a, b) => {
            const da = a.due_date ? new Date(a.due_date).getTime() : 0;
            const db = b.due_date ? new Date(b.due_date).getTime() : 0;
            return da - db;
          }),
      }));
    // Orphans (no phase match) → trailing column
    const placed = new Set(columns.flatMap((c) => c.ms.map((m) => m.id)));
    const orphans = milestones.filter((m) => !placed.has(m.id));
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

    // Classify edges
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
  }, [phases, milestones, dependencies]);

  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-sm text-ink/60">
        No milestones to graph yet.
      </div>
    );
  }

  const invalidCount = layout.edges.filter((e) => e.backward || e.missingUpstream).length;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-qa-section="roadmap-dependency-graph"
      aria-label="Dependency graph"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Dependencies
          </div>
          <h2 className="font-display text-base text-ink">Milestone graph</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink/60">
          <LegendSwatch color="#3E68B2" label="ok" />
          <LegendSwatch color="#d97706" label="at risk" />
          <LegendSwatch color="#e11d48" label="blocked" />
          <LegendSwatch color="#7c3aed" label="critical path" dashed={false} />
          {invalidCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              {invalidCount} invalid
            </span>
          )}
        </div>
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

          {/* Edges first so nodes overlay */}
          {layout.edges.map((e, idx) => {
            const from = e.from;
            const to = e.to!;
            const stroke = e.backward || e.missingUpstream
              ? "#d97706"
              : e.d.status === "blocked"
                ? "#e11d48"
                : e.d.status === "at_risk"
                  ? "#d97706"
                  : "#94a3b8";
            const dash = e.backward || e.missingUpstream ? "4 3" : undefined;

            // If upstream missing, draw a stub from the left edge
            const x1 = from ? from.x + NODE_W : Math.max(0, to.x - 60);
            const y1 = from ? from.y + NODE_H / 2 : to.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const dx = Math.max(30, (x2 - x1) / 2);
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            return (
              <g key={`e-${idx}`}>
                <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash}>
                  <title>
                    {e.missingUpstream
                      ? `Unknown upstream ${e.d.from_id.slice(0, 8)} → ${to.id.slice(0, 8)}`
                      : e.backward
                        ? "Backward dependency across phases"
                        : e.d.reason ?? "dependency"}
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
              return (
                <g key={m.id}>
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={fill}
                    stroke={border}
                    strokeWidth={onCp ? 2 : 1}
                  />
                  <text
                    x={pos.x + 10}
                    y={pos.y + 14}
                    fontSize={11}
                    className="fill-ink"
                  >
                    {truncate(m.name, 24)}
                  </text>
                  <text
                    x={pos.x + 10}
                    y={pos.y + 27}
                    fontSize={10}
                    className="fill-ink/50"
                  >
                    {m.due_date ? new Date(m.due_date).toLocaleDateString() : "no date"}
                    {onCp ? " · CP" : ""}
                  </text>
                  <title>
                    {m.name}
                    {onCp ? " — on critical path" : ""}
                    {m.blocked_by.length > 0 ? ` — blocked by ${m.blocked_by.length}` : ""}
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

function LegendSwatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
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
