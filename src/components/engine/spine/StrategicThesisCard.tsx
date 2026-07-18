import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Compass } from "lucide-react";
import { getStrategicThesis } from "@/lib/engine-strategic-thesis.functions";

export function StrategicThesisCard({ projectId }: { projectId: string }) {
  const fn = useServerFn(getStrategicThesis);
  const q = useQuery({
    queryKey: ["engine", "strategic-thesis", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 60_000,
  });
  const current = q.data?.current ?? null;

  return (
    <section className="rounded-2xl border border-[#E8E1D6] bg-gradient-to-br from-[#FBF9F4] via-white to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]">
            <Compass className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              Strategic Thesis
            </div>
            <div className="font-display text-[15px] text-[#0A0F1F]">
              The bet that connects Point A → Point B
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#667085]">
          {current ? (
            <span className="rounded-full border border-[#E8E1D6] bg-white px-2 py-0.5 font-mono uppercase tracking-wider">
              v{current.version} · {current.status}
            </span>
          ) : null}
          <Link
            to="/engine/projects/$projectId/strategic-thesis"
            params={{ projectId }}
            className="inline-flex items-center gap-1 font-medium text-[#3E68B2] hover:text-[#284f93]"
          >
            Open room <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Block label="The bet" body={current?.bet_statement} empty="No thesis drafted yet." />
        <Block label="Why now" body={current?.why_now} empty="—" />
        <Block label="Wedge" body={current?.wedge} empty="—" />
      </div>
    </section>
  );
}

function Block({ label, body, empty }: { label: string; body?: string; empty: string }) {
  const text = body?.trim();
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-[#0A0F1F]">
        {text || <span className="italic text-[#667085]">{empty}</span>}
      </p>
    </div>
  );
}
