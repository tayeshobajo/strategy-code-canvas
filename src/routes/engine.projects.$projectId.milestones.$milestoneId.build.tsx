/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MilestoneTabs } from "@/components/engine/MilestoneTabs";
import { getMilestoneBuildPackets } from "@/lib/engine-milestone-workspace.functions";
import { Hammer } from "lucide-react";

export const Route = createFileRoute(
  "/engine/projects/$projectId/milestones/$milestoneId/build",
)({
  component: MilestoneBuildPage,
  errorComponent: ({ error }) => (
    <div className="p-4 text-sm text-red-700">Failed: {(error as Error).message}</div>
  ),
});

function MilestoneBuildPage() {
  const { projectId, milestoneId } = Route.useParams();
  const fetchFn = useServerFn(getMilestoneBuildPackets);
  const q = useQuery({
    queryKey: ["engine", "milestone-build", projectId, milestoneId],
    queryFn: () => fetchFn({ data: { projectId, milestoneId } }),
    staleTime: 60_000,
  });

  const data = q.data as
    | { milestone: any; packets: any[]; evidence: any[]; total_in_project: number }
    | undefined;

  return (
    <div className="space-y-4">
      <MilestoneTabs
        projectId={projectId}
        milestoneId={milestoneId}
        milestoneName={data?.milestone?.name ?? null}
      />

      {q.isPending ? (
        <div className="text-sm text-[#667085]">Loading build packets…</div>
      ) : q.isError ? (
        <div className="text-sm text-red-700">{(q.error as Error).message}</div>
      ) : !data || data.packets.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#E8E1D6] bg-white p-8 text-center">
          <Hammer className="mx-auto h-8 w-8 text-[#667085]" />
          <div className="mt-3 font-display text-lg text-[#0A0F1F]">No build packets yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#667085]">
            When the implementation planner generates build packets tagged to
            this milestone, they will appear here with status and evidence.
          </p>
          {data && data.total_in_project > 0 ? (
            <p className="mt-2 text-xs text-[#667085]">
              {data.total_in_project} project-level packet
              {data.total_in_project === 1 ? "" : "s"} not tagged to this milestone.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
            <div className="border-b border-[#E8E1D6] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              Build packets ({data.packets.length})
            </div>
            <ul className="divide-y divide-[#F3EEE6]">
              {data.packets.map((p) => (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-display text-base text-[#0A0F1F]">
                      {typeof p.sequence_number === "number" ? `${p.sequence_number}. ` : ""}
                      {p.title}
                    </div>
                    <span className="rounded-full border border-[#E8E1D6] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#667085]">
                      {p.status}
                    </span>
                  </div>
                  {p.summary ? <p className="mt-1 text-sm text-[#3f4a63]">{p.summary}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
                    {p.packet_type ? <span>Type · {p.packet_type}</span> : null}
                    {p.priority ? <span>Priority · {p.priority}</span> : null}
                    {p.assigned_to ? <span>Assigned · {p.assigned_to}</span> : null}
                    {p.accepted_at ? (
                      <span>Accepted · {new Date(p.accepted_at).toLocaleString()}</span>
                    ) : null}
                    {p.rejected_reason ? <span>Rejected · {p.rejected_reason}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {data.evidence.length ? (
            <section className="rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
              <div className="border-b border-[#E8E1D6] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
                Evidence ({data.evidence.length})
              </div>
              <ul className="divide-y divide-[#F3EEE6]">
                {data.evidence.map((e) => (
                  <li key={e.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm text-[#0A0F1F]">
                        <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#667085]">
                          {e.evidence_type}
                        </span>
                        {e.title}
                      </div>
                      <span className="text-[11px] text-[#667085]">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </div>
                    {e.summary ? <p className="mt-1 text-xs text-[#3f4a63]">{e.summary}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
