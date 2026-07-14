// Phase 5D — visual family dependency graph.
// Pure component. Takes the existing family + impact payloads and renders a
// layered SVG DAG where the operator can preview the ripple of a reparent
// (moved subtree recolored, dashed edge to candidate parent) or a completion
// (ancestors whose rollups would recompute, descendants blocking completion).

import { useMemo, useState } from "react";
import type { FamilyNode } from "@/lib/engine-project-family.server";
import type { FamilyBlocker } from "@/lib/engine-project-impact.functions";

type Mode = { kind: "idle" }
  | { kind: "reparent"; movedId: string; candidateParentId: string | null }
  | { kind: "complete"; targetId: string };

const COL_W = 200;
const ROW_H = 68;
const NODE_W = 168;
const NODE_H = 44;
const PAD_X = 24;
const PAD_Y = 24;

const STATUS_FILL: Record<string, string> = {
  approved: "#E7F1E9",
  completed: "#E7F1E9",
  planning: "#F2EDE4",
  blocked: "#F9E3E4",
};
const STATUS_STROKE: Record<string, string> = {
  approved: "#2E8B57",
  completed: "#2E8B57",
  planning: "#B8B0A2",
  blocked: "#a4283c",
};

export function FamilyDependencyGraph({
  nodes,
  blockers,
  currentProjectId,
  onOpenNode,
}: {
  nodes: FamilyNode[];
  blockers: FamilyBlocker[];
  currentProjectId: string;
  onOpenNode?: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, FamilyNode[]>();
    for (const n of nodes) {
      const arr = m.get(n.parent_project_id) ?? [];
      arr.push(n);
      m.set(n.parent_project_id, arr);
    }
    return m;
  }, [nodes]);

  // Compute row positions with a DFS so siblings stack vertically under
  // their parent (readable dendrogram, not a raw grid).
  const positions = useMemo(() => {
    const pos = new Map<string, { row: number; col: number }>();
    let row = 0;
    const rootIds = (childrenByParent.get(null) ?? []).map((n) => n.id);
    const visit = (id: string) => {
      const n = byId.get(id);
      if (!n) return;
      pos.set(id, { row, col: n.depth });
      row += 1;
      for (const c of childrenByParent.get(id) ?? []) visit(c.id);
    };
    for (const rid of rootIds) visit(rid);
    return pos;
  }, [byId, childrenByParent]);

  // Subtree ids helper (BFS).
  const subtree = (rootId: string): Set<string> => {
    const out = new Set<string>([rootId]);
    const q = [rootId];
    while (q.length) {
      const cur = q.shift()!;
      for (const c of childrenByParent.get(cur) ?? []) {
        if (!out.has(c.id)) { out.add(c.id); q.push(c.id); }
      }
    }
    return out;
  };
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>();
    let cur: string | null | undefined = id;
    while (cur) {
      const n = byId.get(cur);
      if (!n) break;
      if (cur !== id) out.add(cur);
      cur = n.parent_project_id;
    }
    return out;
  };

  const highlighted = useMemo(() => {
    if (mode.kind === "reparent") return subtree(mode.movedId);
    if (mode.kind === "complete") {
      const s = new Set<string>();
      // ancestors affected by rollup recompute
      for (const a of ancestors(mode.targetId)) s.add(a);
      // descendants that would block completion
      for (const b of blockers) {
        if (b.parentId === mode.targetId) s.add(b.childId);
      }
      s.add(mode.targetId);
      return s;
    }
    return new Set<string>();
  }, [mode, blockers, byId, childrenByParent]);

  const willChangeList = useMemo(() => {
    if (mode.kind === "reparent") {
      const s = subtree(mode.movedId);
      const list = [...s].map((id) => byId.get(id)!).filter(Boolean);
      const from = byId.get(mode.movedId)?.parent_project_id ?? null;
      const to = mode.candidateParentId;
      const extras: FamilyNode[] = [];
      if (from) { const n = byId.get(from); if (n) extras.push(n); }
      if (to) { const n = byId.get(to); if (n) extras.push(n); }
      return { moved: list, ripple: extras };
    }
    if (mode.kind === "complete") {
      const a = [...ancestors(mode.targetId)].map((id) => byId.get(id)!).filter(Boolean);
      const blocking = blockers
        .filter((b) => b.parentId === mode.targetId)
        .map((b) => byId.get(b.childId)!)
        .filter(Boolean);
      return { moved: [], ripple: a, blocking };
    }
    return null;
  }, [mode, blockers, byId]);

  const totalRows = positions.size;
  const maxCol = Math.max(0, ...[...positions.values()].map((p) => p.col));
  const width = PAD_X * 2 + (maxCol + 1) * COL_W;
  const height = PAD_Y * 2 + Math.max(1, totalRows) * ROW_H;

  const nodeCenter = (id: string) => {
    const p = positions.get(id);
    if (!p) return null;
    return {
      x: PAD_X + p.col * COL_W + NODE_W / 2,
      y: PAD_Y + p.row * ROW_H + NODE_H / 2,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Impact preview
        </span>
        <button
          type="button"
          className={`rounded-md border px-2 py-1 ${mode.kind === "idle" ? "border-[#0A0F1F] bg-[#0A0F1F] text-white" : "border-[#E8E1D6] bg-white"}`}
          onClick={() => setMode({ kind: "idle" })}
        >
          None
        </button>
        <label className="inline-flex items-center gap-1 rounded-md border border-[#E8E1D6] bg-white px-2 py-1">
          <span className="text-[#667085]">Reparent</span>
          <select
            className="bg-transparent text-[#0A0F1F] outline-none"
            value={mode.kind === "reparent" ? mode.movedId : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) setMode({ kind: "idle" });
              else setMode({ kind: "reparent", movedId: v, candidateParentId: null });
            }}
          >
            <option value="">— pick node —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{"  ".repeat(n.depth)}{n.name}</option>
            ))}
          </select>
          {mode.kind === "reparent" && (
            <>
              <span className="text-[#667085]">→</span>
              <select
                className="bg-transparent text-[#0A0F1F] outline-none"
                value={mode.candidateParentId ?? ""}
                onChange={(e) => setMode({ ...mode, candidateParentId: e.target.value || null })}
              >
                <option value="">(root)</option>
                {nodes
                  .filter((n) => n.id !== mode.movedId && !subtree(mode.movedId).has(n.id))
                  .map((n) => (
                    <option key={n.id} value={n.id}>{"  ".repeat(n.depth)}{n.name}</option>
                  ))}
              </select>
            </>
          )}
        </label>
        <label className="inline-flex items-center gap-1 rounded-md border border-[#E8E1D6] bg-white px-2 py-1">
          <span className="text-[#667085]">Complete</span>
          <select
            className="bg-transparent text-[#0A0F1F] outline-none"
            value={mode.kind === "complete" ? mode.targetId : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) setMode({ kind: "idle" });
              else setMode({ kind: "complete", targetId: v });
            }}
          >
            <option value="">— pick node —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{"  ".repeat(n.depth)}{n.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-auto rounded-lg border border-[#F2EDE4] bg-[#FBF9F4]">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Family dependency graph"
        >
          {/* Edges */}
          {nodes.map((n) => {
            if (!n.parent_project_id) return null;
            const from = nodeCenter(n.parent_project_id);
            const to = nodeCenter(n.id);
            if (!from || !to) return null;
            const isMovedFromEdge =
              mode.kind === "reparent" && n.id === mode.movedId;
            const stroke = isMovedFromEdge ? "#B8B0A2" : "#D6CFC0";
            const dash = isMovedFromEdge ? "4 4" : undefined;
            return (
              <path
                key={`e-${n.id}`}
                d={`M ${from.x + NODE_W / 2 - 4} ${from.y} C ${from.x + NODE_W / 2 + 40} ${from.y}, ${to.x - NODE_W / 2 - 40} ${to.y}, ${to.x - NODE_W / 2 + 4} ${to.y}`}
                stroke={stroke}
                strokeDasharray={dash}
                strokeWidth={1.5}
                fill="none"
              />
            );
          })}
          {/* Candidate reparent dashed edge */}
          {mode.kind === "reparent" && (() => {
            const to = nodeCenter(mode.movedId);
            const from = mode.candidateParentId ? nodeCenter(mode.candidateParentId) : null;
            if (!to || !from) return null;
            return (
              <path
                d={`M ${from.x + NODE_W / 2 - 4} ${from.y} C ${from.x + NODE_W / 2 + 40} ${from.y}, ${to.x - NODE_W / 2 - 40} ${to.y}, ${to.x - NODE_W / 2 + 4} ${to.y}`}
                stroke="#3E68B2"
                strokeDasharray="6 4"
                strokeWidth={2}
                fill="none"
              />
            );
          })()}

          {/* Nodes */}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const x = PAD_X + p.col * COL_W;
            const y = PAD_Y + p.row * ROW_H;
            const isCurrent = n.id === currentProjectId;
            const inHighlight = highlighted.has(n.id);
            const isMoved =
              mode.kind === "reparent" && subtree(mode.movedId).has(n.id);
            const isBlocking =
              mode.kind === "complete" &&
              blockers.some((b) => b.parentId === mode.targetId && b.childId === n.id);
            const fill = isMoved
              ? "#FDEEDA"
              : isBlocking
              ? "#F9E3E4"
              : inHighlight
              ? "#EEF3FB"
              : STATUS_FILL[n.status] ?? "#F2EDE4";
            const stroke = isCurrent
              ? "#3E68B2"
              : isMoved
              ? "#C88B3A"
              : isBlocking
              ? "#a4283c"
              : STATUS_STROKE[n.status] ?? "#B8B0A2";
            return (
              <g
                key={n.id}
                transform={`translate(${x} ${y})`}
                style={{ cursor: onOpenNode ? "pointer" : "default" }}
                onClick={() => onOpenNode?.(n.id)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCurrent ? 2 : 1}
                />
                <text
                  x={10}
                  y={18}
                  fontSize={12}
                  fontWeight={600}
                  fill="#0A0F1F"
                  style={{ pointerEvents: "none" }}
                >
                  {truncate(n.name, 22)}
                </text>
                <text
                  x={10}
                  y={34}
                  fontSize={10}
                  fill="#667085"
                  style={{ pointerEvents: "none" }}
                >
                  {n.status}
                  {n.child_count > 0
                    ? ` · ${n.completed_child_count}/${n.child_count} done`
                    : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {willChangeList && (
        <div className="rounded-md border border-[#F2EDE4] bg-white px-3 py-2 text-xs">
          {mode.kind === "reparent" && (
            <>
              <div className="font-medium text-[#0A0F1F]">
                Moving {willChangeList.moved.length} project
                {willChangeList.moved.length === 1 ? "" : "s"} (subtree)
              </div>
              <div className="mt-1 text-[#667085]">
                {willChangeList.moved.map((n) => n.name).join(", ")}
              </div>
              {willChangeList.ripple.length > 0 && (
                <div className="mt-2 text-[#667085]">
                  Rollups recompute on:{" "}
                  <span className="text-[#0A0F1F]">
                    {willChangeList.ripple.map((n) => n.name).join(", ")}
                  </span>
                </div>
              )}
            </>
          )}
          {mode.kind === "complete" && (
            <>
              <div className="font-medium text-[#0A0F1F]">
                Completing this node affects{" "}
                {willChangeList.ripple.length} ancestor
                {willChangeList.ripple.length === 1 ? "" : "s"}
              </div>
              {willChangeList.ripple.length > 0 && (
                <div className="mt-1 text-[#667085]">
                  Ancestors: {willChangeList.ripple.map((n) => n.name).join(", ")}
                </div>
              )}
              {(willChangeList.blocking ?? []).length > 0 && (
                <div className="mt-2 text-[#a4283c]">
                  Blocked by:{" "}
                  {(willChangeList.blocking ?? []).map((n) => n.name).join(", ")}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
