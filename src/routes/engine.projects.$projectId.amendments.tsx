import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Clock, ArrowLeft } from "lucide-react";
import {
  listRoadmapAmendments,
  decideRoadmapAmendment,
  type RoadmapAmendment,
} from "@/lib/engine-roadmap-amendments.functions";

export const Route = createFileRoute("/engine/projects/$projectId/amendments")({
  head: () => ({
    meta: [
      { title: "Roadmap Amendments · Engine" },
      { name: "description", content: "Review proposed changes to approved roadmap truth." },
    ],
  }),
  component: AmendmentsRoute,
});

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function AmendmentsRoute() {
  const { projectId } = Route.useParams();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const list = useServerFn(listRoadmapAmendments);
  const decide = useServerFn(decideRoadmapAmendment);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["amendments", projectId, filter],
    queryFn: () => list({ data: { projectId, status: filter } }),
  });

  const mutation = useMutation({
    mutationFn: async (args: { amendmentId: string; decision: "approve" | "reject"; reason?: string }) =>
      decide({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["amendments", projectId] }),
  });

  const rows = query.data ?? [];

  return (
    <div className="engine-theme mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link
            to="/engine/projects/$projectId/roadmap"
            params={{ projectId }}
            search={{ view: "flow" }}
            className="mb-1 inline-flex items-center gap-1 text-xs text-[#3E68B2] hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to roadmap
          </Link>
          <h1 className="text-xl font-semibold text-[#0A0F1F]">Roadmap Amendments</h1>
          <p className="mt-1 text-sm text-[#667085]">
            New intelligence that would touch approved truth is queued here. A second reviewer must
            approve before any downstream step regenerates.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[#E8E1D6] bg-white p-1 text-xs">
          {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={
                filter === s
                  ? "rounded bg-[#eef3fd] px-3 py-1 font-medium text-[#3E68B2]"
                  : "rounded px-3 py-1 text-[#667085] hover:bg-[#F5EFE4]"
              }
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-[#E8E1D6] bg-white p-8 text-center text-sm text-[#667085]">
          Loading amendments…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E8E1D6] bg-white p-8 text-center text-sm text-[#667085]">
          No {filter === "all" ? "" : filter} amendments.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <AmendmentCard
              key={a.id}
              amendment={a}
              onDecide={(decision, reason) =>
                mutation.mutate({ amendmentId: a.id, decision, reason })
              }
              pending={mutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AmendmentCard({
  amendment,
  onDecide,
  pending,
}: {
  amendment: RoadmapAmendment;
  onDecide: (decision: "approve" | "reject", reason?: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);
  const p = amendment.payload;
  const isPending = amendment.status === "pending";

  const StatusIcon = statusIcon(amendment.status);

  return (
    <li className="rounded-xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-4 w-4 text-[#667085]" />
            <span className="rounded bg-[#F5EFE4] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#667085]">
              {p.target?.spine ?? "—"} · {p.target?.fieldKey ?? "—"}
            </span>
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {p.impact ?? amendment.materiality ?? "material"}
            </span>
            <span className="text-[11px] text-[#667085]">
              confidence {Math.round((p.confidence ?? 0.5) * 100)}%
            </span>
          </div>
          <p className="mt-2 text-sm text-[#0A0F1F]">{p.rationale}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
            <span>Proposed by {p.actorEmail ?? "system"}</span>
            <span>{formatDate(amendment.createdAt)}</span>
            {amendment.reviewerEmail ? (
              <span>
                Decided by {amendment.reviewerEmail} · {formatDate(amendment.reviewedAt)}
              </span>
            ) : null}
          </div>
          {amendment.decisionReason ? (
            <p className="mt-2 rounded border border-[#E8E1D6] bg-[#FBF9F4] px-2 py-1 text-xs text-[#0A0F1F]">
              <span className="font-medium">Reviewer note:</span> {amendment.decisionReason}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs text-[#3E68B2] hover:underline"
      >
        {expanded ? "Hide" : "Show"} before/after
      </button>
      {expanded ? (
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <pre className="max-h-56 overflow-auto rounded border border-[#E8E1D6] bg-[#FBF9F4] p-2 text-[11px] text-[#0A0F1F]">
            {JSON.stringify(p.before ?? null, null, 2)}
          </pre>
          <pre className="max-h-56 overflow-auto rounded border border-[#E8E1D6] bg-[#eef3fd] p-2 text-[11px] text-[#0A0F1F]">
            {JSON.stringify(p.after ?? null, null, 2)}
          </pre>
        </div>
      ) : null}

      {isPending ? (
        <div className="mt-3 space-y-2 border-t border-[#F0EAE0] pt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reviewer note (optional)"
            rows={2}
            className="w-full rounded-md border border-[#E8E1D6] bg-white px-2 py-1.5 text-xs text-[#0A0F1F] placeholder:text-[#98A2B3] focus:border-[#3E68B2] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onDecide("reject", reason || undefined)}
              className="rounded-md border border-[#E8E1D6] bg-white px-3 py-1.5 text-xs font-medium text-[#B42318] hover:bg-red-50 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onDecide("approve", reason || undefined)}
              className="rounded-md bg-[#3E68B2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#345aa0] disabled:opacity-50"
            >
              Approve amendment
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function statusIcon(status: RoadmapAmendment["status"]) {
  if (status === "approved") return CheckCircle2;
  if (status === "rejected") return XCircle;
  if (status === "superseded") return AlertTriangle;
  return Clock;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
