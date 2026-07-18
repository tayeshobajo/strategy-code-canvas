import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Radar,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import {
  listExecutionDriftSignals,
  runExecutionDriftScan,
  decideDriftSignal,
  type DriftSignalRow,
} from "@/lib/engine-execution-drift.functions";

export const Route = createFileRoute("/engine/projects/$projectId/drift")({
  head: () => ({
    meta: [
      { title: "Execution Drift Monitor · Engine" },
      {
        name: "description",
        content:
          "Detects divergence between execution work and approved strategic anchors (thesis, milestone rationale, boundary).",
      },
    ],
  }),
  component: DriftRoute,
});

type StatusFilter = "open" | "acknowledged" | "resolved" | "dismissed" | "all";
type SeverityFilter = "high" | "medium" | "low" | "all";
type AnchorFilter =
  | "thesis"
  | "rationale"
  | "boundary"
  | "capability"
  | "delivery_scope"
  | "all";

function DriftRoute() {
  const { projectId } = Route.useParams();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [anchor, setAnchor] = useState<AnchorFilter>("all");
  const list = useServerFn(listExecutionDriftSignals);
  const scan = useServerFn(runExecutionDriftScan);
  const decide = useServerFn(decideDriftSignal);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["drift", projectId, status, severity, anchor],
    queryFn: () =>
      list({
        data: { projectId, status, severity, anchorKind: anchor },
      }),
  });

  const scanMut = useMutation({
    mutationFn: () => scan({ data: { projectId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drift", projectId] });
      qc.invalidateQueries({ queryKey: ["drift-summary", projectId] });
    },
  });

  const decideMut = useMutation({
    mutationFn: (args: {
      signalId: string;
      decision: "acknowledge" | "resolve" | "dismiss";
      action?: "amend_roadmap" | "update_boundary" | "reject_work" | "reassign" | "ignore" | "other";
      note?: string;
    }) => decide({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drift", projectId] });
      qc.invalidateQueries({ queryKey: ["drift-summary", projectId] });
    },
  });

  const rows = (query.data ?? []) as DriftSignalRow[];

  return (
    <div className="engine-theme mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Link
            to="/engine/projects/$projectId/spine"
            params={{ projectId }}
            className="mb-1 inline-flex items-center gap-1 text-xs text-[#3E68B2] hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Spine
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[#0A0F1F]">
            <Radar className="h-5 w-5 text-[#3E68B2]" /> Execution Drift Monitor
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#667085]">
            Detects when execution (Work, QA, Delivery) diverges from the approved thesis,
            milestone rationale, or capability boundary. Advisory only — nothing is auto-corrected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[#3E68B2] px-3 py-2 text-xs font-medium text-white hover:bg-[#345aa0] disabled:opacity-50"
        >
          {scanMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Run drift scan
        </button>
      </div>

      {scanMut.data ? (
        <div className="mb-3 rounded-md border border-[#E4E9F2] bg-[#eef3fd] px-3 py-2 text-xs text-[#0A0F1F]">
          Last scan · {scanMut.data.inserted} new · {scanMut.data.updated} updated ·{" "}
          {scanMut.data.highSeverity} high-severity · scopes:{" "}
          {scanMut.data.scoped.join(", ")}
        </div>
      ) : null}
      {scanMut.error ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Scan failed: {(scanMut.error as Error).message}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <FilterGroup label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <FilterGroup label="Severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
        <FilterGroup label="Anchor" value={anchor} onChange={setAnchor} options={ANCHOR_OPTIONS} />
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-[#E8E1D6] bg-white p-8 text-center text-sm text-[#667085]">
          Loading drift signals…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E9F2] bg-white p-8 text-center text-sm text-[#667085]">
          No {status === "all" ? "" : status} drift signals for the selected filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              projectId={projectId}
              pending={decideMut.isPending}
              onDecide={(decision, action, note) =>
                decideMut.mutate({ signalId: s.id, decision, action, note })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const STATUS_OPTIONS: StatusFilter[] = ["open", "acknowledged", "resolved", "dismissed", "all"];
const SEVERITY_OPTIONS: SeverityFilter[] = ["high", "medium", "low", "all"];
const ANCHOR_OPTIONS: AnchorFilter[] = [
  "thesis",
  "rationale",
  "boundary",
  "capability",
  "delivery_scope",
  "all",
];

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#E4E9F2] bg-white p-1">
      <span className="px-2 text-[10px] uppercase tracking-wider text-[#667085]">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={
            value === o
              ? "rounded bg-[#eef3fd] px-2 py-1 font-medium text-[#3E68B2]"
              : "rounded px-2 py-1 text-[#667085] hover:bg-[#F5EFE4]"
          }
        >
          {o.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

function SignalCard({
  signal,
  projectId,
  pending,
  onDecide,
}: {
  signal: DriftSignalRow;
  projectId: string;
  pending: boolean;
  onDecide: (
    decision: "acknowledge" | "resolve" | "dismiss",
    action?: "amend_roadmap" | "update_boundary" | "reject_work" | "reassign" | "ignore" | "other",
    note?: string,
  ) => void;
}) {
  const [note, setNote] = useState("");
  const [showActions, setShowActions] = useState(false);
  const isOpen = signal.status === "open" || signal.status === "acknowledged";
  const severityTone =
    signal.severity === "high"
      ? "bg-red-50 text-red-800 border-red-200"
      : signal.severity === "medium"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <li className="rounded-xl border border-[#E4E9F2] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${severityTone}`}>
          {signal.severity}
        </span>
        <span className="rounded bg-[#F5EFE4] px-2 py-0.5 font-mono text-[10px] uppercase text-[#667085]">
          {signal.anchorKind.replace("_", " ")} · {signal.classification.replace("_", " ")}
        </span>
        <span className="rounded bg-white px-2 py-0.5 text-[10px] text-[#667085]">
          {signal.sourceKind}
        </span>
        <span className="ml-auto text-[11px] text-[#667085]">
          {new Date(signal.createdAt).toLocaleString()}
        </span>
      </div>

      <p className="mt-2 text-sm text-[#0A0F1F]">{signal.summary}</p>
      {signal.suggestedAction ? (
        <p className="mt-1 text-xs text-[#3E68B2]">
          <span className="font-medium">Suggested:</span> {signal.suggestedAction}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
        <span>Detector {signal.detectorVersion}</span>
        {signal.model ? <span>Model {signal.model}</span> : null}
        {signal.createdByEmail ? <span>Detected by {signal.createdByEmail}</span> : null}
        {signal.resolvedByEmail ? (
          <span>
            {signal.status === "dismissed" ? "Dismissed" : "Resolved"} by {signal.resolvedByEmail}
          </span>
        ) : null}
        <DeepLink signal={signal} projectId={projectId} />
      </div>

      {signal.resolutionNote ? (
        <p className="mt-2 rounded border border-[#E8E1D6] bg-[#FBF9F4] px-2 py-1 text-xs text-[#0A0F1F]">
          <span className="font-medium">Reviewer note:</span> {signal.resolutionNote}
        </p>
      ) : null}

      {isOpen ? (
        <>
          <button
            type="button"
            onClick={() => setShowActions((v) => !v)}
            className="mt-3 text-xs text-[#3E68B2] hover:underline"
          >
            {showActions ? "Hide actions" : "Take action"}
          </button>
          {showActions ? (
            <div className="mt-2 space-y-2 border-t border-[#E4E9F2] pt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reviewer note (optional)"
                rows={2}
                className="w-full rounded-md border border-[#E4E9F2] bg-white px-2 py-1.5 text-xs text-[#0A0F1F] placeholder:text-[#98A2B3] focus:border-[#3E68B2] focus:outline-none"
              />
              <div className="flex flex-wrap justify-end gap-2">
                {signal.status === "open" ? (
                  <ActionBtn
                    label="Acknowledge"
                    onClick={() => onDecide("acknowledge", undefined, note || undefined)}
                    disabled={pending}
                    tone="ghost"
                    icon={CheckCircle2}
                  />
                ) : null}
                <ActionBtn
                  label="Amend roadmap"
                  onClick={() => onDecide("resolve", "amend_roadmap", note || undefined)}
                  disabled={pending}
                  tone="primary"
                />
                <ActionBtn
                  label="Update boundary"
                  onClick={() => onDecide("resolve", "update_boundary", note || undefined)}
                  disabled={pending}
                  tone="primary"
                />
                <ActionBtn
                  label="Reject work"
                  onClick={() => onDecide("resolve", "reject_work", note || undefined)}
                  disabled={pending}
                  tone="danger"
                  icon={ShieldAlert}
                />
                <ActionBtn
                  label="Dismiss"
                  onClick={() => onDecide("dismiss", "ignore", note || undefined)}
                  disabled={pending}
                  tone="ghost"
                  icon={X}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function DeepLink({ signal, projectId }: { signal: DriftSignalRow; projectId: string }) {
  if (signal.sourceKind === "task" || signal.sourceKind === "evidence") {
    return (
      <Link
        to="/engine/projects/$projectId/work"
        params={{ projectId }}
        className="text-[#3E68B2] hover:underline"
      >
        Open in Work →
      </Link>
    );
  }
  if (signal.sourceKind === "delivery" || signal.sourceKind === "publish") {
    return (
      <Link
        to="/engine/projects/$projectId/delivery"
        params={{ projectId }}
        className="text-[#3E68B2] hover:underline"
      >
        Open in Delivery →
      </Link>
    );
  }
  return null;
}

function ActionBtn({
  label,
  onClick,
  disabled,
  tone,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: "primary" | "danger" | "ghost";
  icon?: typeof AlertTriangle;
}) {
  const classes =
    tone === "primary"
      ? "bg-[#3E68B2] text-white hover:bg-[#345aa0]"
      : tone === "danger"
        ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border border-[#E4E9F2] bg-white text-[#0A0F1F] hover:bg-[#F5EFE4]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${classes}`}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </button>
  );
}
