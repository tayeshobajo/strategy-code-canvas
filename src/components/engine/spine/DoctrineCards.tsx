/**
 * Doctrine cards for the Project Spine — World Entry & Execution Boundary.
 *
 * These summarise two doctrine artefacts on the Spine narrative so an
 * operator can see, without leaving the page, what world the roadmap
 * is entering and what work Trust Tai vs the client actually owns.
 * Full editing stays in the dedicated rooms.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Globe2, Shield } from "lucide-react";
import { getWorldEntry } from "@/lib/engine-world-entry.functions";
import { getExecutionBoundary } from "@/lib/engine-execution-boundary.functions";

function Shell({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  status,
  statusTone,
  children,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
  statusTone: "approved" | "review" | "draft";
  children: React.ReactNode;
  cta: React.ReactNode;
}) {
  const toneCls =
    statusTone === "approved"
      ? "border-[#bfe4ce] bg-[#e7f5ec] text-[#1f6b3b]"
      : statusTone === "review"
        ? "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]"
        : "border-[#E8E1D6] bg-[#FBF9F4] text-[#667085]";
  return (
    <section className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E8E1D6] bg-white p-6 shadow-[0_1px_0_rgba(10,15,31,0.03),0_12px_32px_-24px_rgba(10,15,31,0.18)] ring-1 ring-[#0A0F1F]/[0.03]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A0F1F] via-[#3E68B2] to-[#34C4EB]"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A0F1F] text-white shadow-sm ring-4 ring-[#eef3fd]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#3E68B2]">
              {eyebrow}
            </div>
            <div
              className="mt-0.5 text-[22px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              {title}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[#667085]">{subtitle}</div>
          </div>
        </div>
        <span
          className={
            "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] " +
            toneCls
          }
        >
          {status}
        </span>
      </div>
      <div className="mt-6 flex-1 space-y-4">{children}</div>
      <div className="mt-5 border-t border-[#F0EBE3] pt-4 text-[12px]">{cta}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
        {label}
      </div>
      <div className="mt-1 text-[13.5px] leading-[1.5] text-[#1a2233]">{value}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-[#8a94a6]">{children}</span>;
}

export function WorldEntryCard({ projectId }: { projectId: string }) {
  const fn = useServerFn(getWorldEntry);
  const q = useQuery({
    queryKey: ["engine", "world-entry", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 60_000,
  });
  const current = q.data?.current ?? null;
  const status =
    current?.status === "approved"
      ? "Approved"
      : current?.status === "awaiting_review"
        ? "In review"
        : current
          ? "Drafted"
          : "Not started";
  const tone: "approved" | "review" | "draft" =
    current?.status === "approved" ? "approved" : current?.status === "awaiting_review" ? "review" : "draft";
  const topCompetitors = (current?.competitors ?? []).slice(0, 3);

  return (
    <Shell
      icon={Globe2}
      eyebrow="World Entry"
      title="The world we're entering"
      subtitle="Industry direction, category leader, market destination"
      status={status}
      statusTone={tone}
      cta={
        <Link
          to="/engine/projects/$projectId/world-entry"
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
        >
          Open World Entry <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <Row
        label="Market destination"
        value={
          current?.destination_summary?.trim() ? (
            current.destination_summary
          ) : (
            <Muted>Not defined yet.</Muted>
          )
        }
      />
      <Row
        label="Category leaders reviewed"
        value={
          topCompetitors.length ? (
            <ul className="space-y-1">
              {topCompetitors.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-1">
                  <span className="font-medium text-[#0A0F1F]">{c.name}</span>
                  {c.positioning ? (
                    <span className="text-[12.5px] text-[#3f4a5e]">— {c.positioning}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No competitors added yet.</Muted>
          )
        }
      />
      <Row
        label="Industry vocabulary"
        value={
          current?.vocabulary?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {current.vocabulary.slice(0, 6).map((v) => (
                <span
                  key={v}
                  className="rounded-full border border-[#E8E1D6] bg-[#FBF9F4] px-2 py-0.5 text-[11px] text-[#3f4a5e]"
                >
                  {v}
                </span>
              ))}
            </div>
          ) : (
            <Muted>None captured.</Muted>
          )
        }
      />
    </Shell>
  );
}

export function ExecutionBoundaryCard({ projectId }: { projectId: string }) {
  const fn = useServerFn(getExecutionBoundary);
  const q = useQuery({
    queryKey: ["engine", "execution-boundary", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 60_000,
  });
  const current = q.data?.current ?? null;
  const status =
    current?.status === "approved"
      ? "Approved"
      : current?.status === "proposed"
        ? "In review"
        : current
          ? "Drafted"
          : "Not started";
  const tone: "approved" | "review" | "draft" =
    current?.status === "approved" ? "approved" : current?.status === "proposed" ? "review" : "draft";

  const trust = current?.capability_ids ?? [];
  const client = current?.client_owned_areas ?? [];
  const excl = current?.exclusions ?? [];

  return (
    <Shell
      icon={Shield}
      eyebrow="Execution Boundary"
      title="Who owns what"
      subtitle="Trust Tai scope, client scope, and what the roadmap will create"
      status={status}
      statusTone={tone}
      cta={
        <Link
          to="/engine/projects/$projectId/execution-boundary"
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
        >
          Open Execution Boundary <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <Row
        label={`Trust Tai delivers · ${trust.length}`}
        value={
          trust.length ? (
            <div className="flex flex-wrap gap-1.5">
              {trust.slice(0, 6).map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-[#cdd6f3] bg-[#eef3fd] px-2 py-0.5 text-[11px] text-[#3E68B2]"
                >
                  {c}
                </span>
              ))}
              {trust.length > 6 ? (
                <span className="text-[11px] text-[#667085]">+{trust.length - 6} more</span>
              ) : null}
            </div>
          ) : (
            <Muted>No capabilities selected.</Muted>
          )
        }
      />
      <Row
        label={`Client owns · ${client.length}`}
        value={
          client.length ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {client.slice(0, 4).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <Muted>None declared.</Muted>
          )
        }
      />
      <Row
        label={`Out of scope · ${excl.length}`}
        value={
          excl.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-[#3f4a5e]">
              {excl.slice(0, 4).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <Muted>Nothing explicitly excluded.</Muted>
          )
        }
      />
    </Shell>
  );
}
