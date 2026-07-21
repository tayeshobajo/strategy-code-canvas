import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
  type OnConnect,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

import type { RoadmapView } from "@/lib/roadmap-view";
import { STUDIO_LAYOUT, computeStudioLayout, phasePalette } from "@/lib/roadmap-studio-layout";
import { STUDIO_NODE_TYPES } from "./nodes";
import { StudioTopBar } from "./StudioTopBar";
import { StudioInspector, type StudioSelection } from "./StudioInspector";
import { BottomOverviewStrip } from "./BottomOverviewStrip";

type Props = {
  projectId: string;
  view: RoadmapView;
};

export function RoadmapStudioShell(props: Props) {
  return (
    <ReactFlowProvider>
      <StudioInner {...props} />
    </ReactFlowProvider>
  );
}

function StudioInner({ projectId, view }: Props) {
  const layout = useMemo(() => computeStudioLayout(view.phases, view.milestones), [view.phases, view.milestones]);

  const pointA = view.point_a ?? { title: "Current Reality", description: null };
  const pointB = view.point_b ?? { title: "Desired Future", description: null };

  // Build initial nodes
  const initialNodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    out.push({
      id: layout.pointAId,
      type: "pointA",
      position: layout.positions[layout.pointAId],
      draggable: true,
      selectable: true,
      data: { kind: "A", label: pointA.title, detail: pointA.description },
    });
    out.push({
      id: layout.pointBId,
      type: "pointB",
      position: layout.positions[layout.pointBId],
      draggable: true,
      selectable: true,
      data: { kind: "B", label: pointB.title, detail: pointB.description },
    });
    view.phases.forEach((phase, idx) => {
      out.push({
        id: `phase:${phase.key}`,
        type: "phaseHeader",
        position: layout.positions[`phase:${phase.key}`],
        draggable: false,
        selectable: true,
        data: {
          index: idx,
          order: idx + 1,
          name: phase.name,
          outcome: phase.outcome,
          count: phase.milestone_count,
        },
      });
      phase.milestone_ids.forEach((mid, mi) => {
        const m = view.milestones.find((x) => x.id === mid);
        if (!m) return;
        out.push({
          id: m.id,
          type: "milestone",
          position: layout.positions[mid],
          draggable: true,
          selectable: true,
          data: {
            index: `${idx + 1}.${mi + 1}`,
            name: m.name,
            outcome: m.outcome,
            status: m.status,
            owner: m.owner,
            hasDeps: m.blocked_by.length > 0,
            onCriticalPath: m.on_critical_path,
            phaseIndex: idx,
            isCurrent: view.critical_path.bottleneck_id === m.id,
          },
        });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build initial edges: Point A → first milestone of first phase, phase→next phase (via last→first), last milestone → Point B, plus dependency edges.
  const initialEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];
    // Sequence edges through the journey
    let prev: { id: string; phaseIndex: number } | null = { id: layout.pointAId, phaseIndex: -1 };
    view.phases.forEach((phase, pi) => {
      const palette = phasePalette(pi);
      const ids = layout.milestonesByPhase[phase.key] ?? [];
      ids.forEach((mid) => {
        if (prev) {
          edges.push({
            id: `seq:${prev.id}->${mid}`,
            source: prev.id,
            target: mid,
            type: "smoothstep",
            animated: false,
            style: { stroke: palette.edge, strokeWidth: 1.5 },
          });
        }
        prev = { id: mid, phaseIndex: pi };
      });
    });
    if (prev) {
      edges.push({
        id: `seq:${prev.id}->${layout.pointBId}`,
        source: prev.id,
        target: layout.pointBId,
        type: "smoothstep",
        style: { stroke: "oklch(0.13 0.05 265)", strokeWidth: 1.5 },
      });
    }
    // Dependency edges — dashed
    for (const dep of view.dependencies) {
      const targetM = view.milestones.find((m) => m.id === dep.to_id);
      const pi = view.phases.findIndex((p) => p.milestone_ids.includes(dep.to_id));
      const palette = phasePalette(Math.max(0, pi));
      const stroke =
        dep.status === "blocked" ? "oklch(0.60 0.20 20)" :
        dep.status === "at_risk" ? "oklch(0.65 0.14 60)" :
        palette.edge;
      edges.push({
        id: `dep:${dep.id}`,
        source: dep.from_id,
        target: dep.to_id,
        type: "smoothstep",
        style: { stroke, strokeWidth: 1.25, strokeDasharray: "4 3" },
        data: { kind: "dependency" },
      });
    }
    return edges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selection, setSelection] = useState<StudioSelection>({ kind: "none" });
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);

  // undo/redo — snapshot ring buffer of nodes+edges JSON
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, forceRerender] = useState(0);
  const snapshot = useCallback(() => {
    past.current.push(JSON.stringify({ nodes, edges }));
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    forceRerender((n) => n + 1);
  }, [nodes, edges]);

  const applySnapshot = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
    } catch { /* ignore */ }
  }, [setNodes, setEdges]);

  const handleUndo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(JSON.stringify({ nodes, edges }));
    applySnapshot(prev);
    forceRerender((n) => n + 1);
  }, [nodes, edges, applySnapshot]);

  const handleRedo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(JSON.stringify({ nodes, edges }));
    applySnapshot(next);
    forceRerender((n) => n + 1);
  }, [nodes, edges, applySnapshot]);

  // Track drag start to snapshot before positions change.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const dragStart = changes.some(
        (c) => c.type === "position" && "dragging" in c && c.dragging === true && !past.current.length
      );
      if (dragStart) snapshot();
      // Detect drag end -> if cross-phase, warn (in-memory only)
      const dragEnd = changes.find(
        (c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && "dragging" in c && c.dragging === false
      );
      onNodesChange(changes);
      if (dragEnd) {
        const node = nodes.find((n) => n.id === dragEnd.id);
        if (node && node.type === "milestone") {
          const phaseIndex = (node.data as { phaseIndex: number }).phaseIndex;
          const px = dragEnd.position?.x ?? node.position.x;
          const dropCol = Math.round((px - STUDIO_LAYOUT.originX - STUDIO_LAYOUT.pointW - STUDIO_LAYOUT.colGapX) / STUDIO_LAYOUT.colW);
          if (dropCol !== phaseIndex && dropCol >= 0 && dropCol < view.phases.length) {
            toast.warning(
              `Move flagged material — cross-phase drop will create a draft amendment once the Studio canvas migration is applied. Position kept locally for now.`,
              { duration: 4500 }
            );
          }
        }
      }
    },
    [nodes, snapshot, onNodesChange, view.phases.length]
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      snapshot();
      setEdges((eds) => addEdge({ ...conn, type: "smoothstep", style: { stroke: "var(--ink)", strokeWidth: 1.5, strokeDasharray: "4 3" } }, eds));
      toast.info("Dependency edge added locally. Persistence unlocks after the Studio canvas migration.", { duration: 4000 });
    },
    [setEdges, snapshot]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: Node[] }) => {
      const n = selNodes[0];
      if (!n) { setSelection({ kind: "none" }); return; }
      if (n.type === "milestone") {
        const m = view.milestones.find((x) => x.id === n.id);
        if (!m) return;
        const phaseIndex = view.phases.findIndex((p) => p.milestone_ids.includes(m.id));
        const phase = phaseIndex >= 0 ? view.phases[phaseIndex] : null;
        const idxInPhase = phase ? (phase.milestone_ids.indexOf(m.id) + 1) : 1;
        const unlocks = view.milestones.filter((x) => x.blocked_by.includes(m.id));
        setSelection({
          kind: "milestone", milestone: m, phase, phaseIndex,
          index: `${(phaseIndex + 1) || 1}.${idxInPhase}`, unlocks,
        });
      } else if (n.type === "phaseHeader") {
        const key = n.id.replace(/^phase:/, "");
        const idx = view.phases.findIndex((p) => p.key === key);
        if (idx < 0) return;
        const phase = view.phases[idx];
        const ms = view.milestones.filter((m) => phase.milestone_ids.includes(m.id));
        setSelection({ kind: "phase", phase, index: idx, milestones: ms });
      } else if (n.type === "pointA") {
        setSelection({ kind: "point", which: "A", label: pointA.title, detail: pointA.description });
      } else if (n.type === "pointB") {
        setSelection({ kind: "point", which: "B", label: pointB.title, detail: pointB.description });
      }
    },
    [view, pointA, pointB]
  );

  const selectedId =
    selection.kind === "milestone" ? selection.milestone.id :
    selection.kind === "phase" ? `phase:${selection.phase.key}` :
    selection.kind === "point" ? (selection.which === "A" ? "point-a" : "point-b") :
    null;

  const focusById = useCallback((id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    onSelectionChange({ nodes: nodes.filter((n) => n.id === id) });
  }, [nodes, setNodes, onSelectionChange]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-paper">
      <StudioTopBar
        projectId={projectId}
        versionLabel={view.version?.label ?? "v0.1"}
        versionStatus={view.version?.status ?? "draft"}
        autosaveHint="Local only"
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={past.current.length > 0}
        canRedo={future.current.length > 0}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={STUDIO_NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: 0.4, maxZoom: 1.2 }}
            minZoom={0.25}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep" }}
            className="!bg-paper-soft"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(0.85 0.01 260)" />
            <Controls showInteractive={false} className="!border-rule !bg-white" />
          </ReactFlow>
        </div>
        <StudioInspector
          projectId={projectId}
          selection={selection}
          onClose={() => setSelection({ kind: "none" })}
          collapsed={rightCollapsed}
          onToggle={() => setRightCollapsed((v) => !v)}
        />
      </div>
      {stripCollapsed ? (
        <button
          type="button"
          onClick={() => setStripCollapsed(false)}
          className="h-6 shrink-0 border-t border-rule bg-white text-[10px] font-mono uppercase tracking-[0.2em] text-ink/55 hover:text-ink"
          title="Show journey overview"
        >
          Show journey ▲
        </button>
      ) : (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setStripCollapsed(true)}
            className="absolute right-2 top-1 z-10 rounded p-1 text-[10px] text-ink/50 hover:text-ink"
            title="Hide journey overview"
            aria-label="Hide journey overview"
          >
            ▼
          </button>
          <BottomOverviewStrip
            phases={view.phases}
            milestones={view.milestones}
            selectedId={selectedId}
            onSelect={focusById}
            pointALabel={pointA.title}
            pointBLabel={pointB.title}
          />
        </div>
      )}
    </div>
  );
}
