import { CheckCircle2, Circle, AlertTriangle, Loader2 } from "lucide-react";
import type { RoadmapMilestone } from "@/lib/portal-roadmap-model";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  milestone: RoadmapMilestone;
  x: number;
  y: number;
  onOpen: () => void;
  isSelected: boolean;
};

const STATUS_STYLES: Record<
  RoadmapMilestone["status"],
  { ring: string; dot: string; label: string; icon: typeof Circle }
> = {
  completed: {
    ring: "bg-royal text-white border-royal",
    dot: "bg-royal",
    label: "Completed",
    icon: CheckCircle2,
  },
  in_progress: {
    ring: "bg-white text-royal border-royal shadow-[0_0_0_6px_color-mix(in_oklch,var(--royal)_18%,transparent)]",
    dot: "bg-royal animate-pulse",
    label: "In progress",
    icon: Loader2,
  },
  upcoming: {
    ring: "bg-white text-ink/60 border-ink/25",
    dot: "bg-ink/30",
    label: "Upcoming",
    icon: Circle,
  },
  blocked: {
    ring: "bg-white text-[#a4283c] border-[#a4283c]",
    dot: "bg-[#a4283c]",
    label: "Blocked",
    icon: AlertTriangle,
  },
  optional: {
    ring: "bg-white/70 text-ink/40 border-dashed border-ink/25",
    dot: "bg-ink/20",
    label: "Optional",
    icon: Circle,
  },
};

export function MilestoneNode({ milestone, x, y, onOpen, isSelected }: Props) {
  const s = STATUS_STYLES[milestone.status];
  const Icon = s.icon;
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${milestone.title} — ${s.label}`}
            onClick={onOpen}
            className={`group relative flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-paper-soft ${s.ring} ${
              isSelected ? "scale-110 ring-2 ring-royal ring-offset-2 ring-offset-paper-soft" : ""
            }`}
          >
            <Icon
              className={`w-4 h-4 ${milestone.status === "in_progress" ? "animate-spin" : ""}`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-left">
          <div className="font-medium">{milestone.title}</div>
          <div className="opacity-80 mt-0.5 capitalize">
            {milestone.phase} · {s.label}
          </div>
          {milestone.summary && (
            <div className="opacity-80 mt-1 line-clamp-3">
              {milestone.summary}
            </div>
          )}
          <div className="mt-1 opacity-70">Click to view details</div>
        </TooltipContent>
      </Tooltip>
      <div
        className="mt-2 text-center whitespace-nowrap max-w-[180px] mx-auto"
        style={{ transform: "translateX(-50%)", marginLeft: "50%" }}
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/60">
          {milestone.phase}
        </div>
        <div className="text-[13px] font-medium text-white leading-tight whitespace-normal max-w-[160px] mx-auto">
          {milestone.title}
        </div>
      </div>
    </div>
  );
}
