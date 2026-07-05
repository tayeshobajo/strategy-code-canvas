import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMilestoneChangeAudit } from "@/lib/milestone-changes.functions";
import { GitBranch, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/milestone-changes")({
  head: () => ({
    meta: [
      { title: "Milestone changes — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MilestoneChangesPage,
});

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function MilestoneChangesPage() {
  const load = useServerFn(listMilestoneChangeAudit);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "milestone-changes"],
    queryFn: () => load({ data: { limit: 100 } }),
  });

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-400 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" /> Audit
        </div>
        <h1 className="text-2xl mt-2">Milestone change history</h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Every roadmap version that generated a suggested milestone diff, with
          when it was created, its current review status, and if/when it was
          approved. Approved rows are already applied to <code>engine_milestones</code>.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-white/70">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}
      {isError && (
        <div className="text-rose-400 text-sm">
          Couldn't load audit. {(error as Error)?.message}
        </div>
      )}
      {data && data.rows.length === 0 && (
        <div className="rounded border border-white/10 bg-white/5 p-6 text-white/60 text-sm">
          No milestone change sets yet. They appear here the first time a
          pipeline re-run produces added/modified/removed candidates against an
          existing milestone set.
        </div>
      )}
      {data && data.rows.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/60 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Project</th>
                <th className="text-left px-4 py-2">Version</th>
                <th className="text-left px-4 py-2">Generated</th>
                <th className="text-left px-4 py-2">Diff</th>
                <th className="text-left px-4 py-2">Review</th>
                <th className="text-left px-4 py-2">Approved</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.version_id} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.project_name ?? "—"}</div>
                    <div className="text-white/40 text-[11px]">{r.project_id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{r.version}</div>
                    {r.version_label && (
                      <div className="text-white/50 text-[11px] truncate max-w-[280px]">
                        {r.version_label}
                      </div>
                    )}
                    <div className="text-white/40 text-[10px] uppercase tracking-wide mt-0.5">
                      {r.status}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">{fmt(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px]">
                        +{r.added}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px]">
                        ~{r.modified}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[11px]">
                        −{r.removed}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {r.review_status ? (
                      <div>
                        <div className="capitalize">{r.review_status.replace(/_/g, " ")}</div>
                        <div className="text-white/40 text-[11px]">{fmt(r.reviewed_at)}</div>
                      </div>
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {r.approved_at ? (
                      <div>
                        <div>{fmt(r.approved_at)}</div>
                        <div className="text-white/40 text-[11px]">{r.approved_by ?? "—"}</div>
                      </div>
                    ) : (
                      <span className="text-white/40">Not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
