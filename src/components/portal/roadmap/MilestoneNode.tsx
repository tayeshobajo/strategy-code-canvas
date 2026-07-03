import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  GitBranch,
  FileText,
  CalendarClock,
  Flag,
  ArrowRight,
} from "lucide-react";
import { memo, useEffect, useRef } from "react";
import type {
  MilestoneKind,
  RoadmapMilestone,
} from "@/lib/portal-roadmap-model";
import type { MarkerVisibility } from "./view-mode";
import type { MarkerAttachment } from "./roadmap-layout";
import { useRoadmapCanvas } from "./canvas-context";
import { measure } from "./perf";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

type Props = {
  milestone: RoadmapMilestone;
  /** absolute px position within the map canvas */
  x: number;
  y: number;
  onOpen: () => void;
  isSelected: boolean;
  /** How this marker should render, computed from view mode + zoom + legend. */
  visibility: MarkerVisibility;
  /** Placement rule — affects glyph choice and micro-offset. */
  attachment: MarkerAttachment;
  /** Deprecated — legacy filter dimming from the initial view-mode contract. */
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
  if (m.dueDate && m.kind === "milestone") return Flag;
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

/** Truncate to a short label for level-2 markers. */
function shortLabel(title: string, max = 18): string {
  if (title.length <= max) return title;
  return title.slice(0, max - 1).trimEnd() + "…";
}

export const MilestoneNode = memo(function MilestoneNode({
  milestone,
  x,
  y,
  onOpen,
  isSelected,
  visibility,
  attachment,
  mutedBySelection = false,
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

  const showFullLabel = visibility === "full";
  const showShortLabel = visibility === "short";
  const iconOnly = visibility === "icon" || visibility === "muted";
  const isMuted = visibility === "muted";
  const isHidden = visibility === "hidden";

  // Softer selected treatment — the route glow remains the hero.
  const selectedShell =
    "bg-white text-ink border-white ring-2 ring-[rgba(47,93,246,0.55)] ring-offset-2 ring-offset-slate-900/20 shadow-[0_18px_44px_-10px_rgba(47,93,246,0.55),0_0_0_5px_rgba(47,93,246,0.14)]";
  // L1 (anchor / due-dated / selected) keeps the dark pill; L2 (short) uses
  // a lighter translucent chip so the map isn't peppered with dark blocks.
  const isPrimary =
    showFullLabel || isSelected || !!milestone.dueDate;
  const restingShell = isPrimary
    ? "bg-slate-900/85 text-white border-white/15 backdrop-blur-sm hover:bg-slate-900/95"
    : "bg-slate-950/40 text-white border-white/10 backdrop-blur-sm hover:bg-slate-950/60";

  const opacity = isHidden
    ? 0
    : isMuted
      ? 0.6
      : mutedBySelection
        ? 0.9
        : 1;
  const transform = isSelected ? "scale(1.12)" : undefined;
  const filter = isMuted ? "grayscale(20%)" : undefined;

  const statusLabel =
    milestone.status === "in_progress"
      ? "In progress"
      : milestone.status === "completed"
        ? "Completed"
        : milestone.status === "blocked"
          ? "Blocked"
          : milestone.status === "optional"
            ? "Optional"
            : "Upcoming";

  const trigger = (
    <button
      ref={btnRef}
      type="button"
      data-milestone-node
      data-marker-slug={milestone.slug}
      data-marker-selected={isSelected ? "true" : "false"}
      data-no-drag
      aria-label={`${kindLabel}: ${milestone.title}`}
      aria-pressed={isSelected}
      onClick={onOpen}
      onMouseEnter={() =>
        measure("hover:setHighlighted", () => canvas.setHighlightedSlug(milestone.slug))
      }
      onMouseLeave={() => {
        if (canvas.highlightedSlug === milestone.slug)
          canvas.setHighlightedSlug(null);
      }}
      onFocus={() =>
        measure("hover:setHighlighted", () => canvas.setHighlightedSlug(milestone.slug))
      }
      onBlur={() => {
        if (canvas.highlightedSlug === milestone.slug)
          canvas.setHighlightedSlug(null);
      }}
      style={{ transform, transformOrigin: "center" }}
      className={`group flex items-center gap-2 rounded-full border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 hover:-translate-y-[2px] hover:shadow-[0_10px_24px_-8px_rgba(4,10,25,0.55)] ${
        isSelected ? selectedShell : restingShell
      } ${isPlaceholder ? "opacity-60" : ""} ${
        iconOnly ? "p-1.5" : "pl-1.5 pr-3 py-1.5"
      }`}
      title={iconOnly ? undefined : `${kindLabel}: ${milestone.title}`}
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
      {!iconOnly && (
        <span className="flex flex-col items-start leading-tight text-left">
          <span
            className={`font-semibold whitespace-nowrap truncate ${
              showFullLabel
                ? "text-[12.5px] max-w-[200px]"
                : "text-[11.5px] max-w-[140px]"
            }`}
          >
            {showFullLabel ? milestone.title : shortLabel(milestone.title)}
          </span>
          {showFullLabel && subline && (
            <span
              className={`text-[10.5px] whitespace-nowrap ${
                isSelected ? "text-ink/55" : "text-white/60"
              }`}
            >
              {subline}
            </span>
          )}
        </span>
      )}
    </button>
  );

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        opacity,
        filter,
        pointerEvents: isHidden ? "none" : undefined,
        zIndex: isSelected ? 25 : showFullLabel ? 18 : showShortLabel ? 16 : 12,
      }}
      data-marker-visibility={visibility}
      data-marker-attachment={attachment}
    >
      {iconOnly && !isHidden ? (
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
          <HoverCardContent
            side="top"
            align="center"
            className="w-72 p-0 bg-slate-950/95 border-white/20 text-white"
            data-testid={`marker-hovercard-${milestone.slug}`}
          >
            <div className="px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${accent}`}
                  aria-hidden="true"
                >
                  <Icon className="w-3 h-3" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">
                  {kindLabel} · {statusLabel}
                </span>
              </div>
              <div className="text-[13px] font-semibold mt-1.5 leading-tight">
                {milestone.title}
              </div>
              {(milestone.summary || subline) && (
                <div className="text-[11.5px] text-white/70 mt-1 leading-snug line-clamp-2">
                  {milestone.summary ?? subline}
                </div>
              )}
            </div>
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={onOpen}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-royal/25 hover:bg-royal/40 border border-royal/50 text-[11.5px] font-medium py-1.5"
              >
                View details
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </HoverCardContent>
        </HoverCard>
      ) : (
        trigger
      )}
    </div>
  );
});


/** Small decorative peak marker for Point B (destination flag). */
export function PointBFlag() {
  return (
    <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[color:var(--royal,#2f5df6)] text-white shadow-[0_0_24px_rgba(47,93,246,0.5)]">
      <Flag className="w-4 h-4" />
    </span>
  );
}
