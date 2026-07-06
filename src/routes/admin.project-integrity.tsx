import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  listProjectsWithIntegrityIssues,
  listRecentIntakeFailures,
  repairProjectIntegrity,
} from "@/lib/engine-project-intake.functions";
import { useState } from "react";

export const Route = createFileRoute("/admin/project-integrity")({
  component: ProjectIntegrityPage,
});

function ProjectIntegrityPage() {
  const router = useRouter();
  const list = useServerFn(listProjectsWithIntegrityIssues);
  const failuresFn = useServerFn(listRecentIntakeFailures);
  const repair = useServerFn(repairProjectIntegrity);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-project-integrity"],
    queryFn: () => list(),
  });

  const failures = useQuery({
    queryKey: ["admin-project-intake-failures"],
    queryFn: () => failuresFn(),
  });


  const [flash, setFlash] = useState<string | null>(null);
  const repairMut = useMutation({
    mutationFn: (projectId: string) => repair({ data: { projectId } }),
    onSuccess: (res) => {
      setFlash(
        res.repaired.length === 0
          ? "Nothing to repair — the project already has every safe sibling row. Any remaining items require the client-portal flow."
          : `Repaired: ${res.repaired.join(", ")}${res.still_missing.length ? ` · Still missing: ${res.still_missing.join(", ")}` : ""}`,
      );
      refetch();
      router.invalidate();
    },
    onError: (err) => setFlash((err as Error).message ?? "Repair failed"),
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-1">Project integrity</h1>
      <p className="text-white/60 text-sm mb-6">
        Engine projects missing one or more required sibling rows. Repair inserts the safe
        ones (agent, permissions, v0.0 container). Portal linkage requires a client email
        and must be fixed through the client-portal flow.
      </p>

      {flash && (
        <div className="mb-4 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded px-3 py-2">
          {flash}
        </div>
      )}

      {isLoading && <div className="text-white/70">Loading…</div>}
      {error && <div className="text-red-400">Error: {(error as Error).message}</div>}

      {data && data.rows.length === 0 && (
        <div className="text-emerald-400">All projects pass integrity checks. 🎉</div>
      )}

      {data && data.rows.length > 0 && (
        <div className="border border-white/10 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/60 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Delivery mode</th>
                <th className="px-3 py-2">Missing</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.project_id} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-xs">
                    <div className="text-white">{r.project_name}</div>
                    <div className="text-white/40">{r.project_id}</div>
                  </td>
                  <td className="px-3 py-2 text-white/80">{r.delivery_mode}</td>
                  <td className="px-3 py-2 text-amber-300">{r.missing.join(", ")}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="px-3 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
                      disabled={repairMut.isPending && repairMut.variables === r.project_id}
                      onClick={() => repairMut.mutate(r.project_id)}
                    >
                      {repairMut.isPending && repairMut.variables === r.project_id
                        ? "Repairing…"
                        : "Repair"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="mt-4 text-xs text-white/60 hover:text-white underline disabled:opacity-40"
      >
        {isFetching ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
