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
    <section className="relative overflow-hidden rounded-2xl border border-[#E8E1D6] bg-white p-7 shadow-[0_1px_0_rgba(10,15,31,0.03),0_12px_32px_-24px_rgba(10,15,31,0.18)] ring-1 ring-[#0A0F1F]/[0.03]">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#0A0F1F] via-[#3E68B2] to-[#34C4EB]"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0A0F1F] text-white shadow-sm ring-4 ring-[#eef3fd]">
            <Compass className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-px w-6 bg-[#0A0F1F]" />
              <div className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
                Strategic Thesis
              </div>
            </div>
            <div
              className="mt-1.5 text-[24px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              The bet that connects Point A → Point B
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#667085]">
          {current ? (
            <span className="rounded-full border border-[#E8E1D6] bg-[#FBF9F4] px-2.5 py-1 font-mono font-semibold uppercase tracking-[0.14em] text-[#0A0F1F]">
              v{current.version} · {current.status}
            </span>
          ) : null}
          <Link
            to="/engine/projects/$projectId/strategic-thesis"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
          >
            Open room <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mt-7 grid gap-6 md:grid-cols-3 md:divide-x md:divide-[#F0EBE3]">
        <Block label="The bet" body={current?.bet_statement} empty="No thesis drafted yet." />
        <Block label="Why now" body={current?.why_now} empty="—" className="md:pl-6" />
        <Block label="Wedge" body={current?.wedge} empty="—" className="md:pl-6" />
      </div>
    </section>
  );
}

function Block({
  label,
  body,
  empty,
  className = "",
}: {
  label: string;
  body?: string;
  empty: string;
  className?: string;
}) {
  const text = body?.trim();
  return (
    <div className={className}>
      <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#3E68B2]">
        {label}
      </div>
      <p
        className="mt-2 text-[16px] leading-[1.6] text-[#0A0F1F]"
        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {text || <span className="italic text-[#8a94a6]">{empty}</span>}
      </p>
    </div>
  );
}
