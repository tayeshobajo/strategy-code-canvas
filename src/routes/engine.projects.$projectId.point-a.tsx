import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/use-workspace";
import { StepAiPanelFor } from "@/components/engine/StepAiPanelFor";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { StepStateBar, SourceEvidence } from "@/components/engine/StepState";
import { EpistemicStatusChip } from "@/components/engine/EpistemicStatusChip";
import { CeremonyPanel } from "@/components/engine/CeremonyPanel";
import {
  getSpineFieldStatus,
  type FieldStatusEntry,
} from "@/lib/engine-epistemic.functions";
import { pointADiagnosisKey } from "@/lib/engine-spine-fields";
import { cn } from "@/lib/utils";
import { Share2, StickyNote, MoreHorizontal, Quote, AlertTriangle, Shield } from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/point-a")({
  component: PointA,
});

type Lens = { label: string; value: string; hint: string };
type Card = { title: string; tag: string; bullets: string[] };

const TAG_TONE: Record<string, string> = {
  PARTIAL: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  LIMITED: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  MISSING: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  RISK: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  CONSTRAINT: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
  DEFAULT: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]",
};

function PointA() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const data = (project.point_a ?? {}) as {
    lenses?: Lens[];
    diagnosis?: Card[];
    key_diagnosis?: string;
  };
  const lenses: Lens[] = Array.isArray(data.lenses) ? data.lenses : [];
  const diagnosis: Card[] = (Array.isArray(data.diagnosis) ? data.diagnosis : []).map((d) => ({
    title: d?.title ?? "",
    tag: d?.tag ?? "DEFAULT",
    bullets: Array.isArray(d?.bullets)
      ? d.bullets
      : typeof d?.bullets === "string"
        ? [d.bullets]
        : [],
  }));
  const fetchStatus = useServerFn(getSpineFieldStatus);
  const { data: statusData } = useQuery({
    queryKey: ["engine", "spine-status", projectId, "point-a"],
    queryFn: () => fetchStatus({ data: { projectId, spine: "point-a" } }),
    staleTime: 30_000,
  });
  const statusMap = (statusData?.statuses ?? {}) as Record<string, FieldStatusEntry>;
  const statusFor = (key: string): FieldStatusEntry | undefined => statusMap[key];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 4</div>
          <h2 className="font-display text-3xl text-ink mt-1">Point A Diagnosis</h2>
          <p className="text-sm text-ink/60 mt-1">The truth about where the business is today.</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 text-ink hover:border-royal/50">
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <button className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 text-ink hover:border-royal/50">
            <StickyNote className="w-3.5 h-3.5" /> Notes
          </button>
          <button className="inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2.5 py-1.5 text-ink hover:border-royal/50">
            <MoreHorizontal className="w-3.5 h-3.5" /> More
          </button>
        </div>
      </header>
      <StepStateBar projectId={projectId} step="point-a" current={project.step_states?.["point-a"]} />
      <StepAiPanelFor step="point-a" data={project.point_a} projectId={projectId} />
      <SourceEvidence projectId={projectId} step="point-a" />
      <CeremonyPanel projectId={projectId} spine="point-a" />




      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          {lenses.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {lenses.map((l) => (
                <div key={l.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">{l.label}</div>
                  <div className="font-display text-lg text-ink mt-1 leading-tight">{l.value}</div>
                  <div className="text-[11px] text-ink/60 mt-1">{l.hint}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/60 mb-3">
              Current State Diagnosis
            </div>
            {diagnosis.length === 0 ? (
              <SectionCard title="Diagnosis"><EmptyState title="No diagnosis captured yet" /></SectionCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {diagnosis.map((d) => {
                  const key = pointADiagnosisKey(d.title);
                  const entry = statusFor(key);
                  return (
                    <div key={d.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-medium text-ink">{d.title}</div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <EpistemicStatusChip
                            status={entry?.status}
                            sourceRef={entry?.source_ref}
                            projectId={projectId}
                            spine="point-a"
                            fieldKey={key}
                            fieldLabel={d.title}
                          />
                          <span
                            className={cn(
                              "text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5",
                              TAG_TONE[d.tag] ?? TAG_TONE.DEFAULT,
                            )}
                          >
                            {d.tag}
                          </span>
                        </div>
                      </div>
                      <ul className="text-xs text-ink/75 space-y-1 list-disc list-inside">
                        {d.bullets.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {data.key_diagnosis ? (
            <div className="rounded-xl border border-border bg-paper-soft p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Quote className="w-5 h-5 text-royal shrink-0 mt-1" />
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/60 mb-2">Key Diagnosis</div>
                  <p className="text-ink text-[15px] leading-relaxed">{data.key_diagnosis}</p>
                </div>
              </div>
            </div>
          ) : null}

          <SectionCard title="Edit Point A">
            <StepEditor projectId={projectId} step="point-a" data={project.point_a} expectedUpdatedAt={project.updated_at} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Business Health Score</div>
            <div className="mt-3 flex flex-col items-center">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#eceef3" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="#c99a20" strokeWidth="10"
                    strokeDasharray={`${(project.health_score / 100) * 264} 264`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-display text-3xl text-ink">{project.health_score}</div>
                  <div className="text-[10px] text-ink/50">Out of 100</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-[#a4283c] font-mono text-[10px] uppercase tracking-wider mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Top Bottlenecks
            </div>
            <ol className="text-xs text-ink/80 space-y-1.5 list-decimal list-inside">
              {(diagnosis.filter((d) => d.tag === "MISSING").flatMap((d) => d.bullets.slice(0, 1)).slice(0, 5)).map((b, i) => <li key={i}>{b}</li>)}
              {diagnosis.filter((d) => d.tag === "MISSING").length === 0 ? <li>No bottlenecks flagged</li> : null}
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-[#8a6713] font-mono text-[10px] uppercase tracking-wider mb-2">
              <Shield className="w-3.5 h-3.5" /> Most Urgent Risks
            </div>
            <ol className="text-xs text-ink/80 space-y-1.5 list-decimal list-inside">
              {(diagnosis.filter((d) => d.tag === "RISK" || d.tag === "CONSTRAINT").flatMap((d) => d.bullets.slice(0, 1)).slice(0, 5)).map((b, i) => <li key={i}>{b}</li>)}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
