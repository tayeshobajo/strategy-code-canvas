import { Link } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import { ArrowLeft, Maximize2, Minus, Plus, RotateCcw, RotateCw, Filter, GitBranch, Share2, MoreHorizontal, Save, CheckCircle2, Clock } from "lucide-react";

export function StudioTopBar({
  projectId,
  versionLabel,
  versionStatus,
  autosaveHint,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  projectId: string;
  versionLabel: string;
  versionStatus: string;
  autosaveHint: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const rf = useReactFlow();
  return (
    <header className="flex h-[64px] shrink-0 items-center gap-3 border-b border-rule bg-white px-4">
      <Link
        to="/engine/projects/$projectId/roadmap"
        params={{ projectId }}
        className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-white px-2.5 py-1.5 text-xs text-ink hover:border-ink/40"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Project Spine
      </Link>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-display text-lg leading-none text-ink">Roadmap Studio</h1>
          <span className="rounded-sm border border-rule bg-paper-soft px-1.5 py-0.5 text-[10px] font-medium text-ink/70">
            {versionLabel} — {versionStatus === "approved" ? "Approved" : "AI Draft"}
          </span>
        </div>
        <div className="text-[11px] text-ink/55">Design, explore and refine the journey from Point A to Point B.</div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ViewSwitcher />
        <ToolbarBtn onClick={() => rf.fitView({ duration: 300, padding: 0.2 })} label="Fit to view">
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ZoomControls />
        <div className="mx-1 h-5 w-px bg-rule" />
        <ToolbarBtn onClick={onUndo} disabled={!canUndo} label="Undo">
          <RotateCcw className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={onRedo} disabled={!canRedo} label="Redo">
          <RotateCw className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="mx-1 h-5 w-px bg-rule" />
        <ToolbarBtn label="Filters"><Filter className="h-3.5 w-3.5" /> <span className="text-[11px]">Filters</span></ToolbarBtn>
        <ToolbarBtn label="Compare"><GitBranch className="h-3.5 w-3.5" /> <span className="text-[11px]">Compare</span></ToolbarBtn>
        <ToolbarBtn label="Share"><Share2 className="h-3.5 w-3.5" /> <span className="text-[11px]">Share</span></ToolbarBtn>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/90"
          title="Persistence unlocks once the Studio canvas migration is applied"
        >
          <Save className="h-3.5 w-3.5" /> Save Draft
        </button>
        <div className="mx-1 h-5 w-px bg-rule" />
        <div className="flex items-center gap-1 text-[11px] text-emerald-700" title={autosaveHint}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Draft
        </div>
        <div className="flex items-center gap-1 text-[11px] text-ink/55" title={autosaveHint}>
          <Clock className="h-3 w-3" /> {autosaveHint}
        </div>
        <ToolbarBtn label="More"><MoreHorizontal className="h-3.5 w-3.5" /></ToolbarBtn>
      </div>
    </header>
  );
}

function ViewSwitcher() {
  return (
    <div className="inline-flex items-center rounded-md border border-rule bg-white text-[11px]">
      {["Journey", "Timeline", "Systems", "Client"].map((v, i) => (
        <button
          key={v}
          type="button"
          disabled={i !== 0}
          className={`px-2 py-1.5 ${i === 0 ? "rounded-l-md bg-ink text-white" : "text-ink/50"}`}
          title={i === 0 ? "Journey view (current)" : `${v} view — coming next sprint`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ZoomControls() {
  const rf = useReactFlow();
  const zoom = Math.round((rf.getZoom?.() ?? 1) * 100);
  return (
    <div className="inline-flex items-center rounded-md border border-rule bg-white">
      <button className="px-1.5 py-1.5 text-ink/70 hover:text-ink" onClick={() => rf.zoomOut({ duration: 150 })} aria-label="Zoom out">
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[36px] text-center text-[11px] tabular-nums text-ink/70">{zoom}%</span>
      <button className="px-1.5 py-1.5 text-ink/70 hover:text-ink" onClick={() => rf.zoomIn({ duration: 150 })} aria-label="Zoom in">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-rule bg-white px-2 py-1.5 text-ink hover:border-ink/40 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
