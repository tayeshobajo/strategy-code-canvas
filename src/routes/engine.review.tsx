import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Eye, AlertTriangle, Clock, X, RotateCcw, Loader2 } from "lucide-react";
import { listReviewQueue, decideReviewItem, type ReviewItem } from "@/lib/engine-ops.functions";

export const Route = createFileRoute("/engine/review")({
  component: ReviewApprovalsPage,
});

const SOURCE_ROUTE: Record<string, string> = {
  "Roadmap Update": "Roadmap builder",
  "Version Change": "Versions · compare view",
  "Milestone Brief": "Milestone workspace",
  "Client Preview": "Client-facing preview editor",
  "Investment Change": "Investment builder",
  "Delivery Approval": "Delivery prep",
  "Agent Permission": "Agent permissions",
};

const TYPES = ["All", "Roadmap Update", "Version Change", "Milestone Brief", "Client Preview", "Investment Change", "Delivery Approval", "Agent Permission"];

const reviewQO = queryOptions({
  queryKey: ["engine", "reviews"],
  queryFn: () => listReviewQueue(),
});

function ReviewApprovalsPage() {
  const [filter, setFilter] = useState<string>("All");
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(reviewQO);
  const decideFn = useServerFn(decideReviewItem);
  const decide = useMutation({
    mutationFn: (v: { id: string; action: "approved" | "sent_back"; reason?: string }) => decideFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine", "reviews"] }),
  });

  const rows = data?.items ?? [];
  const audit = data?.audit ?? [];
  const filtered = rows.filter((r) => (r.status === "pending" || r.status === "in_review") && (filter === "All" || r.item_type === filter));
  const pending = rows.filter((r) => r.status === "pending").length;
  const highImpact = rows.filter((r) => r.impact === "high" && (r.status === "pending" || r.status === "in_review")).length;
  const inReview = rows.filter((r) => r.status === "in_review").length;
  const sentBack = audit.filter((a) => a.action === "sent_back").length;

  return (
    <div className="max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Workflow</div>
          <h1 className="font-display text-4xl text-ink mt-1 mb-2">Review &amp; Approvals</h1>
          <p className="text-ink/60 mb-6">Approve items or send them back to their source view — every decision is saved to audit history.</p>
        </div>
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-ink/40 mt-2" /> : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Pending" value={pending} tone="orange" hint="Awaiting review" />
        <MetricCard label="High Impact" value={highImpact} tone="red" hint="Priority items" />
        <MetricCard label="In Review" value={inReview} tone="blue" hint="Currently open" />
        <MetricCard label="Sent Back" value={sentBack} tone="purple" hint="All-time" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <SectionCard
          title="Approval Queue"
          right={
            <div className="flex flex-wrap gap-1">
              {TYPES.map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={cn("text-[11px] px-2.5 py-1 rounded-md border",
                    filter === t ? "bg-ink text-white border-ink" : "border-border text-ink/70 hover:border-royal/50")}>
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
                      <td className="px-3 py-3 text-ink/80 whitespace-nowrap">{r.item_type}</td>
                      <td className="px-3 py-3"><ImpactBadge impact={r.impact} /></td>
                      <td className="px-3 py-3 text-ink/70 whitespace-nowrap">
                        <div>{r.requested_by}</div>
                        <div className="text-xs text-ink/50">{new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
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
                          <button disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, action: "approved" })}
                            className="inline-flex items-center gap-1 text-xs bg-[#1f6b3b] text-white rounded px-2 py-1 hover:bg-[#164d2b] disabled:opacity-40">
                            <CheckCircle2 className="w-3 h-3" />Approve
                          </button>
                          <button onClick={() => setRejecting(r)}
                            className="inline-flex items-center gap-1 text-xs border border-[#f3ced5] text-[#a4283c] rounded px-2 py-1 hover:bg-[#fbe9ec]">
                            <XCircle className="w-3 h-3" />Reject &amp; Return
                          </button>
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
            <div className="text-sm text-ink/50">No approvals or rejections yet.</div>
          ) : (
            <ol className="space-y-3 text-sm max-h-[600px] overflow-y-auto -mr-2 pr-2">
              {audit.map((a) => (
                <li key={a.id} className="border-l-2 pl-3"
                    style={{ borderColor: a.action === "approved" ? "#1f6b3b" : "#a4283c" }}>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-mono uppercase tracking-wider",
                      a.action === "approved" ? "text-[#1f6b3b]" : "text-[#a4283c]")}>
                      {a.action === "approved" ? "Approved" : "Sent back"}
                    </span>
                    <span className="text-xs text-ink/50">{new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  <div className="text-ink font-medium mt-0.5">{a.project}</div>
                  <div className="text-xs text-ink/70">{a.title}</div>
                  {a.action !== "approved" ? (
                    <div className="mt-1.5 rounded bg-paper-soft border border-border p-2 text-xs">
                      <div className="flex items-center gap-1.5 text-ink/70 mb-1">
                        <RotateCcw className="w-3 h-3" /> Routed to <span className="font-medium text-ink">{a.routed_to ?? "source"}</span>
                      </div>
                      {a.reason ? <div className="text-ink/80 italic">"{a.reason}"</div> : null}
                    </div>
                  ) : null}
                  {a.actor ? <div className="text-[10px] text-ink/40 mt-1">by {a.actor}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      {rejecting ? (
        <RejectDialog item={rejecting} onClose={() => setRejecting(null)}
          onSubmit={(reason) => {
            decide.mutate({ id: rejecting.id, action: "sent_back", reason });
            setRejecting(null);
          }} />
      ) : null}
    </div>
  );
}

function RejectDialog({ item, onClose, onSubmit }: { item: ReviewItem; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const routedTo = SOURCE_ROUTE[item.item_type] ?? "source view";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-display text-lg text-ink">Reject &amp; return</div>
            <div className="text-xs text-ink/60">{item.project} · {item.item_type}</div>
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
            <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
              placeholder="What needs to change before this can be approved?"
              className="mt-1 w-full text-sm border border-border rounded-md p-2 focus:outline-none focus:border-royal" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-border text-ink/70">Cancel</button>
            <button onClick={() => onSubmit(reason.trim())} disabled={reason.trim().length < 3}
              className="text-xs px-3 py-1.5 rounded bg-[#a4283c] text-white hover:bg-[#8a2033] disabled:opacity-40 disabled:cursor-not-allowed">
              Send back to {routedTo}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" }) {
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
