import { useEffect, useState } from "react";
import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { MapPin, ChevronRight, CalendarClock, Flag, ChevronDown, ChevronUp } from "lucide-react";
import { useRoadmapCanvas, STATUS_COLLAPSED_KEY } from "./canvas-context";

type Props = {
  journey: RoadmapJourney;
  clientResponsibilities?: string[];
  taiResponsibilities?: string[];
  onSelectNextAction?: (slug: string) => void;
};

function fmtDate(d?: string | null) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function phaseIndex(journey: RoadmapJourney, key: string): number {
  const i = journey.phases.findIndex((p) => p.key === key);
  return i < 0 ? 1 : i + 1;
}

function phaseTitle(key: string): string {
  if (key === "now") return "Foundation";
  if (key === "next") return "Core Platform Build";
  return "Scale Systems";
}

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(STATUS_COLLAPSED_KEY);
    if (v === null) return true; // default collapsed
    return v === "1";
  } catch {
    return true;
  }
}

export function StatusOverlayCard({
  journey,
  clientResponsibilities,
  taiResponsibilities,
  onSelectNextAction,
}: Props) {
  const canvas = useRoadmapCanvas();
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STATUS_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const active = journey.activeMilestone;
  // Single source of truth: derived currentPhaseKey from the journey.
  const currentPhaseKey = canvas.currentPhaseKey ?? journey.currentPhaseKey;
  const currentIdx = phaseIndex(journey, currentPhaseKey);
  const currentLabel = `Phase ${currentIdx}: ${phaseTitle(currentPhaseKey)}`;

  const nextAction =
    active?.clientActionNeeded ??
    active?.actions?.[0] ??
    journey.nextMilestone?.title ??
    null;
  const nextActionDate = fmtDate(
    active?.dueDate ?? active?.targetDate ?? journey.nextMilestone?.targetDate,
  );
  const nextMeetingDate = fmtDate(journey.nextMeetingAt);

  const clientResp = clientResponsibilities ?? active?.actions?.slice(0, 3) ?? [];
  const taiResp =
    taiResponsibilities ??
    (active?.ownerNote ? [active.ownerNote] : []).concat(
      journey.nextMilestone ? [`Prepare ${journey.nextMilestone.title}`] : [],
    );

  const showClient = showAll ? clientResp : clientResp.slice(0, 2);
  const showTai = showAll ? taiResp : taiResp.slice(0, 2);

  return (
    <div
      className={`rounded-2xl bg-white/95 backdrop-blur-md border border-white/60 shadow-[0_20px_60px_-20px_rgba(4,10,25,0.55)] text-ink transition-all duration-200 ${
        collapsed ? "w-[240px] p-2.5" : "w-[280px] p-4"
      }`}
      data-testid="status-overlay-card"
      data-collapsed={collapsed ? "true" : "false"}
    >
      {/* Header + collapse toggle */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-royal">
            Your current status
          </div>
          <div className="flex items-start gap-2 mt-1">
            <MapPin className="w-4 h-4 text-royal mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] text-ink/55">You are here</div>
              <div
                className="text-[13.5px] font-semibold leading-tight truncate"
                data-testid="status-current-phase"
              >
                {currentLabel}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          data-testid="status-toggle"
          aria-label={collapsed ? "Expand status card" : "Collapse status card"}
          aria-expanded={!collapsed}
          className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md border border-ink/10 bg-white hover:bg-ink/5 text-ink/60"
        >
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Progress */}
      <div className="mt-2.5">
        <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
          <div
            className="h-full bg-royal transition-all"
            style={{ width: `${journey.progressPercent}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-ink/55">
          {journey.progressPercent}% Complete
        </div>
      </div>

      {/* Next action — visible in both states */}
      {nextAction && (
        <Section label="Next action">
          <button
            type="button"
            onClick={() => active && onSelectNextAction?.(active.slug)}
            className="mt-1 w-full flex items-center gap-2 rounded-lg border border-ink/10 bg-white hover:bg-ink/[0.03] px-2.5 py-2 text-left transition-colors"
          >
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-royal/10 text-royal shrink-0">
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-ink truncate">
                {nextAction}
              </span>
              {nextActionDate && (
                <span className="block text-[11px] text-ink/55">
                  Due {nextActionDate}
                </span>
              )}
            </span>
          </button>
        </Section>
      )}

      {/* Expanded sections */}
      {!collapsed && (
        <>
          {nextMeetingDate && (
            <Section label="Upcoming meeting">
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-2.5 py-2">
                <CalendarClock className="w-4 h-4 text-royal shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-ink truncate">
                    Strategy Alignment Call
                  </div>
                  <div className="text-[11px] text-ink/55">{nextMeetingDate}</div>
                </div>
              </div>
            </Section>
          )}

          {journey.nextMilestone?.targetDate && (
            <Section label="Key date">
              <div className="mt-1 flex items-center gap-2">
                <Flag className="w-4 h-4 text-royal shrink-0" />
                <div>
                  <div className="text-[12.5px] font-medium text-ink leading-tight">
                    {journey.nextMilestone.title}
                  </div>
                  <div className="text-[11px] text-ink/55">
                    {fmtDate(journey.nextMilestone.targetDate)}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {clientResp.length > 0 && (
            <Section label="Client responsibilities">
              <ul className="mt-1 space-y-1">
                {showClient.map((item, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-ink/80 flex items-start gap-1.5"
                  >
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-ink/40 shrink-0" />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {taiResp.length > 0 && (
            <Section label="Trust Tai responsibilities">
              <ul className="mt-1 space-y-1">
                {showTai.map((item, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-ink/80 flex items-start gap-1.5"
                  >
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-ink/40 shrink-0" />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(clientResp.length > 2 || taiResp.length > 2) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 w-full rounded-lg border border-ink/15 bg-white hover:bg-ink/[0.03] text-[12px] font-medium text-ink py-1.5 transition-colors"
            >
              {showAll ? "Show less" : "View all responsibilities"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3.5 pt-3.5 border-t border-ink/10">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink/55">
        {label}
      </div>
      {children}
    </div>
  );
}
