import { MiniMap } from "@xyflow/react";
import { Square, Circle, Diamond, GitBranch, StickyNote, Layers, Users, Milestone, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const PRIMITIVES = [
  { icon: Milestone, label: "Milestone" },
  { icon: Square, label: "Phase" },
  { icon: Diamond, label: "Decision" },
  { icon: Circle, label: "Outcome" },
  { icon: GitBranch, label: "Connection" },
  { icon: StickyNote, label: "Note" },
  { icon: Layers, label: "Group" },
  { icon: Users, label: "Child Project" },
] as const;

const TEMPLATES = [
  "Linear Journey",
  "Parallel Workstreams",
  "Parent + Child Projects",
  "Product Launch",
  "Website Transformation",
] as const;

export function StudioLeftRail() {
  const [tplOpen, setTplOpen] = useState(true);
  return (
    <aside
      className="flex h-full w-[220px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper-soft"
      aria-label="Studio components"
    >
      <div className="px-4 pt-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">
          Add to canvas
        </div>
        <div className="space-y-1">
          {PRIMITIVES.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              disabled
              className="flex w-full items-center gap-2 rounded-sm border border-rule bg-white px-2 py-1.5 text-left text-[12px] text-ink/70 opacity-60"
              title="Available after canvas migration is applied"
            >
              <span className="grid h-5 w-5 place-items-center rounded-sm border border-rule bg-paper-soft">
                <Icon className="h-3 w-3" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 px-4">
        <button
          type="button"
          onClick={() => setTplOpen((v) => !v)}
          className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45"
        >
          Templates {tplOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {tplOpen && (
          <div className="mt-2 space-y-1">
            {TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                disabled
                className="w-full rounded-sm border border-rule bg-white px-2 py-1.5 text-left text-[12px] text-ink/70 opacity-60"
                title="Templates seed structure; enabled after canvas migration"
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              disabled
              className="w-full rounded-sm bg-transparent px-2 py-1 text-left text-[11px] text-ink/40"
            >
              View all templates
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 px-4 pb-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">Overview</div>
        <div className="rounded-md border border-rule bg-white p-1">
          <MiniMap
            pannable
            zoomable
            className="!bg-paper-soft"
            style={{ width: "100%", height: 120 }}
            nodeColor={() => "oklch(0.85 0.03 260)"}
            nodeStrokeColor={() => "oklch(0.55 0.14 245)"}
            maskColor="oklch(0.13 0.05 265 / 0.06)"
          />
        </div>
      </div>
    </aside>
  );
}
