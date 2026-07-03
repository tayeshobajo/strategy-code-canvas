import { useState } from "react";
import type { RoadmapJourney } from "@/lib/portal-roadmap-model";
import { MapPin, ChevronRight, CalendarClock, Flag } from "lucide-react";

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

export function StatusOverlayCard({
  journey,
  clientResponsibilities,
  taiResponsibilities,
  onSelectNextAction,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const active = journey.activeMilestone;
  const nextAction =
    active?.clientActionNeeded ??
    active?.actions?.[0] ??
    journey.nextMilestone?.title ??
    null;
  const nextActionDate = fmtDate(
    active?.dueDate ?? active?.targetDate ?? journey.nextMilestone?.targetDate,
  );
  const nextMeetingDate = fmtDate(journey.nextMeetingAt);

  const clientResp =
    clientResponsibilities ??
    active?.actions?.slice(0, 3) ??
    [];
  const taiResp =
    taiResponsibilities ??
    (active?.ownerNote ? [active.ownerNote] : []).concat(
      journey.nextMilestone ? [`Prepare ${journey.nextMilestone.title}`] : [],
    );

  const showClient = showAll ? clientResp : clientResp.slice(0, 2);
  const showTai = showAll ? taiResp : taiResp.slice(0, 2);

  return (
    <div className="w-[280px] rounded-2xl bg-white/95 backdrop-blur-md border border-white/60 shadow-[0_20px_60px_-20px_rgba(4,10,25,0.55)] p-4 text-ink">
      <Section label="Your current status" tone="royal">
        <div className="flex items-start gap-2 mt-1">
          <MapPin className="w-4 h-4 text-royal mt-0.5 shrink-0" />
          <div>
            <div className="text-[11px] text-ink/55">You are here</div>
            <div className="text-[13.5px] font-semibold leading-tight">
              {active
                ? `Phase ${phaseIndex(journey, active.phase)}: ${
                    phaseTitle(active.phase)
                  }`
                : "Getting started"}
            </div>
          </div>
        </div>
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
      </Section>

      {nextAction && (
        <Section label="Next action">
          <button
            type="button"
            onClick={() =>
              active && onSelectNextAction?.(active.slug)
            }
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
    </div>
  );
}

function Section({
  label,
  tone = "muted",
  children,
}: {
  label: string;
  tone?: "royal" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div className="not-first:mt-3.5 not-first:pt-3.5 not-first:border-t not-first:border-ink/10">
      <div
        className={`font-mono text-[9.5px] uppercase tracking-[0.28em] ${
          tone === "royal" ? "text-royal" : "text-ink/55"
        }`}
      >
        {label}
      </div>
      {children}
    </div>
  );
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
