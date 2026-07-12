import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Sparkles, Loader2, ShieldAlert, ShieldCheck, XCircle, RefreshCcw } from "lucide-react";
import { WORKSPACE_STEPS } from "@/lib/engine-workspace";
import {
  getCeremonySummary,
  type CeremonyBadgeState,
  type CeremonySpineSummary,
} from "@/lib/engine-spine-ceremonies.functions";
import { cn } from "@/lib/utils";

type BadgeStyle = {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const BADGE_STYLES: Record<Exclude<CeremonyBadgeState, "none">, BadgeStyle> = {
  in_progress: {
    label: "Ceremony open",
    className: "border-royal/40 bg-royal/10 text-royal",
    Icon: Loader2,
  },
  stale: {
    label: "Ceremony stale",
    className: "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]",
    Icon: ShieldAlert,
  },
  completed: {
    label: "Approved",
    className: "border-[#c9e6d3] bg-[#e9f5ee] text-[#1f6b3b]",
    Icon: ShieldCheck,
  },
  re_review: {
    label: "Re-review required",
    className: "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]",
    Icon: RefreshCcw,
  },
  abandoned: {
    label: "Abandoned",
    className: "border-border bg-white text-ink/60",
    Icon: XCircle,
  },
};

function CeremonyBadge({ summary }: { summary: CeremonySpineSummary }) {
  if (summary.badge === "none") return null;
  const s = BADGE_STYLES[summary.badge];
  if (!s) return null;
  const title =
    summary.badge === "stale" && summary.stale_reason
      ? `${s.label} — ${summary.stale_reason}`
      : s.label;
  return (
    <div
      title={title}
      data-qa-ceremony-badge={summary.spine}
      data-qa-ceremony-state={summary.badge}
      className={cn(
        "mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider",
        s.className,
      )}
    >
      <s.Icon
        className={cn("w-2.5 h-2.5", summary.badge === "in_progress" && "animate-spin")}
      />
      <span className="leading-none">{s.label}</span>
    </div>
  );
}

export function WorkspaceStepper({
  projectId,
  currentStepNum,
}: {
  projectId: string;
  currentStepNum: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const spineActive = pathname.endsWith("/spine");

  const fetchSummary = useServerFn(getCeremonySummary);
  const { data: summaryData } = useQuery({
    queryKey: ["engine", "ceremony-summary", projectId],
    queryFn: async () => {
      const res = await fetchSummary({ data: { projectId } });
      return (res as { summary: Record<"point-a" | "point-b", CeremonySpineSummary> }).summary;
    },
    staleTime: 30_000,
  });

  const badgeFor = (key: string): CeremonySpineSummary | null => {
    if (!summaryData) return null;
    if (key === "point-a") return summaryData["point-a"];
    if (key === "point-b") return summaryData["point-b"];
    return null;
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm scroll-strip">
      <div className="px-4 sm:px-5 py-5 sm:py-6 flex items-center gap-2 min-w-max">
        <div className="pr-4 border-r border-border mr-2 snap-start">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Roadmap Workflow
          </div>
          <div className="text-[11px] text-ink/60 mt-1">14 steps for this project</div>
          <Link
            to="/engine/projects/$projectId/spine"
            params={{ projectId }}
            className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest transition",
              spineActive
                ? "border-royal bg-royal text-white"
                : "border-royal/30 text-royal hover:bg-royal/5",
            )}
          >
            <Sparkles className="w-3 h-3" /> Project Spine
          </Link>
        </div>

        {WORKSPACE_STEPS.map((s, i) => {
          const to = s.to;
          const isActive = pathname.endsWith(`/${s.key}`);
          const isDone = s.num < currentStepNum;
          const isCurrent = s.num === currentStepNum;
          const summary = badgeFor(s.key);
          return (
            <div key={s.key} className="flex items-center snap-start">
              <Link
                to={to}
                params={{ projectId }}
                className={cn(
                  "flex flex-col items-center gap-2 px-2 py-1 group",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 transition",
                    isActive
                      ? "bg-royal text-white border-royal shadow"
                      : isDone
                        ? "bg-[#1f6b3b] text-white border-[#1f6b3b]"
                        : isCurrent
                          ? "bg-royal text-white border-royal"
                          : "bg-white text-ink/50 border-border group-hover:border-royal/50",
                  )}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <div
                  className={cn(
                    "text-[10px] leading-tight text-center max-w-[74px]",
                    isActive || isCurrent ? "text-ink font-medium" : "text-ink/60",
                  )}
                >
                  {s.label}
                </div>
                {summary ? <CeremonyBadge summary={summary} /> : null}
              </Link>
              {i < WORKSPACE_STEPS.length - 1 ? (
                <div
                  className={cn(
                    "w-6 h-px",
                    s.num < currentStepNum ? "bg-[#1f6b3b]/60" : "bg-border",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
