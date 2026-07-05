import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Loader2 } from "lucide-react";
import { listProjectAuditLog, type AuditLogEntry } from "@/lib/engine-ops.functions";
import { cn } from "@/lib/utils";

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function AuditTrailCard({
  projectId,
  limit = 100,
  compact = false,
}: {
  projectId: string;
  limit?: number;
  compact?: boolean;
}) {
  const fn = useServerFn(listProjectAuditLog);
  const { data, isLoading, error } = useQuery({
    queryKey: ["engine", "audit-log", projectId, limit],
    queryFn: () => fn({ data: { projectId, limit } }) as Promise<AuditLogEntry[]>,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-ink/50 inline-flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading audit trail…
      </div>
    );
  }
  if (error) {
    return <div className="text-xs text-red-700">Failed to load audit log: {(error as Error).message}</div>;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return <div className="text-xs text-ink/50">No audit entries yet.</div>;
  }

  return (
    <ul className={cn("space-y-1.5", compact ? "max-h-72 overflow-auto pr-1" : "")}>
      {rows.map((r) => (
        <AuditRow key={r.id} row={r} />
      ))}
    </ul>
  );
}

function AuditRow({ row }: { row: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasFieldDetail =
    !!row.field_changed || row.old_value !== null || row.new_value !== null || !!row.reason;
  return (
    <li className="rounded-md border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-paper-soft/60"
      >
        <ChevronRight className={cn("w-3.5 h-3.5 mt-0.5 text-ink/40 transition-transform", open && "rotate-90")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-royal">{row.action}</span>
            {row.field_changed ? (
              <span className="font-mono text-[10px] text-ink/50">· {row.field_changed}</span>
            ) : null}
            <span className="text-[10px] text-ink/40 ml-auto whitespace-nowrap">
              {new Date(row.created_at).toLocaleString()}
            </span>
          </div>
          {row.summary ? <div className="text-sm text-ink mt-0.5">{row.summary}</div> : null}
          <div className="text-[11px] text-ink/50 mt-0.5">
            {row.actor_email ?? "system"}
            {row.affected_modules?.length ? ` · ${row.affected_modules.join(", ")}` : ""}
          </div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-border px-3 py-2 space-y-2 bg-paper-soft/40">
          {hasFieldDetail ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Field changed</dt>
                <dd className="text-ink font-mono">{row.field_changed ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Reason</dt>
                <dd className="text-ink">{row.reason ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/50">Old value</dt>
                <dd>
                  <pre className="whitespace-pre-wrap break-words text-[11px] bg-white border border-border rounded p-2 text-ink/80 max-h-40 overflow-auto">
                    {fmtValue(row.old_value)}
                  </pre>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/50">New value</dt>
                <dd>
                  <pre className="whitespace-pre-wrap break-words text-[11px] bg-white border border-border rounded p-2 text-ink/80 max-h-40 overflow-auto">
                    {fmtValue(row.new_value)}
                  </pre>
                </dd>
              </div>
            </dl>
          ) : (
            <div className="text-xs text-ink/50">No field-level detail recorded.</div>
          )}
          {row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) && Object.keys(row.metadata as Record<string, unknown>).length > 0 ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50 mb-1">Metadata</div>
              <pre className="whitespace-pre-wrap break-words text-[11px] bg-white border border-border rounded p-2 text-ink/70 max-h-40 overflow-auto">
                {JSON.stringify(row.metadata, null, 2)}
              </pre>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4 text-[10px] text-ink/40 font-mono">
            {row.version_id ? <span>version: {row.version_id}</span> : null}
            {row.target_id ? <span>target: {row.target_id}</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
