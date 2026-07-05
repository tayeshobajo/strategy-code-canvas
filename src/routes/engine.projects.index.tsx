import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { listProjects } from "@/lib/engine.functions";
import {
  EngineStatusBadge,
  SectionCard,
  EmptyState,
  formatCents,
  formatDate,
} from "@/components/engine/primitives";


const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "needs_review", label: "Needs review" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "delivered", label: "Delivered" },
  { value: "in_execution", label: "In execution" },
  { value: "blocked", label: "Blocked" },
  { value: "archived", label: "Archived" },
] as const;

const searchSchema = z.object({
  filter: fallback(
    z.enum([
      "all",
      "active",
      "needs_review",
      "draft",
      "approved",
      "delivered",
      "in_execution",
      "blocked",
      "archived",
    ]),
    "all",
  ).default("all"),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/engine/projects/")({
  validateSearch: zodValidator(searchSchema),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { filter, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fn = useServerFn(listProjects);
  const { data, isLoading } = useQuery({
    queryKey: ["engine", "projects", filter, q],
    queryFn: () => fn({ data: { filter, q } }),
  });

  return (
    <div className="space-y-6 max-w-[1500px]">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Portfolio</div>
          <h1 className="font-display text-4xl text-ink mt-1">Projects</h1>
          <p className="text-sm text-ink/60 mt-2">All client roadmap projects in one place.</p>
        </div>
        <Link
          to="/engine/projects/new"
          className="bg-ink text-white px-4 py-2 rounded-md text-sm hover:bg-ink/90"
        >
          + New project
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => navigate({ search: (prev: { filter: string; q: string }) => ({ ...prev, filter: f.value }) })}
            className={`px-3 py-1.5 rounded-full text-xs border transition ${
              filter === f.value
                ? "bg-ink text-white border-ink"
                : "bg-card text-ink/70 border-border hover:border-royal/50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => navigate({ search: (prev: { filter: string; q: string }) => ({ ...prev, q: e.target.value }) })}
          placeholder="Search client or project…"
          className="ml-auto px-3 py-1.5 rounded-md border border-border bg-card text-sm w-64"
        />
      </div>

      <SectionCard title={`${data?.rows.length ?? 0} project${(data?.rows.length ?? 0) === 1 ? "" : "s"}`}>
        {isLoading ? (
          <div className="py-10 text-center text-ink/50 text-sm">Loading…</div>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState title="No projects match" hint="Adjust filters to see more." />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink/50 border-b border-border">
                  <th className="py-2 px-5 font-medium">Client / project</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Phase</th>
                  <th className="py-2 px-2 font-medium">Step</th>
                  <th className="py-2 px-2 font-medium">Version</th>
                  <th className="py-2 px-2 font-medium">Sources</th>
                  <th className="py-2 px-2 font-medium">Portal</th>
                  <th className="py-2 px-2 font-medium">Agent</th>
                  <th className="py-2 px-2 font-medium">Last updated</th>
                  <th className="py-2 px-2 font-medium">Critical deadline</th>
                  <th className="py-2 px-2 font-medium">Decisions</th>
                  <th className="py-2 px-2 font-medium">Spend</th>
                  <th className="py-2 px-5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-paper-soft">
                    <td className="py-3 px-5">
                      <Link
                        to="/engine/projects/$projectId/overview"
                        params={{ projectId: r.id }}
                        className="block"
                      >
                        <div className="text-ink font-medium">{r.name}</div>
                        <div className="text-xs text-ink/50">{r.client_company}</div>
                      </Link>
                    </td>
                    <td className="py-3 px-2"><EngineStatusBadge status={r.status} /></td>
                    <td className="py-3 px-2 text-ink/70">{r.current_phase}</td>
                    <td className="py-3 px-2 text-ink/70 capitalize">{r.current_step.replace(/_/g, " ")}</td>
                    <td className="py-3 px-2 text-ink/70">
                      <div>{r.roadmap_version ?? "—"}</div>
                      <div className="text-xs text-ink/40">approved {r.approved_version ?? "—"}</div>
                    </td>
                    <td className="py-3 px-2 text-ink/70 whitespace-nowrap">
                      <div>{r.source_count}</div>
                      <div className="text-xs text-ink/40">
                        {r.latest_source_processed
                          ? `last ${formatDate(r.latest_source_processed)}`
                          : "none processed"}
                      </div>
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <PortalPublishBadge status={r.portal_publish_status} />
                    </td>
                    <td className="py-3 px-2 text-ink/70 capitalize">{r.agent_status}</td>
                    <td className="py-3 px-2 text-ink/70 whitespace-nowrap">{formatDate(r.last_activity_at)}</td>
                    <td className="py-3 px-2 text-ink/70 whitespace-nowrap">
                      {r.next_critical_date ? (
                        <>
                          <div>{formatDate(r.next_critical_date.due_on)}</div>
                          <div className="text-xs text-ink/40">{r.next_critical_date.label}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-2 text-ink/70">{r.open_decisions}</td>
                    <td className="py-3 px-2 text-ink/70 whitespace-nowrap">{formatCents(r.agent_spend_month_cents)}</td>
                    <td className="py-3 px-5 text-ink/70">
                      <RowActions
                        projectId={r.id}
                        portalPublishStatus={r.portal_publish_status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        )}
      </SectionCard>
    </div>
  );
}

function PortalPublishBadge({
  status,
}: {
  status: "not_published" | "draft" | "published" | "archived";
}) {
  const meta: Record<typeof status, { label: string; cls: string }> = {
    not_published: { label: "Not published", cls: "bg-paper-soft text-ink/60 border-border" },
    draft: { label: "Draft", cls: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]" },
    published: { label: "Published", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
    archived: { label: "Archived", cls: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]" },
  };
  const m = meta[status];
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function RowActions({
  projectId,
  portalPublishStatus,
}: {
  projectId: string;
  portalPublishStatus: "not_published" | "draft" | "published" | "archived";
}) {
  const linkCls =
    "text-[11px] text-royal hover:underline whitespace-nowrap";
  return (
    <div className="flex flex-col gap-1">
      <Link
        to="/engine/projects/$projectId/signal-room"
        params={{ projectId }}
        className={linkCls}
      >
        + Add source
      </Link>
      <Link to="/engine/review" className={linkCls}>
        Review items
      </Link>

      <Link
        to="/engine/projects/$projectId/preview"
        params={{ projectId }}
        className={linkCls}
      >
        Portal: {portalPublishStatus === "not_published" ? "publish" : portalPublishStatus}
      </Link>
    </div>
  );
}

