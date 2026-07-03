import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  GitBranch,
  FileText,
  CalendarClock,
} from "lucide-react";
import type {
  RoadmapJourney,
  RoadmapMilestone,
  MilestoneKind,
} from "@/lib/portal-roadmap-model";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type Props = {
  journey: RoadmapJourney;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  matchingSlugs?: Set<string> | null;
};

const KIND_ICON: Record<MilestoneKind, typeof Circle> = {
  milestone: Circle,
  decision: GitBranch,
  deliverable: FileText,
  meeting: CalendarClock,
};

const STATUS_TONE: Record<RoadmapMilestone["status"], string> = {
  completed: "bg-royal text-white border-royal",
  in_progress:
    "bg-white text-royal border-royal ring-2 ring-royal/25",
  upcoming: "bg-white text-ink/60 border-ink/20",
  blocked: "bg-white text-[#a4283c] border-[#a4283c]",
  optional: "bg-white/80 text-ink/40 border-dashed border-ink/25",
};

const STATUS_LABEL: Record<RoadmapMilestone["status"], string> = {
  completed: "Completed",
  in_progress: "In progress",
  upcoming: "Upcoming",
  blocked: "Blocked",
  optional: "Optional",
};

export function MobilePhaseStack({ journey, selectedSlug, onSelect, matchingSlugs }: Props) {
  const reduced = useReducedMotion();
  // Start on the phase containing the active milestone, if any.
  const activePhaseIndex = Math.max(
    0,
    journey.phases.findIndex(
      (p) => p.key === journey.activeMilestone?.phase,
    ),
  );
  const [index, setIndex] = useState(activePhaseIndex);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; scrollLeft: number } | null>(null);

  // Snap scroll position to the current index whenever it changes.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.children[index] as HTMLElement | undefined;
    if (!card) return;
    el.scrollTo({
      left: card.offsetLeft,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index, reduced]);

  // Update index as the user swipes/scrolls.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = el.clientWidth;
        if (!w) return;
        const next = Math.round(el.scrollLeft / w);
        if (next !== index) setIndex(next);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [index]);

  const total = journey.phases.length;
  const goto = (i: number) => setIndex(Math.min(Math.max(i, 0), total - 1));

  return (
    <div className="rounded-2xl border border-white/10 bg-[oklch(0.14_0.05_265)] p-4">
      <div className="flex items-center justify-between text-white/85 mb-3">
        <button
          type="button"
          aria-label="Previous phase"
          disabled={index === 0}
          onClick={() => goto(index - 1)}
          className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 border border-white/15 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/55">
            {journey.phases[index]?.timeframe}
          </div>
          <div className="font-display text-lg leading-tight">
            Phase {journey.phases[index]?.label}
          </div>
        </div>
        <button
          type="button"
          aria-label="Next phase"
          disabled={index === total - 1}
          onClick={() => goto(index + 1)}
          className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 border border-white/15 disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory -mx-4 px-4 gap-4 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
        role="group"
        aria-roledescription="carousel"
        aria-label="Roadmap phases"
        onTouchStart={(e) => {
          const el = scrollerRef.current;
          if (!el) return;
          touchStart.current = {
            x: e.touches[0].clientX,
            scrollLeft: el.scrollLeft,
          };
        }}
        onTouchEnd={() => {
          touchStart.current = null;
        }}
      >
        {journey.phases.map((phase, i) => (
          <section
            key={phase.key}
            aria-label={`Phase ${phase.label}`}
            aria-hidden={i !== index}
            className="snap-center shrink-0 basis-full rounded-xl bg-white text-ink border border-border p-4"
          >
            {phase.milestones.length === 0 ? (
              <p className="text-sm text-ink/60">
                No milestones in this phase yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {phase.milestones.map((m) => {
                  const Icon =
                    m.kind === "milestone"
                      ? m.status === "completed"
                        ? CheckCircle2
                        : m.status === "in_progress"
                          ? Loader2
                          : m.status === "blocked"
                            ? AlertTriangle
                            : Circle
                      : KIND_ICON[m.kind];
                  const isSel = m.slug === selectedSlug;
                  return (
                    <li key={m.slug}>
                      <button
                        type="button"
                        onClick={() => onSelect(m.slug)}
                        aria-pressed={isSel}
                        className={`w-full text-left rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                          isSel
                            ? "border-royal/40 bg-royal/5"
                            : "border-border hover:border-ink/20"
                        }`}
                      >
                        <span
                          className={`shrink-0 mt-0.5 inline-flex items-center justify-center h-8 w-8 rounded-full border-2 ${STATUS_TONE[m.status]}`}
                        >
                          <Icon
                            aria-hidden="true"
                            className={`w-4 h-4 ${
                              m.status === "in_progress" &&
                              m.kind === "milestone"
                                ? "animate-spin"
                                : ""
                            }`}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-royal">
                            {m.kind} · {STATUS_LABEL[m.status]}
                          </span>
                          <span className="block font-medium text-ink text-[15px] leading-snug mt-0.5">
                            {m.title}
                          </span>
                          {m.summary && (
                            <span className="block text-[13px] text-ink/65 mt-1 line-clamp-2">
                              {m.summary}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div
        className="flex items-center justify-center gap-1.5 mt-4"
        role="tablist"
        aria-label="Phase pagination"
      >
        {journey.phases.map((p, i) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Go to Phase ${p.label}`}
            onClick={() => goto(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-6 bg-white" : "w-1.5 bg-white/35"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/50">
        Swipe left or right to move between phases
      </p>
    </div>
  );
}
