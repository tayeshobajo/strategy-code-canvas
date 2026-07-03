import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  GitBranch,
  FileText,
  CalendarClock,
  Flag,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  MilestoneKind,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  milestone: RoadmapMilestone;
  /** absolute px position within the map canvas */
  x: number;
  y: number;
  onOpen: () => void;
  isSelected: boolean;
  dimmed?: boolean;
  /** true when another marker is selected — softens this node slightly */
  mutedBySelection?: boolean;
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

const KIND_ACCENT: Record<MilestoneKind, string> = {
  milestone: "bg-[color:var(--royal,#2f5df6)]",
  decision: "bg-[#8b5cf6]",
  deliverable: "bg-[#f59e0b]",
  meeting: "bg-[#0ea5a4]",
};

function statusIcon(m: RoadmapMilestone) {
  if (m.kind !== "milestone") return KIND_ICON[m.kind];
  switch (m.status) {
    case "completed":
      return CheckCircle2;
    case "in_progress":
      return Loader2;
    case "blocked":
      return AlertTriangle;
    default:
      return Circle;
  }
}

function statusSubline(m: RoadmapMilestone): string | null {
  if (m.status === "in_progress") return "In progress";
  if (m.status === "completed") return "Complete";
  if (m.status === "blocked") return "Blocked";
  const date = m.dueDate ?? m.targetDate ?? m.meetingAt;
  if (date) {
    try {
      const d = new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      return m.kind === "decision" || m.kind === "deliverable"
        ? `Due ${d}`
        : d;
    } catch {
      /* ignore */
    }
  }
  return "Planned";
}

export function MilestoneNode({
  milestone,
  x,
  y,
  onOpen,
  isSelected,
  dimmed = false,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const canvas = useRoadmapCanvas();
  const Icon = statusIcon(milestone);
  const subline = statusSubline(milestone);
  const isPlaceholder = milestone.slug.endsWith("-placeholder");

  useEffect(() => {
    canvas.registerNode(milestone.slug, btnRef.current);
    return () => canvas.registerNode(milestone.slug, null);
  }, [canvas, milestone.slug]);

  const kindLabel = KIND_LABEL[milestone.kind];
  const accent = KIND_ACCENT[milestone.kind];

  const selectedShell =
    "bg-white text-ink border-white shadow-[0_10px_28px_-8px_rgba(0,0,0,0.35)]";
  const restingShell =
    "bg-slate-900/85 text-white border-white/15 backdrop-blur-sm hover:bg-slate-900/95";

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        opacity: dimmed ? 0.28 : 1,
        zIndex: isSelected ? 25 : 15,
      }}
    >
      <button
        ref={btnRef}
        type="button"
        data-milestone-node
        data-marker-slug={milestone.slug}
        data-no-drag
        aria-label={`${kindLabel}: ${milestone.title}`}
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
        className={`group flex items-center gap-2 rounded-full border pl-1.5 pr-3 py-1.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          isSelected ? selectedShell : restingShell
        } ${isPlaceholder ? "opacity-60" : ""}`}
      >
        <span
          className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-white shrink-0 ${accent}`}
          aria-hidden="true"
        >
          <Icon
            className={`w-3.5 h-3.5 ${
              milestone.status === "in_progress" &&
              milestone.kind === "milestone"
                ? "animate-spin"
                : ""
            }`}
          />
        </span>
        <span className="flex flex-col items-start leading-tight text-left">
          <span className="text-[12.5px] font-semibold whitespace-nowrap max-w-[180px] truncate">
            {milestone.title}
          </span>
          {subline && (
            <span
              className={`text-[10.5px] whitespace-nowrap ${
                isSelected ? "text-ink/55" : "text-white/60"
              }`}
            >
              {subline}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/** Small decorative peak marker for Point B (destination flag). */
export function PointBFlag() {
  return (
    <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[color:var(--royal,#2f5df6)] text-white shadow-[0_0_24px_rgba(47,93,246,0.5)]">
      <Flag className="w-4 h-4" />
    </span>
  );
}
