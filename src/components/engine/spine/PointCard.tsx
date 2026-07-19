import { Link } from "@tanstack/react-router";
import { ArrowRight, Brain, CheckCircle2, MapPin, Flag } from "lucide-react";
import { useSourceInspector } from "@/hooks/use-source-inspector";
import { getIntelligenceRoomLink, validateIntelligenceAnchor } from "@/lib/intelligence-room-links";
import type { SpineFieldStatus } from "@/lib/spine-contract";
import { coherentPresentation, confidenceLabel } from "@/lib/spine-coherence";
import { cn } from "@/lib/utils";

type Tone = "approved" | "verified" | "assumption" | "contradiction" | "review" | "draft" | "history";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "approved":
      return "border-[#bfe4ce] bg-[#e7f5ec] text-[#1f6b3b]";
    case "verified":
      return "border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]";
    case "assumption":
      return "border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]";
    case "contradiction":
      return "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]";
    case "review":
      return "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]";
    case "draft":
    case "history":
    default:
      return "border-[#E8E1D6] bg-[#FBF9F4] text-[#667085]";
  }
}

export function PointCard({
  point,
  projectId,
  status,
  bullets,
  sourceCount,
  approvedAt,
  inspectorKey,
  inspectorLabel,
  summary,
  whatChanged,
}: {
  point: "A" | "B";
  projectId: string;
  status: SpineFieldStatus | null;
  bullets: string[];
  sourceCount: number;
  approvedAt: string | null;
  inspectorKey: string;
  inspectorLabel: string;
  summary?: string | null;
  whatChanged?: string | null;
}) {
  const { open } = useSourceInspector();
  const label = point === "A" ? "Point A · Current Reality" : "Point B · Desired Future";
  const subtitle =
    point === "A" ? "Where the business is today" : "Where the business is going";
  const presentation = coherentPresentation(status, bullets.length);
  const confidence = confidenceLabel(status, bullets.length);
  const Icon = point === "A" ? MapPin : Flag;
  const bulletsHeading = point === "A" ? "Key truths" : "Success measures";
  // Standardised structure per PROJECT_SPINE_CONTRACT §5 — Point A and
  // Point B render the same six blocks: Summary · Key truths/Success
  // measures · Confidence · Sources · Approval · What changed.
  const summaryText = (summary ?? "").trim();
  const trimmedBullets = bullets
    .map((b) => (b.length > 160 ? b.slice(0, 157).trimEnd() + "…" : b))
    .slice(0, 4);

  return (
    <section className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E8E1D6] bg-white p-6 shadow-[0_1px_0_rgba(10,15,31,0.03),0_12px_32px_-24px_rgba(10,15,31,0.18)] ring-1 ring-[#0A0F1F]/[0.03] transition-shadow hover:shadow-[0_1px_0_rgba(10,15,31,0.04),0_18px_40px_-24px_rgba(10,15,31,0.22)]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A0F1F] via-[#3E68B2] to-[#34C4EB]"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A0F1F] text-white shadow-sm ring-4 ring-[#eef3fd]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#3E68B2]">
              {point === "A" ? "Point A" : "Point B"}
            </div>
            <div
              className="mt-0.5 truncate text-[22px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              {point === "A" ? "Current reality" : "Desired future"}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[#667085]">{subtitle}</div>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
            toneClass(presentation.tone),
          )}
          title={label}
        >
          {presentation.label}
        </span>
      </div>

      {/* 1 · Summary */}
      <div className="mt-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-px w-6 bg-[#0A0F1F]" />
          <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
            Summary
          </div>
        </div>
        <p className="mt-2.5 text-[14px] leading-[1.55] text-[#1a2233]">
          {summaryText ? (
            summaryText.length > 240 ? summaryText.slice(0, 237).trimEnd() + "…" : summaryText
          ) : (
            <span
              className="italic text-[#8a94a6]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              Not yet summarised.
            </span>
          )}
        </p>
      </div>

      {/* 2 · Key truths / Success measures */}
      <div className="mt-5 flex-1">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-px w-6 bg-[#0A0F1F]" />
          <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
            {bulletsHeading}
          </div>
        </div>
        <ul className="mt-3 space-y-2.5 text-[14px] leading-[1.55] text-[#1a2233]">
          {trimmedBullets.length ? (
            trimmedBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#1f6b3b]" />
                <span className="min-w-0 break-words">{b}</span>
              </li>
            ))
          ) : (
            <li
              className="text-[15px] italic text-[#8a94a6]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              Not yet defined.
            </li>
          )}
        </ul>
      </div>

      {/* 3-5 · Confidence · Sources · Approval */}
      <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-[#F0EBE3] bg-[#FBF9F4] px-4 py-3">
        <Meta label="Confidence" value={confidence} />
        <Meta label="Sources" value={String(sourceCount)} />
        <Meta label="Approval" value={approvedAt ? new Date(approvedAt).toLocaleDateString() : "Pending"} />
      </div>

      {/* 6 · What changed */}
      <div className="mt-3 rounded-lg border border-[#F0EBE3] bg-white px-4 py-2.5">
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
          What changed
        </div>
        <div className="mt-1 text-[12.5px] leading-[1.5] text-[#3f4a5e]">
          {whatChanged?.trim() ? whatChanged : <span className="text-[#8a94a6]">No recent revisions.</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#F0EBE3] pt-4 text-[12px]">
        <button
          type="button"
          onClick={() =>
            open({
              projectId,
              sectionKey: inspectorKey,
              fieldKey: "summary",
              label: inspectorLabel,
              statement: bullets[0] ?? null,
            })
          }
          className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
        >
          Inspect sources <ArrowRight className="h-3 w-3" />
        </button>
        <Link
          to={point === "A" ? "/engine/projects/$projectId/point-a" : "/engine/projects/$projectId/point-b"}
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 font-semibold text-[#0A0F1F] transition-colors hover:text-[#3E68B2]"
        >
          Open room <ArrowRight className="h-3 w-3" />
        </Link>
        {(() => {
          const link = getIntelligenceRoomLink(point);
          return (
            <Link
              to={link.to}
              params={{ projectId }}
              hash={link.hash}
              onClick={() => window.setTimeout(() => validateIntelligenceAnchor(link.hash), 50)}
              className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
            >
              <Brain className="h-3 w-3" /> Intelligence
            </Link>
          );
        })()}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
        {label}
      </div>
      <div className="mt-1 truncate text-[13.5px] font-semibold tracking-[-0.005em] text-[#0A0F1F]">
        {value}
      </div>
    </div>
  );
}
