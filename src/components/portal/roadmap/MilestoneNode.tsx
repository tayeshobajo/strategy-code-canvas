import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  GitBranch,
  FileText,
  CalendarClock,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  MilestoneKind,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  milestone: RoadmapMilestone;
  x: number;
  y: number;
  onOpen: () => void;
  isSelected: boolean;
};

const STATUS_STYLES: Record<
  RoadmapMilestone["status"],
  { ring: string; label: string; icon: typeof Circle }
> = {
  completed: {
    ring: "bg-royal text-white border-royal",
    label: "Completed",
    icon: CheckCircle2,
  },
  in_progress: {
    ring: "bg-white text-royal border-royal shadow-[0_0_0_6px_color-mix(in_oklch,var(--royal)_18%,transparent)]",
    label: "In progress",
    icon: Loader2,
  },
  upcoming: {
    ring: "bg-white text-ink/60 border-ink/25",
    label: "Upcoming",
    icon: Circle,
  },
  blocked: {
    ring: "bg-white text-[#a4283c] border-[#a4283c]",
    label: "Blocked",
    icon: AlertTriangle,
  },
  optional: {
    ring: "bg-white/70 text-ink/40 border-dashed border-ink/25",
    label: "Optional",
    icon: Circle,
  },
};

const KIND_ICON: Record<MilestoneKind, typeof Circle> = {
  milestone: Circle,
  decision: GitBranch,
  deliverable: FileText,
  meeting: CalendarClock,
};

const KIND_LABEL: Record<MilestoneKind, string> = {
  milestone: "Milestone",
  decision: "Decision",
  deliverable: "Deliverable",
  meeting: "Meeting",
};

function truncate(input: string, max = 140): string {
  if (input.length <= max) return input;
  return input.slice(0, max - 1).trimEnd() + "…";
}

export function MilestoneNode({
  milestone,
  x,
  y,
  onOpen,
  isSelected,
}: Props) {
  const s = STATUS_STYLES[milestone.status];
  // Use kind icon when non-milestone, otherwise status icon.
  const Icon = milestone.kind === "milestone" ? s.icon : KIND_ICON[milestone.kind];
  const btnRef = useRef<HTMLButtonElement>(null);
  const canvas = useRoadmapCanvas();

  useEffect(() => {
    canvas.registerNode(milestone.slug, btnRef.current);
    return () => canvas.registerNode(milestone.slug, null);
  }, [canvas, milestone.slug]);

  const dateLabel =
    milestone.targetDate ?? milestone.dueDate ?? milestone.meetingAt ?? milestone.publishedAt;
  const dateStr = dateLabel
    ? new Date(dateLabel).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={btnRef}
            type="button"
            data-milestone-node
            data-marker-slug={milestone.slug}
            aria-label={`${KIND_LABEL[milestone.kind]}: ${milestone.title} — ${s.label}. ${milestone.summary ?? ""}`.trim()}
            aria-pressed={isSelected}
            onClick={onOpen}
            onMouseEnter={() => canvas.setHighlightedSlug(milestone.slug)}
            onMouseLeave={() => {
              if (canvas.highlightedSlug === milestone.slug)
                canvas.setHighlightedSlug(null);
            }}
            onFocus={() => canvas.setHighlightedSlug(milestone.slug)}
            onBlur={() => {
              if (canvas.highlightedSlug === milestone.slug)
                canvas.setHighlightedSlug(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }}
            className={`group relative flex items-center justify-center h-10 w-10 rounded-full border-2 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--royal)_60%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-paper-soft ${s.ring} ${
              isSelected
                ? "ring-2 ring-royal ring-offset-2 ring-offset-paper-soft"
                : ""
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`w-4 h-4 ${milestone.status === "in_progress" && milestone.kind === "milestone" ? "animate-spin" : ""}`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          role="tooltip"
          className="max-w-[260px] text-left"
        >
          <div className="font-medium">{milestone.title}</div>
          <div className="opacity-80 mt-0.5 capitalize text-[11px]">
            {KIND_LABEL[milestone.kind]} · Phase {milestone.phase} · {s.label}
          </div>
          {milestone.summary && (
            <div className="opacity-80 mt-1.5 text-[12px] leading-snug">
              {truncate(milestone.summary)}
            </div>
          )}
          {dateStr && (
            <div className="opacity-70 mt-1 text-[11px]">Target: {dateStr}</div>
          )}
          <div className="mt-1.5 text-[11px] opacity-70">View details →</div>
        </TooltipContent>
      </Tooltip>
      <div
        className="mt-2 text-center whitespace-nowrap max-w-[180px] mx-auto"
        style={{ transform: "translateX(-50%)", marginLeft: "50%" }}
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/60">
          {KIND_LABEL[milestone.kind]}
        </div>
        <div className="text-[13px] font-medium text-white leading-tight whitespace-normal max-w-[160px] mx-auto">
          {milestone.title}
        </div>
      </div>
    </div>
  );
}
