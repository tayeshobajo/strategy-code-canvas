import { CheckCircle2, CircleDot, Clock, AlertCircle, X } from "lucide-react";
import type { MilestoneStatus, PhaseKey, RoadmapJourney } from "@/lib/portal-roadmap-model";

/** Statuses users can filter by. "optional" is intentionally omitted. */
export const FILTERABLE_STATUSES: MilestoneStatus[] = [
  "completed",
  "in_progress",
  "upcoming",
  "blocked",
];

const STATUS_META: Record<
  MilestoneStatus,
  { label: string; icon: typeof CircleDot; color: string; tone: string }
> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "#10B981",
    tone: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  },
  in_progress: {
    label: "In progress",
    icon: CircleDot,
    color: "#2F7DFF",
    tone: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  },
  upcoming: {
    label: "Upcoming",
    icon: Clock,
    color: "#94A3B8",
    tone: "text-slate-200 border-white/25 bg-white/[0.06]",
  },
  blocked: {
    label: "Blocked",
    icon: AlertCircle,
    color: "#E11D48",
    tone: "text-rose-300 border-rose-400/40 bg-rose-400/10",
  },
  optional: {
    label: "Optional",
    icon: Clock,
    color: "#94A3B8",
    tone: "text-slate-300 border-white/20 bg-white/5",
  },
};

const PHASE_COLORS = ["#2F7DFF", "#F59D2A", "#7DCA54", "#8B5CF6", "#0EA5A4"];

type Props = {
  journey: RoadmapJourney;
  activeStatuses: Set<MilestoneStatus>;
  activePhases: Set<PhaseKey>;
  onToggleStatus: (s: MilestoneStatus) => void;
  onTogglePhase: (p: PhaseKey) => void;
  onReset: () => void;
};

/**
 * Compact chip filter bar for statuses (all milestones) and phases (quarters).
 * Renders next to the interactive kind legend. Selecting chips narrows
 * `matchingSlugs`, which drives both the mini-map dots and the drawer list.
 */
export function RoadmapFilters({
  journey,
  activeStatuses,
  activePhases,
  onToggleStatus,
  onTogglePhase,
  onReset,
}: Props) {
  const statusesActive = activeStatuses.size < FILTERABLE_STATUSES.length;
  const phasesActive = activePhases.size > 0 && activePhases.size < journey.phases.length;
  const anyActive = statusesActive || phasesActive;

  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 rounded-full bg-slate-900/70 backdrop-blur border border-white/15 px-2 py-1.5 text-white"
      data-testid="roadmap-filters"
      data-roadmap-interactive
    >
      {/* Status chips */}
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/45 pl-1 pr-0.5 select-none">
          Status
        </span>
        {FILTERABLE_STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          const active = activeStatuses.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggleStatus(s)}
              aria-pressed={active}
              className={`group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD37A] ${
                active
                  ? meta.tone
                  : "border-white/10 bg-transparent text-white/35 line-through hover:bg-white/5"
              }`}
              title={active ? `Hide ${meta.label.toLowerCase()}` : `Show ${meta.label.toLowerCase()}`}
            >
              <Icon
                className="w-2.5 h-2.5"
                style={{ color: active ? meta.color : undefined }}
              />
              {meta.label}
            </button>
          );
        })}
      </div>

      <span aria-hidden className="h-4 w-px bg-white/10" />

      {/* Phase chips (aka "quarters") */}
      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/45 pl-1 pr-0.5 select-none">
          Phase
        </span>
        {journey.phases.map((p, i) => {
          const color = PHASE_COLORS[i % PHASE_COLORS.length];
          // Empty active-set = show all phases (default).
          const active = activePhases.size === 0 || activePhases.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onTogglePhase(p.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD37A] ${
                active
                  ? "border-white/25 bg-white/[0.08] text-white hover:bg-white/12"
                  : "border-white/10 bg-transparent text-white/35 line-through hover:bg-white/5"
              }`}
              title={active ? `Hide Phase ${i + 1}` : `Show Phase ${i + 1}`}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full transition-all"
                style={{
                  background: active ? color : "transparent",
                  border: `1px solid ${color}`,
                  boxShadow: active ? `0 0 6px ${color}` : "none",
                }}
              />
              P{i + 1}
            </button>
          );
        })}
      </div>

      {anyActive && (
        <>
          <span aria-hidden className="h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-medium text-white/75 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD37A]"
            title="Clear filters"
          >
            <X className="w-3 h-3" />
            Reset
          </button>
        </>
      )}
    </div>
  );
}
