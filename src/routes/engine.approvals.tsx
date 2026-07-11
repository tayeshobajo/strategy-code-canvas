import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listReviewQueue } from "@/lib/engine-ops.functions";
import type { ReviewItem } from "@/lib/engine-ops.functions";
import { formatDate } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/engine/approvals")({
  component: ApprovalsQueue,
});

type ImpactFilter = "all" | "high" | "medium" | "low";
type TypeFilter = "all" | "roadmap" | "mockup" | "specification" | "plan" | "evidence";

const IMPACT_BORDER: Record<string, string> = {
  high: "border-l-[#C47A5A]",
  medium: "border-l-[#D4A843]",
  low: "border-l-[#3E68B2]",
};

const IMPACT_BADGE: Record<string, string> = {
  high: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
  medium: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  low: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]",
};

function ApprovalsQueue() {
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [groupByProject, setGroupByProject] = useState(false);

  const fn = useServerFn(listReviewQueue);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["engine", "approvals"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  const allItems: ReviewItem[] = (data?.items ?? []).filter(
    (i) => i.status === "pending" && !dismissed.has(i.id),
  );

  const filtered = allItems.filter((i) => {
    if (impactFilter !== "all" && i.impact !== impactFilter) return false;
    if (typeFilter !== "all" && !i.item_type.toLowerCase().includes(typeFilter)) return false;
    return true;
  });

  const counts = {
    total: allItems.length,
    high: allItems.filter((i) => i.impact === "high").length,
    medium: allItems.filter((i) => i.impact === "medium").length,
    low: allItems.filter((i) => i.impact === "low").length,
  };

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (expandedId === id) setExpandedId(null);
  }

  let groups: Array<{ label: string; items: ReviewItem[] }> = [];
  if (groupByProject) {
    const map = new Map<string, ReviewItem[]>();
    for (const item of filtered) {
      const key = item.project || "Unknown Project";
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(item);
    }
    groups = Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  } else {
    groups = [{ label: "", items: filtered }];
  }

  const impactTabs: Array<{ key: ImpactFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.total },
    { key: "high", label: "High Impact", count: counts.high },
    { key: "medium", label: "Medium", count: counts.medium },
    { key: "low", label: "Low", count: counts.low },
  ];

  const typeTabs: Array<{ key: TypeFilter; label: string }> = [
    { key: "all", label: "All Types" },
    { key: "roadmap", label: "Roadmap" },
    { key: "mockup", label: "Mockup" },
    { key: "specification", label: "Specification" },
    { key: "plan", label: "Plan" },
    { key: "evidence", label: "Evidence" },
  ];

  return (
    <div className="max-w-[1200px] space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#3E68B2]">
            Roadmap Engine
          </div>
          <h1 className="mt-1 font-display text-3xl text-[#0A0F1F]">Approvals</h1>
          <p className="mt-1 text-sm text-[#667085]">
            {counts.total === 0
              ? "All caught up — nothing pending."
              : `${counts.total} item${counts.total === 1 ? "" : "s"} need${counts.total === 1 ? "s" : ""} your decision.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGroupByProject((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs transition",
              groupByProject
                ? "border-[#0A0F1F] bg-[#0A0F1F] text-[#FBF9F4]"
                : "border-[#E8E1D6] text-[#667085] hover:bg-[#F5F3EF]",
            )}
          >
            Group by project
          </button>
          <button
            onClick={() => void refetch()}
            className="rounded-lg border border-[#E8E1D6] px-3 py-1.5 text-xs text-[#667085] transition hover:bg-[#F5F3EF]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8E1D6] px-3 py-1 text-xs font-medium text-[#0A0F1F]">
          {counts.total} total
        </span>
        {counts.high > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe9ec] px-3 py-1 text-xs font-medium text-[#a4283c]">
            {counts.high} high impact
          </span>
        )}
        {counts.medium > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbf3e0] px-3 py-1 text-xs font-medium text-[#8a6713]">
            {counts.medium} medium
          </span>
        )}
        {counts.low > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9eefb] px-3 py-1 text-xs font-medium text-[#2842a4]">
            {counts.low} low
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#E8E1D6] pb-3">
        {impactTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setImpactFilter(tab.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition",
              impactFilter === tab.key ? "bg-[#0A0F1F] text-[#FBF9F4]" : "text-[#667085] hover:bg-[#F5F3EF]",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  "ml-1.5 text-xs",
                  impactFilter === tab.key ? "opacity-70" : "opacity-50",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <span className="mx-2 text-[#E8E1D6]">|</span>
        {typeTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition",
              typeFilter === tab.key ? "bg-[#3E68B2] text-white" : "text-[#667085] hover:bg-[#F5F3EF]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[#E8E1D6]" />
          ))}
        </div>
      ) : counts.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle className="mb-4 h-12 w-12 text-[#1f6b3b]" />
          <div className="font-display text-2xl text-[#0A0F1F]">All clear</div>
          <div className="mt-2 text-[#667085]">No approvals pending across your portfolio.</div>
          <Link to="/engine" className="mt-6 text-sm text-[#3E68B2] hover:underline">
            ← Return to Command Center
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#667085]">
          No items match this filter.
          <button
            onClick={() => {
              setImpactFilter("all");
              setTypeFilter("all");
            }}
            className="ml-2 text-[#3E68B2] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              {group.label && (
                <div className="mb-3 px-1 font-mono text-xs uppercase tracking-widest text-[#667085]">
                  {group.label}
                </div>
              )}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-xl border border-[#E8E1D6] border-l-4 bg-white transition",
                        IMPACT_BORDER[item.impact] ?? "border-l-[#E8E1D6]",
                      )}
                    >
                      <button
                        className="flex w-full items-center gap-4 px-5 py-4 text-left"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            IMPACT_BADGE[item.impact] ?? IMPACT_BADGE.low,
                          )}
                        >
                          {item.impact}
                        </span>
                        <span className="shrink-0 rounded bg-[#F5F3EF] px-2 py-0.5 text-xs text-[#667085]">
                          {item.item_type}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-[#0A0F1F]">
                          {item.title}
                        </span>
                        {item.project && (
                          <span className="hidden shrink-0 text-xs text-[#667085] sm:block">
                            {item.project}
                          </span>
                        )}
                        <span className="hidden shrink-0 text-xs text-[#667085] md:block">
                          {formatDate(item.created_at)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-[#667085]" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-[#667085]" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 border-t border-[#E8E1D6] px-5 pb-5 pt-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-widest text-[#667085]">
                                Type
                              </span>
                              <div className="mt-0.5 capitalize text-[#0A0F1F]">{item.item_type}</div>
                            </div>
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-widest text-[#667085]">
                                Created
                              </span>
                              <div className="mt-0.5 text-[#0A0F1F]">{formatDate(item.created_at)}</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            <button
                              onClick={() => dismiss(item.id)}
                              className="rounded-lg bg-[#1f6b3b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#185a32]"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => dismiss(item.id)}
                              className="rounded-lg bg-[#8a6713] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#715610]"
                            >
                              ↩ Request Revision
                            </button>
                            <button
                              onClick={() => dismiss(item.id)}
                              className="rounded-lg bg-[#a4283c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8a2132]"
                            >
                              ✗ Reject
                            </button>
                            <button className="rounded-lg border border-[#E8E1D6] px-4 py-2 text-sm text-[#667085] transition hover:bg-[#F5F3EF]">
                              💬 Ask Question
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
