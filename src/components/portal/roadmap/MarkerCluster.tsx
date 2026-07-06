import { useState } from "react";
import type { MarkerCluster } from "./roadmap-layout";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Layers, ChevronRight, Maximize2, Check } from "lucide-react";
import type { RoadmapMilestone } from "@/lib/portal-roadmap-model";
import { useRoadmapCanvas } from "./canvas-context";

type Props = {
  cluster: MarkerCluster;
  x: number;
  y: number;
  selectedSlug?: string | null;
  onOpenMember: (slug: string) => void;
  /** Real "Phase N · Label" heading resolved from journey data by the parent. */
  phaseTitle?: string;
};

/**
 * Classify a member into a priority tier matching `view-mode.ts`:
 *  L1 — strategic anchor (has due date, or decision, or in-progress milestone)
 *  L2 — active milestones/deliverables in the phase
 *  L3 — supporting (meetings, completed items, other)
 */
function tierOf(m: RoadmapMilestone): 1 | 2 | 3 {
  if (m.dueDate && m.status !== "completed") return 1;
  if (m.kind === "decision" && m.status !== "completed") return 1;
  if (m.kind === "milestone" && m.status === "in_progress") return 1;
  if (m.kind === "milestone" || m.kind === "deliverable") return 2;
  return 3;
}

const KIND_META: Record<string, { label: string; dot: string }> = {
  milestone: { label: "Milestones", dot: "bg-[color:var(--royal,#2f5df6)]" },
  decision: { label: "Decisions", dot: "bg-[#8b5cf6]" },
  deliverable: { label: "Deliverables", dot: "bg-[#f59e0b]" },
  meeting: { label: "Meetings", dot: "bg-[#0ea5a4]" },
  deadline: { label: "Deadlines", dot: "bg-[#e11d48]" },
};

const KIND_ORDER: Array<keyof typeof KIND_META> = [
  "milestone",
  "decision",
  "deadline",
  "deliverable",
  "meeting",
];

function countsByKind(members: MarkerCluster["members"]) {
  const c: Record<string, number> = {};
  for (const { milestone: m } of members) {
    const key = m.dueDate && m.kind === "milestone" ? "deadline" : m.kind;
    c[key] = (c[key] ?? 0) + 1;
  }
  return c;
}

function countsByTier(members: MarkerCluster["members"]) {
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  for (const { milestone } of members) {
    const t = tierOf(milestone);
    if (t === 1) l1++;
    else if (t === 2) l2++;
    else l3++;
  }
  return { l1, l2, l3 };
}

export function MarkerClusterChip({
  cluster,
  x,
  y,
  selectedSlug = null,
  onOpenMember,
  phaseTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const canvas = useRoadmapCanvas();
  const title = phaseTitle ?? `Phase ${cluster.phase}`;
  const isExploded = canvas.explodedClusterKeys.has(cluster.key);
  const containsSelection =
    !!selectedSlug &&
    cluster.members.some((m) => m.milestone.slug === selectedSlug);

  const kindCounts = countsByKind(cluster.members);
  const tierCounts = countsByTier(cluster.members);

  const expandInPlace = () => {
    // Fan the cluster's members out onto the map without changing the
    // global zoom, so nearby items don't overlap and can be inspected.
    canvas.toggleClusterExpanded(cluster.key);
    // Keep popover open so the user can immediately click a member; also
    // preserves selection context if the current selection is inside.
    setOpen(false);
  };

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
            aria-expanded={isExploded}
            className={`group flex items-center gap-2 rounded-full border text-white pl-1.5 pr-3 py-1.5 backdrop-blur-sm shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-royal transition-all duration-200 ${
              isExploded
                ? "border-royal/70 bg-royal/25 hover:bg-royal/35 scale-[1.02]"
                : "border-white/25 bg-slate-950/85 hover:bg-slate-900/95"
            } ${containsSelection ? "ring-2 ring-royal/60 ring-offset-2 ring-offset-slate-950" : ""}`}
          >
            <span
              className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition-transform duration-300 ${
                isExploded ? "bg-white/25 rotate-45" : "bg-white/15"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </span>
            <span className="flex flex-col items-start leading-tight text-left">
              <span className="text-[11.5px] font-semibold whitespace-nowrap">
                {title}
                {isExploded && (
                  <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-white/70">
                    · expanded
                  </span>
                )}
              </span>
              <span className="text-[10px] text-white/65 whitespace-nowrap">
                {cluster.total} items · {tierCounts.l1} priority ·{" "}
                {cluster.completed} done
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="w-80 p-0 bg-slate-950/95 border-white/20 text-white animate-scale-in"
        >
          <div className="px-3 py-2 border-b border-white/10">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">
              {title}
            </div>
            <div className="text-[12px] text-white/85 mt-0.5">
              {cluster.total} items in this stretch
            </div>
            {/* Priority-tier ribbon — mirrors view-mode.ts tiers so the
                cluster reads like a mini strategic summary. */}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em]">
              <TierChip label="L1 · Priority" count={tierCounts.l1} tone="royal" />
              <TierChip label="L2 · Active" count={tierCounts.l2} tone="amber" />
              <TierChip label="L3 · Support" count={tierCounts.l3} tone="mute" />
            </div>
            {/* Type breakdown, ordered by strategic weight */}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {KIND_ORDER.filter((k) => (kindCounts[k] ?? 0) > 0).map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 text-[10.5px] text-white/75"
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${KIND_META[k].dot}`}
                    aria-hidden
                  />
                  <span>
                    {kindCounts[k]} {KIND_META[k].label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {[...cluster.members]
              .sort((a, b) => tierOf(a.milestone) - tierOf(b.milestone))
              .map(({ milestone }, i) => {
                const isSelected = milestone.slug === selectedSlug;
                const tier = tierOf(milestone);
                return (
                  <li
                    key={milestone.slug}
                    style={{
                      animation: `fade-in 220ms ease-out ${Math.min(i, 8) * 22}ms both`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMember(milestone.slug);
                        setOpen(false);
                      }}
                      data-selected={isSelected ? "true" : "false"}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors ${
                        isSelected
                          ? "bg-royal/25 text-white"
                          : "hover:bg-white/10"
                      }`}
                    >
                      <StatusDot m={milestone} />
                      <span className="flex-1 min-w-0 truncate">
                        {milestone.title}
                      </span>
                      {tier === 1 && (
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-royal-glow">
                          L1
                        </span>
                      )}
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-royal-glow" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
          <div className="border-t border-white/10 px-3 py-2">
            <button
              type="button"
              onClick={expandInPlace}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 text-[11.5px] font-medium py-1.5 transition-all duration-200 active:scale-[0.98]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              {isExploded
                ? "Collapse back into cluster"
                : "Fan nearby items on the map"}
            </button>
            {containsSelection && (
              <div className="mt-1.5 text-center text-[10.5px] text-white/55">
                Selection preserved on{" "}
                {isExploded ? "the map" : "collapse"}.
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TierChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "royal" | "amber" | "mute";
}) {
  const cls =
    tone === "royal"
      ? "bg-royal/20 text-royal-glow border-royal/40"
      : tone === "amber"
        ? "bg-[#f59e0b]/15 text-[#f0b25b] border-[#f59e0b]/35"
        : "bg-white/[0.06] text-white/55 border-white/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${cls}`}
      title={`${count} ${label}`}
    >
      <span className="text-[10px]">{label}</span>
      <span className="text-[10.5px] font-semibold">{count}</span>
    </span>
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
