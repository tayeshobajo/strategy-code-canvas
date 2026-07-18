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
}: {
  point: "A" | "B";
  projectId: string;
  status: SpineFieldStatus | null;
  bullets: string[];
  sourceCount: number;
  approvedAt: string | null;
  inspectorKey: string;
  inspectorLabel: string;
}) {
  const { open } = useSourceInspector();
  const label = point === "A" ? "Point A · Current Reality" : "Point B · Desired Future";
  const subtitle =
    point === "A" ? "Where the business is today" : "Where the business is going";
  const presentation = coherentPresentation(status, bullets.length);
  const confidence = confidenceLabel(status, bullets.length);
  const Icon = point === "A" ? MapPin : Flag;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] text-[#0A0F1F]">{label}</div>
            <div className="truncate text-xs text-[#667085]">{subtitle}</div>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider",
            toneClass(presentation.tone),
          )}
        >
          {presentation.label}
        </span>
      </div>

      <div className="mt-4 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Key truths
        </div>
        <ul className="mt-2 space-y-2 text-sm text-[#0A0F1F]">
          {bullets.length ? (
            bullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1f6b3b]" />
                <span className="min-w-0 break-words">{b}</span>
              </li>
            ))
          ) : (
            <li className="text-sm italic text-[#667085]">Not yet defined.</li>
          )}
        </ul>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#F3EEE6] pt-3 text-xs">
        <Meta label="Confidence" value={confidence} />
        <Meta label="Sources" value={String(sourceCount)} />
        <Meta label="Approved" value={approvedAt ? new Date(approvedAt).toLocaleDateString() : "—"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#F3EEE6] pt-3 text-xs">
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
          className="inline-flex items-center gap-1 font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          Inspect sources <ArrowRight className="h-3 w-3" />
        </button>
        <Link
          to={point === "A" ? "/engine/projects/$projectId/point-a" : "/engine/projects/$projectId/point-b"}
          params={{ projectId }}
          className="inline-flex items-center gap-1 font-medium text-[#0A0F1F] hover:text-[#3E68B2]"
        >
          Open room
        </Link>
        {(() => {
          const link = getIntelligenceRoomLink(point);
          return (
            <Link
              to={link.to}
              params={{ projectId }}
              hash={link.hash}
              onClick={() => window.setTimeout(() => validateIntelligenceAnchor(link.hash), 50)}
              className="inline-flex items-center gap-1 font-medium text-[#3E68B2] hover:text-[#284f93]"
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
      <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-[#0A0F1F]">{value}</div>
    </div>
  );
}
