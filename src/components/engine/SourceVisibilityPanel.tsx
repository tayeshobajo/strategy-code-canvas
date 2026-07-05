import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldCheck, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  changeSourceVisibility,
  listProjectSourcesForAdmin,
  type AdminSourceRow,
  type SourceVisibility,
} from "@/lib/engine-sources.functions";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { OperatorLockNotice } from "@/components/engine/OperatorLockNotice";
import { useEngineRole } from "@/hooks/useEngineRole";
import { cn } from "@/lib/utils";

const VIS_LABEL: Record<SourceVisibility, string> = {
  internal_only: "Internal only",
  operator_only: "Operator only",
  client_safe: "Client safe",
};

const VIS_TONE: Record<SourceVisibility, string> = {
  internal_only: "bg-slate-100 text-slate-700 border-slate-300",
  operator_only: "bg-amber-50 text-amber-800 border-amber-300",
  client_safe: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

const VIS_ICON: Record<SourceVisibility, React.ComponentType<{ className?: string }>> = {
  internal_only: EyeOff,
  operator_only: Eye,
  client_safe: ShieldCheck,
};

export function SourceVisibilityPanel({ projectId }: { projectId: string }) {
  const role = useEngineRole();

  if (role.loading) return null;
  if (!role.isAdmin) {
    return (
      <SectionCard
        title={
          <span className="inline-flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Source visibility
          </span>
        }
      >
        <OperatorLockNotice message="Admin only — visibility changes require an admin." />
      </SectionCard>
    );
  }

  return <AdminPanel projectId={projectId} />;
}

function AdminPanel({ projectId }: { projectId: string }) {
  const listFn = useServerFn(listProjectSourcesForAdmin);
  const { data, isLoading } = useQuery({
    queryKey: ["engine", "sources-admin", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const rows = data?.rows ?? [];

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Source visibility <span className="text-[10px] font-normal text-ink/50">(admin)</span>
        </span>
      }
    >
      <p className="text-xs text-ink/60 mb-3">
        Every source defaults to <strong>Internal only</strong>. Promote to
        Operator only or Client safe with a written reason — the change is
        logged to the audit trail.
      </p>
      {isLoading ? (
        <div className="text-xs text-ink/40 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading sources…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No sources yet" />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <SourceRow key={row.id} row={row} projectId={projectId} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SourceRow({ row, projectId }: { row: AdminSourceRow; projectId: string }) {
  const qc = useQueryClient();
  const changeFn = useServerFn(changeSourceVisibility);
  const [open, setOpen] = useState(false);
  const [nextVis, setNextVis] = useState<SourceVisibility>(row.visibility);
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      changeFn({ data: { sourceId: row.id, visibility: nextVis, reason: reason.trim() } }),
    onSuccess: (res) => {
      if (res.unchanged) {
        toast.info("Visibility unchanged");
      } else {
        toast.success(`Visibility updated to ${VIS_LABEL[nextVis]}`);
      }
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["engine", "sources-admin", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = VIS_ICON[row.visibility];
  const canSubmit =
    nextVis !== row.visibility && reason.trim().length >= 3 && !mut.isPending;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-ink truncate">{row.name}</div>
          <div className="text-[11px] text-ink/50 mt-0.5 inline-flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                VIS_TONE[row.visibility],
              )}
            >
              <Icon className="w-3 h-3" />
              {VIS_LABEL[row.visibility]}
            </span>
            {row.type ? <span className="font-mono">{row.type}</span> : null}
            {row.status ? <span>· {row.status}</span> : null}
          </div>
        </div>
        <button
          onClick={() => {
            setNextVis(row.visibility);
            setReason("");
            setOpen((v) => !v);
          }}
          className="text-xs rounded-md border border-border bg-white px-2.5 py-1 text-ink/80 hover:bg-paper-soft"
        >
          {open ? "Cancel" : "Change"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 rounded-md border border-border bg-paper-soft p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(["internal_only", "operator_only", "client_safe"] as const).map((v) => {
              const active = nextVis === v;
              const I = VIS_ICON[v];
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNextVis(v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
                    active
                      ? "bg-ink text-white border-ink"
                      : "bg-white text-ink/70 border-border hover:text-ink",
                  )}
                >
                  <I className="w-3 h-3" />
                  {VIS_LABEL[v]}
                </button>
              );
            })}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Reason (required, min 3 chars) — will appear in the audit log"
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-white text-ink"
          />
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-ink/50">
              {nextVis === row.visibility
                ? "Pick a different visibility to submit."
                : `Change ${VIS_LABEL[row.visibility]} → ${VIS_LABEL[nextVis]}`}
            </div>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1 text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Submit change
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
