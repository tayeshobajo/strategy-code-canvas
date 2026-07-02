import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Eye, AlertTriangle, Clock } from "lucide-react";

export const Route = createFileRoute("/engine/review")({
  component: ReviewApprovalsPage,
});

type Impact = "high" | "medium" | "low";
type ItemType =
  | "Roadmap Update"
  | "Version Change"
  | "Milestone Brief"
  | "Client Preview"
  | "Investment Change"
  | "Delivery Approval"
  | "Agent Permission";

type ReviewItem = {
  id: string;
  project: string;
  type: ItemType;
  title: string;
  impact: Impact;
  source: string;
  requestedBy: string;
  createdAt: string;
  status: "pending" | "in_review";
};

const ITEMS: ReviewItem[] = [
  { id: "r1", project: "Mental Dental Academy", type: "Version Change", title: "Roadmap v1.2 → v1.3 (Q-Bank scope revision)", impact: "high", source: "Agent draft", requestedBy: "Agent (auto)", createdAt: "2025-06-30T09:14:00Z", status: "pending" },
  { id: "r2", project: "Gradient Group", type: "Milestone Brief", title: "Job Board Growth Engine — Phase 2 brief", impact: "medium", source: "Milestone Workspace", requestedBy: "Tai Shobajo", createdAt: "2025-06-30T08:02:00Z", status: "in_review" },
  { id: "r3", project: "SBREADS", type: "Investment Change", title: "Range shift $180k → $220k top-end", impact: "high", source: "Investment Builder", requestedBy: "Agent (auto)", createdAt: "2025-06-29T18:41:00Z", status: "pending" },
  { id: "r4", project: "Thriving Minds AZ", type: "Client Preview", title: "Preview copy update — Phase 1 outcomes", impact: "low", source: "Client Preview editor", requestedBy: "Tai Shobajo", createdAt: "2025-06-29T14:17:00Z", status: "pending" },
  { id: "r5", project: "Temple Emanu-El", type: "Delivery Approval", title: "Event & Community Hub v1.0 → ready to send", impact: "high", source: "Delivery Prep", requestedBy: "Tai Shobajo", createdAt: "2025-06-29T10:55:00Z", status: "pending" },
  { id: "r6", project: "SpaExecutive", type: "Roadmap Update", title: "Sequencing: swap Phase 2 & 3", impact: "medium", source: "Sequencing view", requestedBy: "Agent (auto)", createdAt: "2025-06-28T16:12:00Z", status: "pending" },
  { id: "r7", project: "BuildRight Systems", type: "Agent Permission", title: "Request: enable 'Execute approved actions'", impact: "high", source: "Agent Permissions", requestedBy: "Agent (auto)", createdAt: "2025-06-28T11:03:00Z", status: "pending" },
  { id: "r8", project: "Elevate Coaching", type: "Milestone Brief", title: "Onboarding Engine — acceptance criteria", impact: "low", source: "Milestone Workspace", requestedBy: "Agent (auto)", createdAt: "2025-06-27T15:38:00Z", status: "in_review" },
];

const TYPES: (ItemType | "All")[] = ["All", "Roadmap Update", "Version Change", "Milestone Brief", "Client Preview", "Investment Change", "Delivery Approval", "Agent Permission"];

function ReviewApprovalsPage() {
  const [filter, setFilter] = useState<ItemType | "All">("All");
  const [rows, setRows] = useState(ITEMS);

  const filtered = filter === "All" ? rows : rows.filter((r) => r.type === filter);

  function act(id: string, action: "approve" | "reject") {
    setRows((prev) => prev.filter((r) => r.id !== id));
    console.info("[review]", action, id);
  }

  const pending = rows.filter((r) => r.status === "pending").length;
  const highImpact = rows.filter((r) => r.impact === "high").length;
  const inReview = rows.filter((r) => r.status === "in_review").length;

  return (
    <div className="max-w-[1400px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Workflow</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Review &amp; Approvals</h1>
      <p className="text-ink/60 mb-6">Global queue of items awaiting Tai's approval — roadmap versions, milestone briefs, previews, deliveries, and agent requests.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Pending" value={pending} tone="orange" hint="Awaiting review" />
        <MetricCard label="High Impact" value={highImpact} tone="red" hint="Priority items" />
        <MetricCard label="In Review" value={inReview} tone="blue" hint="Currently open" />
        <MetricCard label="Median Wait" value="6h" tone="default" hint="This week" />
      </div>

      <SectionCard
        title="Approval Queue"
        right={
          <div className="flex flex-wrap gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-md border",
                  filter === t ? "bg-ink text-white border-ink" : "border-border text-ink/70 hover:border-royal/50",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-ink/50">
            <CheckCircle2 className="w-10 h-10 mx-auto text-[#1f6b3b] mb-2" />
            <div className="font-display text-lg text-ink">All caught up</div>
            <div className="text-sm">No items match this filter.</div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Impact</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Requested By</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-paper-soft/40">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{r.project}</div>
                      <div className="text-xs text-ink/60">{r.title}</div>
                    </td>
                    <td className="px-3 py-3 text-ink/80 whitespace-nowrap">{r.type}</td>
                    <td className="px-3 py-3"><ImpactBadge impact={r.impact} /></td>
                    <td className="px-3 py-3 text-ink/70 whitespace-nowrap">{r.source}</td>
                    <td className="px-3 py-3 text-ink/70 whitespace-nowrap">{r.requestedBy}</td>
                    <td className="px-3 py-3 text-ink/60 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
                        r.status === "pending" ? "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]" : "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]")}>
                        {r.status === "pending" ? <Clock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {r.status === "pending" ? "Pending" : "In review"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="inline-flex items-center gap-1 text-xs border border-border rounded px-2 py-1 hover:border-royal/50 text-ink"><Eye className="w-3 h-3" />Review</button>
                        <button onClick={() => act(r.id, "approve")} className="inline-flex items-center gap-1 text-xs bg-[#1f6b3b] text-white rounded px-2 py-1 hover:bg-[#164d2b]"><CheckCircle2 className="w-3 h-3" />Approve</button>
                        <button onClick={() => act(r.id, "reject")} className="inline-flex items-center gap-1 text-xs border border-[#f3ced5] text-[#a4283c] rounded px-2 py-1 hover:bg-[#fbe9ec]"><XCircle className="w-3 h-3" />Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const style = impact === "high" ? "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]"
    : impact === "medium" ? "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]"
    : "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border capitalize", style)}>
      {impact === "high" ? <AlertTriangle className="w-3 h-3" /> : null}
      {impact}
    </span>
  );
}
