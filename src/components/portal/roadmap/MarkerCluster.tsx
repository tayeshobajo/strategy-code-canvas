import { useState } from "react";
import type { MarkerCluster } from "./roadmap-layout";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Layers, ChevronRight, Maximize2 } from "lucide-react";
import type { RoadmapMilestone } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";

const PHASE_TITLE: Record<string, string> = {
  now: "Phase 1 · Foundation",
  next: "Phase 2 · Core Platform Build",
  later: "Phase 3 · Scale Systems",
};

type Props = {
  cluster: MarkerCluster;
  x: number;
  y: number;
  onOpenMember: (slug: string) => void;
};

export function MarkerClusterChip({ cluster, x, y, onOpenMember }: Props) {
  const [open, setOpen] = useState(false);
  const title = PHASE_TITLE[cluster.phase] ?? `Phase ${cluster.phase}`;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 14 }}
      data-marker-cluster={cluster.key}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-no-drag
            aria-label={`${title} cluster: ${cluster.total} items`}
            className="group flex items-center gap-2 rounded-full border border-white/25 bg-slate-950/85 text-white pl-1.5 pr-3 py-1.5 backdrop-blur-sm shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] hover:bg-slate-900/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal"
          >
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-white/15">
              <Layers className="w-3.5 h-3.5" />
            </span>
            <span className="flex flex-col items-start leading-tight text-left">
              <span className="text-[11.5px] font-semibold whitespace-nowrap">
                {title}
              </span>
              <span className="text-[10px] text-white/65 whitespace-nowrap">
                {cluster.total} items · {cluster.completed} done · {cluster.inProgress} in progress
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="w-72 p-0 bg-slate-950/95 border-white/20 text-white"
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">
              {title}
            </div>
            <div className="text-[12px] text-white/85 mt-0.5">
              {cluster.total} items · {cluster.decisions} decision
              {cluster.decisions === 1 ? "" : "s"} · {cluster.deadlines} deadline
              {cluster.deadlines === 1 ? "" : "s"}
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {cluster.members.map(({ milestone }) => (
              <li key={milestone.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenMember(milestone.slug);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 text-[12.5px]"
                >
                  <StatusDot m={milestone} />
                  <span className="flex-1 min-w-0 truncate">{milestone.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatusDot({ m }: { m: RoadmapMilestone }) {
  const color =
    m.status === "completed"
      ? "bg-emerald-400"
      : m.status === "in_progress"
        ? "bg-royal"
        : m.status === "blocked"
          ? "bg-rose-500"
          : "bg-white/40";
  return <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />;
}
