import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FolderKanban,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { EmptyState, MetricCard, SectionCard } from "@/components/engine/primitives";
import { decideReviewItem, listReviewQueue, type ReviewItem } from "@/lib/engine-ops.functions";
import { ReviewRiskInputsEditor } from "@/components/engine/ReviewRiskInputsEditor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/engine/approvals")({
  component: ApprovalsQueue,
});

type DecisionAction = "approved" | "sent_back" | "rejected";

type QueueFilter = "all" | "high" | "medium" | "low" | "roadmap" | "mockup" | "plan";

const NAVY = "#0A0F1F";
const CREAM = "#FBF9F4";
const BLUE = "#3E68B2";
const STONE = "#E8E1D6";

const FILTERS: Array<{ key: QueueFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "roadmap", label: "Roadmap" },
  { key: "mockup", label: "Mockup" },
  { key: "plan", label: "Plan" },
];

function ApprovalsQueue() {
  const queueFn = useServerFn(listReviewQueue);
  const decideFn = useServerFn(decideReviewItem);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["engine", "global-approvals-queue"],
    queryFn: () => queueFn(),
  });
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [groupByProject, setGroupByProject] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const decideMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: DecisionAction }) =>
      decideFn({ data: { id, action } }),
    onMutate: ({ id }) => {
      setPendingActionId(id);
    },
    onSuccess: (_res, { action }) => {
      const label =
        action === "approved" ? "Approved" : action === "rejected" ? "Rejected" : "Revision requested";
      toast.success(label);
      queryClient.invalidateQueries({ queryKey: ["engine", "global-approvals-queue"] });
      queryClient.invalidateQueries({ queryKey: ["engine"] });
      setExpandedItemId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to record decision");
    },
    onSettled: () => {
      setPendingActionId(null);
    },
  });

  const items = data?.items ?? [];
  const visibleItems = items;
  const filteredItems = useMemo(
    () => visibleItems.filter((item) => matchesFilter(item, filter)),
    [filter, visibleItems],
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ReviewItem[]>();
    for (const item of filteredItems) {
      const key = item.project || "Unassigned";
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const pendingCount = visibleItems.filter((item) => item.status === "pending" || item.status === "in_review").length;
  const highImpactCount = visibleItems.filter((item) => item.impact === "high").length;
  const projectCount = new Set(visibleItems.map((item) => item.project)).size;
  const filteredCount = filteredItems.length;

  const onDecide = (id: string, action: DecisionAction) => {
    if (decideMutation.isPending) return;
    decideMutation.mutate({ id, action });
  };

  return (
    <div className="max-w-[1400px]" style={{ color: NAVY }}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: BLUE }}>
            Global Workflow
          </div>
          <h1 className="mt-1 font-display text-4xl" style={{ color: NAVY }}>
            Approvals Queue
          </h1>
          <p className="mt-2 max-w-3xl text-sm sm:text-base" style={{ color: "rgba(10, 15, 31, 0.68)" }}>
            One place to review roadmap, mockup, and plan decisions across every active project.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-3 self-start rounded-xl border px-4 py-3 text-sm"
          style={{ backgroundColor: CREAM, borderColor: STONE }}
        >
          <ClipboardCheck className="h-4 w-4" style={{ color: BLUE }} />
          <span>{isLoading ? "Loading live queue..." : `${filteredCount} items in view`}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Awaiting" value={pendingCount} hint="Pending or in review" tone="blue" />
        <MetricCard label="High Impact" value={highImpactCount} hint="Urgent approvals" tone="red" />
        <MetricCard label="Projects" value={projectCount} hint="Represented in queue" tone="orange" />
        <MetricCard label="Filtered" value={filteredCount} hint="Current tab result" tone="green" />
      </div>

      <SectionCard
        title="Queue Controls"
        className="mt-6"
        right={
          <label className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em]" style={{ color: "rgba(10, 15, 31, 0.6)" }}>
            <input
              type="checkbox"
              checked={groupByProject}
              onChange={(event) => setGroupByProject(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Group by project
          </label>
        }
      >
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((tab) => {
            const count = visibleItems.filter((item) => matchesFilter(item, tab.key)).length;
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "text-white" : "hover:border-current",
                )}
                style={{
                  backgroundColor: active ? NAVY : CREAM,
                  borderColor: active ? NAVY : STONE,
                  color: active ? CREAM : NAVY,
                }}
              >
                <span>{tab.label}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-mono"
                  style={{
                    backgroundColor: active ? "rgba(251, 249, 244, 0.16)" : STONE,
                    color: active ? CREAM : NAVY,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title={groupByProject ? "Approvals by project" : "All approval items"}
        className="mt-6"
        right={
          <div className="inline-flex items-center gap-2 text-xs" style={{ color: "rgba(10, 15, 31, 0.6)" }}>
            <FolderKanban className="h-3.5 w-3.5" />
            {groupByProject ? `${groupedItems.length} groups` : `${filteredItems.length} cards`}
          </div>
        }
      >
        {filteredItems.length === 0 ? (
          <EmptyState
            title={visibleItems.length === 0 ? "No approvals waiting" : "No items match this filter"}
            hint={visibleItems.length === 0 ? "Approve flow is clear for now." : "Try another tab or restore dismissed items by refreshing."}
          />
        ) : groupByProject ? (
          <div className="space-y-6">
            {groupedItems.map(([project, projectItems]) => (
              <div key={project} className="space-y-3">
                <div className="flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: STONE }}>
                  <div>
                    <h3 className="font-display text-xl" style={{ color: NAVY }}>
                      {project}
                    </h3>
                    <p className="text-xs" style={{ color: "rgba(10, 15, 31, 0.56)" }}>
                      {projectItems.length} item{projectItems.length === 1 ? "" : "s"} in this queue
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: BLUE }}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {projectItems.filter((item) => item.impact === "high").length} high impact
                  </div>
                </div>
                <div className="space-y-3">
                  {projectItems.map((item) => renderItemCard(item, expandedItemId, setExpandedItemId, onDecide, pendingActionId, decideMutation.isPending))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => renderItemCard(item, expandedItemId, setExpandedItemId, onDecide, pendingActionId, decideMutation.isPending))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function renderItemCard(
  item: ReviewItem,
  expandedItemId: string | null,
  setExpandedItemId: (id: string | null) => void,
  onDecide: (id: string, action: DecisionAction) => void,
  pendingActionId: string | null,
  isPending: boolean,
) {
  const busy = isPending && pendingActionId === item.id;
  const expanded = expandedItemId === item.id;
  const borderColor = impactBorder(item.impact);
  const requestedAt = new Date(item.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article
      key={item.id}
      className="rounded-2xl border-l-4 border border-r border-t border-b bg-white shadow-sm"
      style={{ borderLeftColor: borderColor, borderTopColor: STONE, borderRightColor: STONE, borderBottomColor: STONE }}
    >
      <button
        type="button"
        onClick={() => setExpandedItemId(expanded ? null : item.id)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em]"
              style={{ backgroundColor: CREAM, color: BLUE }}
            >
              {bucketLabel(item)}
            </span>
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em]"
              style={{ borderColor: STONE, color: "rgba(10, 15, 31, 0.65)" }}
            >
              {item.status.replace("_", " ")}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold" style={{ color: NAVY }}>
            {item.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: "rgba(10, 15, 31, 0.62)" }}>
            <span>{item.project}</span>
            <span>{item.item_type}</span>
            <span>{requestedAt}</span>
          </div>
        </div>
        <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: CREAM, color: NAVY }}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded ? (
        <div className="border-t px-5 py-4" style={{ borderColor: STONE, backgroundColor: CREAM }}>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Project" value={item.project} />
            <Detail label="Impact" value={item.impact} />
            <Detail label="Requested By" value={item.requested_by ?? "Unknown"} />
            <Detail label="Source" value={item.source ?? "Not provided"} />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton
              label="Approve"
              icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              tone="approve"
              disabled={busy}
              onClick={() => onDecide(item.id, "approved")}
            />
            <ActionButton
              label="Request Revision"
              icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              tone="revision"
              disabled={busy}
              onClick={() => onDecide(item.id, "sent_back")}
            />
            <ActionButton
              label="Reject"
              icon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              tone="reject"
              disabled={busy}
              onClick={() => onDecide(item.id, "rejected")}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: "rgba(10, 15, 31, 0.52)" }}>
        {label}
      </dt>
      <dd className="mt-1 text-sm" style={{ color: NAVY }}>
        {value}
      </dd>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  tone: "approve" | "revision" | "reject";
  onClick: () => void;
  disabled?: boolean;
}) {
  const styles = {
    approve: { backgroundColor: NAVY, borderColor: NAVY, color: CREAM },
    revision: { backgroundColor: "#FFF4DE", borderColor: "#F2D39A", color: "#8A5A00" },
    reject: { backgroundColor: "#FDEBEC", borderColor: "#F3C4C8", color: "#A33A45" },
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      style={styles[tone]}
    >
      {icon}
      {label}
    </button>
  );
}

function matchesFilter(item: ReviewItem, filter: QueueFilter) {
  if (filter === "all") return true;
  if (filter === "high" || filter === "medium" || filter === "low") return item.impact === filter;

  const text = `${item.item_type} ${item.title} ${item.source ?? ""}`.toLowerCase();

  if (filter === "roadmap") {
    return text.includes("roadmap") || text.includes("version");
  }
  if (filter === "mockup") {
    return text.includes("mockup") || text.includes("preview") || text.includes("client preview");
  }
  return (
    text.includes("plan") ||
    text.includes("brief") ||
    text.includes("milestone") ||
    text.includes("delivery") ||
    text.includes("investment") ||
    text.includes("agent")
  );
}

function bucketLabel(item: ReviewItem) {
  if (matchesFilter(item, "roadmap")) return "Roadmap";
  if (matchesFilter(item, "mockup")) return "Mockup";
  if (matchesFilter(item, "plan")) return "Plan";
  return item.impact;
}

function impactBorder(impact: ReviewItem["impact"]) {
  if (impact === "high") return "#C94B4B";
  if (impact === "medium") return "#D7A64A";
  return BLUE;
}
