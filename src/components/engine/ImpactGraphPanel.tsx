import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Network, Radio, Layers, Target, ListChecks } from "lucide-react";
import { getProjectImpactGraph, type ImpactGraph } from "@/lib/engine-impact-graph.functions";

/**
 * Phase RT-5 — Compact impact graph panel.
 *
 * Read-only summary of source → signal → truth → milestone → task fanout,
 * grouped by spine. Full graph visualization is a follow-up; this panel
 * makes blast radius legible in the Spine cockpit today.
 */
export function ImpactGraphPanel({ projectId }: { projectId: string }) {
  const load = useServerFn(getProjectImpactGraph);
  const q = useQuery({
    queryKey: ["impact-graph", projectId],
    queryFn: () => load({ data: { projectId } }),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="rounded-xl border border-[#E8E1D6] bg-white p-4 text-sm text-[#667085]">
        Loading impact graph…
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="rounded-xl border border-[#E8E1D6] bg-white p-4 text-sm text-[#B42318]">
        Impact graph unavailable.
      </div>
    );
  }

  const g = q.data;
  const bySpine = groupTruthBySpine(g);

  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-[#3E68B2]" />
          <h3 className="text-sm font-semibold text-[#0A0F1F]">Impact graph</h3>
        </div>
        <Link
          to="/engine/projects/$projectId/amendments"
          params={{ projectId }}
          className="text-xs text-[#3E68B2] hover:underline"
        >
          Amendments →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-5 gap-2 text-center">
        <Stat icon={Radio} label="Sources" value={g.counts.sources} />
        <Stat icon={Radio} label="Signals" value={g.counts.signals} />
        <Stat icon={Layers} label="Truth" value={g.counts.truth} />
        <Stat icon={Target} label="Milestones" value={g.counts.milestones} />
        <Stat icon={ListChecks} label="Tasks" value={g.counts.tasks} />
      </div>

      {bySpine.length === 0 ? (
        <p className="text-xs text-[#667085]">No truth rows yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {bySpine.map((row) => (
            <li
              key={row.spine}
              className="flex items-center justify-between rounded-md border border-[#F0EAE0] bg-[#FBF9F4] px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium text-[#0A0F1F]">{row.spine}</span>
              <span className="text-[#667085]">
                {row.truthCount} truth · {row.milestoneCount} milestones
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Network;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-[#F0EAE0] bg-[#FBF9F4] px-1 py-1.5">
      <Icon className="mx-auto h-3.5 w-3.5 text-[#667085]" />
      <div className="mt-0.5 text-sm font-semibold text-[#0A0F1F]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[#667085]">{label}</div>
    </div>
  );
}

function groupTruthBySpine(g: ImpactGraph) {
  const truthBySpine = new Map<string, string[]>();
  for (const n of g.nodes) {
    if (n.kind !== "truth" || !n.spine) continue;
    const arr = truthBySpine.get(n.spine) ?? [];
    arr.push(n.id);
    truthBySpine.set(n.spine, arr);
  }
  const msDownstream = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (e.reason !== "sequences") continue;
    const set = msDownstream.get(e.from) ?? new Set<string>();
    set.add(e.to);
    msDownstream.set(e.from, set);
  }
  return Array.from(truthBySpine.entries())
    .map(([spine, truthIds]) => {
      const milestones = new Set<string>();
      for (const t of truthIds) {
        const ms = msDownstream.get(t);
        if (ms) ms.forEach((m) => milestones.add(m));
      }
      return { spine, truthCount: truthIds.length, milestoneCount: milestones.size };
    })
    .sort((a, b) => b.milestoneCount - a.milestoneCount);
}
