import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Eye, AlertTriangle, Clock, X, RotateCcw } from "lucide-react";

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

const SOURCE_ROUTE: Record<ItemType, string> = {
  "Roadmap Update": "Roadmap builder",
  "Version Change": "Versions · compare view",
  "Milestone Brief": "Milestone workspace",
  "Client Preview": "Client-facing preview editor",
  "Investment Change": "Investment builder",
  "Delivery Approval": "Delivery prep",
  "Agent Permission": "Agent permissions",
};

type ReviewItem = {
  id: string;
  project: string;
  type: ItemType;
  title: string;
  impact: Impact;
  source: string;
  requestedBy: string;
  createdAt: string;
  status: "pending" | "in_review" | "sent_back" | "approved" | "rejected";
};

type AuditEntry = {
  id: string;
  at: string;
  item: ReviewItem;
  action: "approved" | "rejected" | "sent_back";
  reason?: string;
  routedTo?: string;
};

const INITIAL: ReviewItem[] = [
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
  const [rows, setRows] = useState(INITIAL);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);

  const filtered = filter === "All" ? rows.filter((r) => r.status === "pending" || r.status === "in_review") : rows.filter((r) => r.type === filter && (r.status === "pending" || r.status === "in_review"));

  function approve(item: ReviewItem) {
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "approved" } : r)));
    setAudit((prev) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), item, action: "approved" },
      ...prev,
    ]);
  }

  function reject(item: ReviewItem, reason: string) {
    const routedTo = SOURCE_ROUTE[item.type];
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "sent_back" } : r)));
    setAudit((prev) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), item, action: "sent_back", reason, routedTo },
      ...prev,
    ]);
    setRejecting(null);
  }

  const pending = rows.filter((r) => r.status === "pending").length;
  const highImpact = rows.filter((r) => r.impact === "high" && (r.status === "pending" || r.status === "in_review")).length;
  const inReview = rows.filter((r) => r.status === "in_review").length;
  const sentBack = useMemo(() => audit.filter((a) => a.action === "sent_back").length, [audit]);

  return (
    <div className="max-w-[1400px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Workflow</div>
      <h1 className="font-display text-4xl text-ink mt-1 mb-2">Review &amp; Approvals</h1>
      <p className="text-ink/60 mb-6">Approve items or send them back to their source view with a reason — every action is recorded in audit history.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Pending" value={pending} tone="orange" hint="Awaiting review" />
        <MetricCard label="High Impact" value={highImpact} tone="red" hint="Priority items" />
        <MetricCard label="In Review" value={inReview} tone="blue" hint="Currently open" />
        <MetricCard label="Sent Back" value={sentBack} tone="purple" hint="This session" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
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
                    <th className="px-3 py-2.5">Requested</th>
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
                      <td className="px-3 py-3 text-ink/70 whitespace-nowrap">
                        <div>{r.requestedBy}</div>
                        <div className="text-xs text-ink/50">{new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border",
                          r.status === "pending" ? "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]" : "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]")}>
                          {r.status === "pending" ? <Clock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {r.status === "pending" ? "Pending" : "In review"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => approve(r)} className="inline-flex items-center gap-1 text-xs bg-[#1f6b3b] text-white rounded px-2 py-1 hover:bg-[#164d2b]"><CheckCircle2 className="w-3 h-3" />Approve</button>
                          <button onClick={() => setRejecting(r)} className="inline-flex items-center gap-1 text-xs border border-[#f3ced5] text-[#a4283c] rounded px-2 py-1 hover:bg-[#fbe9ec]"><XCircle className="w-3 h-3" />Reject &amp; Return</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Audit History">
          {audit.length === 0 ? (
            <div className="text-sm text-ink/50">No approvals or rejections yet in this session.</div>
          ) : (
            <ol className="space-y-3 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="border-l-2 pl-3" style={{ borderColor: a.action === "approved" ? "#1f6b3b" : "#a4283c" }}>
                  <div className="flex items-center gap-2">
                    {a.action === "approved" ? (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#1f6b3b]">Approved</span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#a4283c]">Sent back</span>
                    )}
                    <span className="text-xs text-ink/50">{new Date(a.at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-ink font-medium mt-0.5">{a.item.project}</div>
                  <div className="text-xs text-ink/70">{a.item.title}</div>
                  {a.action === "sent_back" ? (
                    <div className="mt-1.5 rounded bg-paper-soft border border-border p-2 text-xs">
                      <div className="flex items-center gap-1.5 text-ink/70 mb-1">
                        <RotateCcw className="w-3 h-3" /> Routed to <span className="font-medium text-ink">{a.routedTo}</span>
                      </div>
                      <div className="text-ink/80 italic">"{a.reason}"</div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      {rejecting ? (
        <RejectDialog item={rejecting} onClose={() => setRejecting(null)} onSubmit={(reason) => reject(rejecting, reason)} />
      ) : null}
    </div>
  );
}

function RejectDialog({ item, onClose, onSubmit }: { item: ReviewItem; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const routedTo = SOURCE_ROUTE[item.type];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">Reject &amp; return</div>
            <div className="text-xs text-ink/60">{item.project} · {item.type}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-paper-soft rounded"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-4 space-y-3">
          <div className="rounded-md bg-paper-soft border border-border p-3 text-xs">
            <div className="text-ink/60">This will be sent back to:</div>
            <div className="font-medium text-ink mt-0.5 flex items-center gap-1"><RotateCcw className="w-3 h-3" />{routedTo}</div>
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-ink/60">Reason (required)</label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="What needs to change before this can be approved?"
              className="mt-1 w-full text-sm border border-border rounded-md p-2 focus:outline-none focus:border-royal"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border text-ink/70">Cancel</button>
            <button
              onClick={() => onSubmit(reason.trim())}
              disabled={reason.trim().length < 3}
              className="text-xs px-3 py-1.5 rounded bg-[#a4283c] text-white hover:bg-[#8a2033] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send back to {routedTo}
            </button>
          </div>
        </div>
      </div>
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
