import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  getProjectCeremonyStatus,
  type CeremonyState,
  type CeremonyStatus,
} from "@/lib/engine-ceremony-status.functions";
import { approveWorldEntry } from "@/lib/engine-world-entry.functions";
import {
  approveExecutionBoundary,
  rejectExecutionBoundary,
} from "@/lib/engine-execution-boundary.functions";
import {
  approveStrategicThesis,
  rejectStrategicThesis,
} from "@/lib/engine-strategic-thesis.functions";
import { approveVersion } from "@/lib/engine-intelligence.functions";
import { useEngineRole } from "@/hooks/useEngineRole";

export const Route = createFileRoute("/engine/projects/$projectId/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · Project" },
      {
        name: "description",
        content:
          "Queue of ceremony-gated approvals for this project — World Entry, Execution Boundary, Strategic Thesis, milestone qualification, and Roadmap v0.1.",
      },
    ],
  }),
  component: ProjectApprovalsRoom,
});

function ProjectApprovalsRoom() {
  const { projectId } = Route.useParams();
  const getStatus = useServerFn(getProjectCeremonyStatus);
  const query = useQuery({
    queryKey: ["ceremony-status", projectId],
    queryFn: () => getStatus({ data: { projectId } }),
  });
  const queryClient = useQueryClient();
  const role = useEngineRole();

  const approveWE = useServerFn(approveWorldEntry);
  const approveEB = useServerFn(approveExecutionBoundary);
  const rejectEB = useServerFn(rejectExecutionBoundary);
  const approveST = useServerFn(approveStrategicThesis);
  const rejectST = useServerFn(rejectStrategicThesis);
  const approveRV = useServerFn(approveVersion);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ceremony-status", projectId] });
    queryClient.invalidateQueries({ queryKey: ["engine"] });
  };

  const mutation = useMutation({
    mutationFn: async (args: {
      ceremony: CeremonyStatus;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      const { ceremony, action, reason } = args;
      if (ceremony.key === "world_entry") {
        if (action === "reject") throw new Error("Use the World Entry room to send back a draft.");
        if (ceremony.version == null) throw new Error("No version to approve.");
        return approveWE({ data: { projectId, version: ceremony.version, reason } });
      }
      if (ceremony.key === "execution_boundary") {
        if (ceremony.version == null) throw new Error("No version to decide.");
        return action === "approve"
          ? approveEB({ data: { projectId, version: ceremony.version, reason } })
          : rejectEB({ data: { projectId, version: ceremony.version, reason: reason ?? "Sent back for revision" } });
      }
      if (ceremony.key === "strategic_thesis") {
        if (ceremony.version == null) throw new Error("No version to decide.");
        return action === "approve"
          ? approveST({ data: { projectId, version: ceremony.version, reason } })
          : rejectST({ data: { projectId, version: ceremony.version, reason: reason ?? "Sent back for revision" } });
      }
      if (ceremony.key === "roadmap_v01") {
        if (action === "reject") throw new Error("Open the Roadmap room to reject a version.");
        if (!ceremony.roadmap_version_id) throw new Error("No roadmap version to approve.");
        return approveRV({ data: { id: ceremony.roadmap_version_id } });
      }
      throw new Error("Open the ceremony room to complete this step.");
    },
    onSuccess: (_r, vars) => {
      toast.success(vars.action === "approve" ? "Approved" : "Sent back");
      invalidate();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Action failed");
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading approvals…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
        Failed to load approvals: {(query.error as Error | null)?.message}
      </div>
    );
  }

  const status = query.data;
  const pct = status.total_count
    ? Math.round((status.completed_count / status.total_count) * 100)
    : 0;

  const pendingKey = mutation.isPending
    ? (mutation.variables?.ceremony.key ?? null)
    : null;

  return (
    <div className="space-y-5" data-qa-role="project-approvals-room">
      <header className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
              Approvals room
            </div>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              Ceremony-gated approvals
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              These five ceremonies move the project from intake to an
              approved Roadmap v0.1. The AI PM can draft; a human must
              approve.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold text-ink tabular-nums">
              {status.completed_count}/{status.total_count}
            </div>
            <div className="text-xs text-muted-foreground">
              {pct}% ceremonies approved
            </div>
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <ol className="space-y-3">
        {status.ceremonies.map((c, idx) => (
          <CeremonyRow
            key={c.key}
            ceremony={c}
            index={idx + 1}
            canApprove={role.canApprove}
            currentEmail={role.email}
            busy={pendingKey === c.key}
            onDecide={(action, reason) =>
              mutation.mutate({ ceremony: c, action, reason })
            }
          />
        ))}
      </ol>
    </div>
  );
}

function CeremonyRow({
  ceremony,
  index,
}: {
  ceremony: CeremonyStatus;
  index: number;
}) {
  const { icon: Icon, tone, label } = stateBadge(ceremony.state);
  const blocked =
    ceremony.blocked_by.length > 0 &&
    ceremony.state !== "approved" &&
    ceremony.state !== "awaiting_review";

  return (
    <li className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="font-mono text-[11px] text-ink/50 mt-0.5 tabular-nums">
            {String(index).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">
                {ceremony.label}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
              {ceremony.version != null && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  v{ceremony.version}
                </span>
              )}
            </div>
            {ceremony.detail && (
              <p className="mt-1 text-xs text-muted-foreground">
                {ceremony.detail}
              </p>
            )}
            {ceremony.updated_at && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Updated {new Date(ceremony.updated_at).toLocaleString()}
                {ceremony.updated_by_email
                  ? ` · ${ceremony.updated_by_email}`
                  : ""}
              </p>
            )}
          </div>
        </div>
        <Link
          to={ceremony.deep_link}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:bg-muted"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {blocked && (
        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          <ShieldAlert className="h-3 w-3" />
          Blocked until: {ceremony.blocked_by.join(", ").replace(/_/g, " ")}
        </div>
      )}

      {ceremony.evidence_required.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
          {ceremony.evidence_required.map((e) => (
            <li key={e} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              {e}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function stateBadge(state: CeremonyState): {
  icon: typeof CheckCircle2;
  tone: string;
  label: string;
} {
  switch (state) {
    case "approved":
      return {
        icon: CheckCircle2,
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        label: "Approved",
      };
    case "awaiting_review":
      return {
        icon: Clock,
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        label: "Awaiting review",
      };
    case "drafted":
      return {
        icon: CircleDashed,
        tone: "border-blue-200 bg-blue-50 text-blue-800",
        label: "Drafted",
      };
    case "rejected":
      return {
        icon: XCircle,
        tone: "border-red-200 bg-red-50 text-red-800",
        label: "Rejected",
      };
    default:
      return {
        icon: CircleDashed,
        tone: "border-border bg-muted text-muted-foreground",
        label: "Not started",
      };
  }
}
