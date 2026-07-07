import { Link, useRouterState } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { WORKSPACE_STEPS } from "@/lib/engine-workspace";
import { cn } from "@/lib/utils";

export function WorkspaceStepper({
  projectId,
  currentStepNum,
}: {
  projectId: string;
  currentStepNum: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm scroll-strip">
      <div className="px-4 sm:px-5 py-5 sm:py-6 flex items-center gap-2 min-w-max">
        <div className="pr-4 border-r border-border mr-2 snap-start">

          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">
            Roadmap Workflow
          </div>
          <div className="text-[11px] text-ink/60 mt-1">14 steps for this project</div>
        </div>
        {WORKSPACE_STEPS.map((s, i) => {
          const to = s.to;
          const isActive = pathname.endsWith(`/${s.key}`);
          const isDone = s.num < currentStepNum;
          const isCurrent = s.num === currentStepNum;
          return (
            <div key={s.key} className="flex items-center">
              <Link
                to={to}
                params={{ projectId }}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-1.5 group",
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
