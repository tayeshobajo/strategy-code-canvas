import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { listProjects, getCommandCenter } from "@/lib/engine.functions";
import type { EngineProjectRow, EngineProjectStatus } from "@/lib/engine.functions";
import {
  EngineStatusBadge,
  SectionCard,
  EmptyState,
  formatCents,
  formatDate,
} from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import {
  Search,
  Filter as FilterIcon,
  MoreHorizontal,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

// ─── search schema ──────────────────────────────────────────────────────────
type FilterValue =
  | "all"
  | "active"
  | "needs_review"
  | "draft"
  | "approved"
  | "delivered"
  | "in_execution"
  | "blocked"
  | "archived";

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
  sort: fallback(z.enum(["updated_desc", "updated_asc"]), "updated_desc").default("updated_desc"),
  page: fallback(z.number().int(), 1).default(1),
});

type SearchState = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/engine/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Trust Tai" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: ProjectsPage,
});

const PAGE_SIZE = 25;

// ─── health helpers ─────────────────────────────────────────────────────────
function healthOf(status: EngineProjectStatus): "green" | "amber" | "red" | "gray" {
  if (status === "blocked") return "red";
  if (status === "needs_review" || status === "draft") return "amber";
  if (status === "archived") return "gray";
  return "green";
}

function HealthDot({ status }: { status: EngineProjectStatus }) {
  const h = healthOf(status);
  const cls =
    h === "red"
      ? "bg-[#a4283c]"
      : h === "amber"
        ? "bg-[#c99215]"
        : h === "gray"
          ? "bg-[#8b8f9a]"
          : "bg-[#1f6b3b]";
  const label =
    h === "red" ? "Blocked" : h === "amber" ? "Needs review" : h === "gray" ? "Archived" : "On track";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink/70">
      <span className={cn("inline-block w-2 h-2 rounded-full", cls)} aria-hidden />
      {label}
    </span>
  );
}

function nextBestAction(r: EngineProjectRow): string {
  if (r.status === "blocked") return "Resolve blocker";
  if (r.status === "needs_review") return "Review draft";
  if (r.open_decisions > 0)
    return `${r.open_decisions} decision${r.open_decisions === 1 ? "" : "s"} waiting`;
  if (r.next_critical_date) return r.next_critical_date.label;
  if (r.next_action) return r.next_action;
  return "No action pending";
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── page ───────────────────────────────────────────────────────────────────
function ProjectsPage() {
  const search = Route.useSearch();
  const { filter, q, sort, page } = search;
  const navigate = Route.useNavigate();

  const [showFilters, setShowFilters] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const listFn = useServerFn(listProjects);
  const ccFn = useServerFn(getCommandCenter);

  const { data, isLoading } = useQuery({
    queryKey: ["engine", "projects", filter, q],
    queryFn: () => listFn({ data: { filter, q } }),
  });

  // Read-only for recent activity — non-blocking; if it fails, the card is omitted.
  const { data: cc } = useQuery({
    queryKey: ["engine", "command-center", "projects-rail"],
    queryFn: () => ccFn({}),
    staleTime: 30_000,
    retry: false,
  });

  const rows = data?.rows ?? [];

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const ta = new Date(a.last_activity_at).getTime();
      const tb = new Date(b.last_activity_at).getTime();
      return sort === "updated_asc" ? ta - tb : tb - ta;
    });
    return arr;
  }, [rows, sort]);

  // For view counts we always want the full-portfolio counts (independent of active filter).
  const { data: allData } = useQuery({
    queryKey: ["engine", "projects", "all", q],
    queryFn: () => listFn({ data: { filter: "all", q } }),
  });
  const allRows = allData?.rows ?? [];

  const counts = useMemo(() => countsFor(allRows), [allRows]);

  const setSearch = (patch: Partial<SearchState>) =>
    navigate({ search: (prev: SearchState) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="max-w-[1600px] flex gap-6">
      {/* LEFT VIEWS RAIL */}
      <aside
        className={cn(
          "shrink-0 w-56 lg:block",
          railOpen ? "block" : "hidden",
          "lg:sticky lg:top-4 lg:self-start",
        )}
      >
        <ViewsRail
          counts={counts}
          activeFilter={filter}
          onPick={(f) => setSearch({ filter: f, page: 1 })}
        />
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* HEADER */}
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="lg:hidden mt-1 p-1.5 rounded border border-border hover:bg-paper-soft"
              aria-label="Toggle views"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                Portfolio
              </div>
              <h1 className="font-display text-4xl text-ink mt-1">Projects</h1>
              <p className="text-sm text-ink/60 mt-2">
                Portfolio overview across all client work.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm text-ink/80 hover:border-royal/50"
            >
              <FilterIcon className="w-4 h-4" />
              Filters
            </button>
            <Link
              to="/engine/projects/new"
              className="bg-ink text-white px-4 py-2 rounded-md text-sm hover:bg-ink/90"
            >
              + New project
            </Link>
          </div>
        </header>

        {showFilters && (
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={q}
                onChange={(e) => setSearch({ q: e.target.value })}
                placeholder="Search client or project"
                className="pl-9 pr-3 py-2 rounded-md border border-border bg-paper text-sm w-full"
              />
            </div>
            <div className="text-xs text-ink/50">
              Active view:{" "}
              <span className="text-ink/80">{VIEW_LABELS[filter] ?? filter}</span>
            </div>
          </div>
        )}

        {/* ASK CAPTAIN STRIP */}
        <AskCaptainStrip
          onPick={(action) => {
            if (action === "needs_decision")
              setSearch({ filter: "needs_review", sort: "updated_desc" });
            else if (action === "blocked") setSearch({ filter: "blocked" });
            else if (action === "in_execution") setSearch({ filter: "in_execution" });
            else if (action === "changed") setSearch({ sort: "updated_desc" });
          }}
        />

        {/* STAT CARDS */}
        <StatCardRow rows={allRows} counts={counts} />

        {/* MAIN + RIGHT RAIL */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="min-w-0 space-y-4">
            <SectionCard
              title={`${sortedRows.length} project${sortedRows.length === 1 ? "" : "s"}`}
              right={
                <button
                  type="button"
                  onClick={() =>
                    setSearch({
                      sort: sort === "updated_desc" ? "updated_asc" : "updated_desc",
                    })
                  }
                  className="text-xs text-ink/60 hover:text-ink"
                >
                  Sort: updated {sort === "updated_desc" ? "newest" : "oldest"}
                </button>
              }
            >
              {isLoading ? (
                <div className="py-10 text-center text-ink/50 text-sm">Loading</div>
              ) : sortedRows.length === 0 ? (
                <EmptyState title="No projects match" hint="Adjust filters to see more." />
              ) : (
                <>
                  <ProjectsTable rows={pagedRows} />
                  <TablePager
                    total={sortedRows.length}
                    page={currentPage}
                    pageSize={PAGE_SIZE}
                    totalPages={totalPages}
                    onPage={(p) => setSearch({ page: p })}
                  />
                </>
              )}
            </SectionCard>
          </div>

          <div className="space-y-4">
            <RequiresAttentionCard
              rows={allRows}
              onFilter={(f) => setSearch({ filter: f })}
            />
            {cc?.recent_activity && cc.recent_activity.length > 0 && (
              <RecentActivityCard items={cc.recent_activity.slice(0, 5)} />
            )}
            <CaptainBriefCard rows={allRows} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── views rail ─────────────────────────────────────────────────────────────
const VIEW_LABELS: Record<string, string> = {
  all: "All projects",
  needs_review: "Needs review",
  in_execution: "In execution",
  blocked: "Blocked",
  delivered: "Delivered",
  archived: "Archived",
};

function countsFor(rows: EngineProjectRow[]) {
  const c = {
    all: rows.length,
    needs_decision: rows.filter((r) => r.open_decisions > 0).length,
    needs_review: rows.filter((r) => r.status === "needs_review").length,
    in_execution: rows.filter((r) => r.status === "in_execution").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    delivered: rows.filter((r) => r.status === "delivered").length,
    archived: rows.filter((r) => r.status === "archived").length,
    active: rows.filter((r) => r.status === "active").length,
    open_decisions: rows.reduce((n, r) => n + (r.open_decisions ?? 0), 0),
    spend_month_cents: rows.reduce((n, r) => n + (r.agent_spend_month_cents ?? 0), 0),
  };
  return c;
}

function ViewsRail({
  counts,
  activeFilter,
  onPick,
}: {
  counts: ReturnType<typeof countsFor>;
  activeFilter: FilterValue;
  onPick: (f: FilterValue) => void;
}) {
  // "Waiting on client" is omitted because no client-vs-internal owner distinction exists in the data.
  const views: Array<{ key: FilterValue | "needs_decision"; label: string; count: number }> = [
    { key: "all", label: "All projects", count: counts.all },
    { key: "needs_decision", label: "Needs decision", count: counts.needs_decision },
    { key: "needs_review", label: "Needs review", count: counts.needs_review },
    { key: "in_execution", label: "In execution", count: counts.in_execution },
    { key: "blocked", label: "Blocked", count: counts.blocked },
    { key: "delivered", label: "Delivered", count: counts.delivered },
    { key: "archived", label: "Archived", count: counts.archived },
  ];

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
          Views
        </div>
        <nav className="space-y-1">
          {views.map((v) => {
            const filterForSearch: FilterValue =
              v.key === "needs_decision" ? "all" : v.key;
            const isActive =
              v.key === "needs_decision"
                ? activeFilter === "all" && counts.needs_decision > 0
                : activeFilter === v.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => onPick(filterForSearch)}
                className={cn(
                  "w-full flex items-center justify-between text-left px-2 py-1.5 rounded-md text-sm transition",
                  isActive
                    ? "bg-ink text-white"
                    : "text-ink/75 hover:bg-paper-soft",
                )}
              >
                <span>{v.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-mono px-1.5 py-0.5 rounded",
                    isActive ? "bg-white/15" : "bg-paper-soft text-ink/60",
                  )}
                >
                  {v.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-border pt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
          Shortcuts
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            to="/engine/approvals"
            className="block px-2 py-1.5 rounded-md text-ink/75 hover:bg-paper-soft"
          >
            Approvals
          </Link>
          <Link
            to="/engine/operations"
            className="block px-2 py-1.5 rounded-md text-ink/75 hover:bg-paper-soft"
          >
            Operations
          </Link>
          <Link
            to="/engine"
            className="block px-2 py-1.5 rounded-md text-ink/75 hover:bg-paper-soft"
          >
            Command Center
          </Link>
        </nav>
      </div>
    </div>
  );
}

// ─── ask captain strip ──────────────────────────────────────────────────────
function AskCaptainStrip({
  onPick,
}: {
  onPick: (a: "needs_decision" | "blocked" | "in_execution" | "changed") => void;
}) {
  const chips: Array<{ key: Parameters<typeof onPick>[0]; label: string }> = [
    { key: "needs_decision", label: "What needs my decision today" },
    { key: "blocked", label: "Which projects are blocked" },
    { key: "in_execution", label: "Ready for build" },
    { key: "changed", label: "Changed since yesterday" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-ink/70">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-royal/10 text-royal">
          <Sparkles className="w-4 h-4" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]">Ask captain</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onPick(c.key)}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-paper text-ink/80 hover:border-royal/50 hover:text-ink"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── stat cards ─────────────────────────────────────────────────────────────
function StatCardRow({
  rows,
  counts,
}: {
  rows: EngineProjectRow[];
  counts: ReturnType<typeof countsFor>;
}) {
  const cards: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Active projects", value: String(counts.active) },
    { label: "Needs review", value: String(counts.needs_review) },
    { label: "Blocked", value: String(counts.blocked) },
    { label: "Open decisions", value: String(counts.open_decisions) },
    {
      label: "Agent spend this month",
      value: formatCents(counts.spend_month_cents),
      hint: `${rows.length} project${rows.length === 1 ? "" : "s"}`,
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl bg-card border border-border p-4 shadow-sm">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            {c.label}
          </div>
          <div className="font-display text-2xl text-ink mt-2 leading-none">{c.value}</div>
          {c.hint && <div className="text-xs text-ink/50 mt-2">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── main table ─────────────────────────────────────────────────────────────
function ProjectsTable({ rows }: { rows: EngineProjectRow[] }) {
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/50 border-b border-border">
            <th className="py-2 px-5 font-medium">Project</th>
            <th className="py-2 px-2 font-medium">Client</th>
            <th className="py-2 px-2 font-medium">Phase / stage</th>
            <th className="py-2 px-2 font-medium">Health</th>
            <th className="py-2 px-2 font-medium">Next best action</th>
            <th className="py-2 px-2 font-medium">Decisions</th>
            <th className="py-2 px-2 font-medium">Updated</th>
            <th className="py-2 px-5 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ProjectRow key={r.id} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRow({ r }: { r: EngineProjectRow }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-paper-soft align-top">
      <td className="py-3 px-5">
        <Link
          to="/engine/projects/$projectId/overview"
          params={{ projectId: r.id }}
          className="block"
        >
          <div className="text-ink font-medium">{r.name}</div>
          <div className="text-xs text-ink/50 mt-0.5">
            {r.client_company} · v{r.roadmap_version ?? "—"}
            {r.approved_version ? ` · approved v${r.approved_version}` : ""} ·{" "}
            {r.source_count} source{r.source_count === 1 ? "" : "s"}
          </div>
        </Link>
      </td>
      <td className="py-3 px-2 text-ink/70">{r.client_company}</td>
      <td className="py-3 px-2">
        <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-border bg-paper-soft text-ink/70">
          {r.current_phase} · {r.current_step.replace(/_/g, " ")}
        </span>
      </td>
      <td className="py-3 px-2">
        <HealthDot status={r.status} />
        <div className="mt-1">
          <EngineStatusBadge status={r.status} />
        </div>
      </td>
      <td className="py-3 px-2 text-ink/80">{nextBestAction(r)}</td>
      <td className="py-3 px-2 text-ink/70">{r.open_decisions}</td>
      <td className="py-3 px-2 text-ink/70 whitespace-nowrap">
        {formatDate(r.last_activity_at)}
      </td>
      <td className="py-3 px-5">
        <div className="flex items-center gap-2 justify-end">
          <Link
            to="/engine/projects/$projectId/overview"
            params={{ projectId: r.id }}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-ink text-white hover:bg-ink/90"
          >
            Open <ArrowRight className="w-3 h-3" />
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-md border border-border text-ink/60 hover:bg-paper-soft"
              aria-label="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1 text-xs">
                <Link
                  to="/engine/projects/$projectId/signal-room"
                  params={{ projectId: r.id }}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-1.5 text-ink/80 hover:bg-paper-soft"
                >
                  Add source
                </Link>
                <Link
                  to="/engine/review"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-1.5 text-ink/80 hover:bg-paper-soft"
                >
                  Review items
                </Link>
                <Link
                  to="/engine/projects/$projectId/preview"
                  params={{ projectId: r.id }}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-1.5 text-ink/80 hover:bg-paper-soft"
                >
                  Portal: {r.portal_publish_status.replace(/_/g, " ")}
                </Link>
                <div className="border-t border-border my-1" />
                <div className="px-3 py-1.5 text-ink/50">
                  Agent: {r.agent_status} ·{" "}
                  {formatCents(r.agent_spend_month_cents)}
                </div>
                {r.next_critical_date && (
                  <div className="px-3 py-1.5 text-ink/50">
                    Deadline: {formatDate(r.next_critical_date.due_on)} ·{" "}
                    {r.next_critical_date.label}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function TablePager({
  total,
  page,
  pageSize,
  totalPages,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (total <= pageSize) {
    return (
      <div className="pt-3 text-xs text-ink/50">
        Showing {total} of {total}
      </div>
    );
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="pt-3 flex items-center justify-between text-xs text-ink/60">
      <div>
        Showing {start} to {end} of {total}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-paper-soft"
        >
          <ChevronLeft className="w-3 h-3" /> Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-paper-soft"
        >
          Next <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── right rail ─────────────────────────────────────────────────────────────
function RequiresAttentionCard({
  rows,
  onFilter,
}: {
  rows: EngineProjectRow[];
  onFilter: (f: FilterValue) => void;
}) {
  const attention = rows
    .filter((r) => r.status === "blocked" || r.status === "needs_review")
    .sort((a, b) => (a.status === "blocked" ? -1 : 1) - (b.status === "blocked" ? -1 : 1))
    .slice(0, 6);

  return (
    <SectionCard
      title="Requires attention"
      right={
        <button
          type="button"
          onClick={() => onFilter("blocked")}
          className="text-xs text-royal hover:underline"
        >
          View blocked
        </button>
      }
    >
      {attention.length === 0 ? (
        <div className="text-sm text-ink/50 py-4">Nothing needs attention.</div>
      ) : (
        <ul className="space-y-3">
          {attention.map((r) => (
            <li key={r.id}>
              <Link
                to="/engine/projects/$projectId/overview"
                params={{ projectId: r.id }}
                className="block group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-medium truncate group-hover:text-royal">
                      {r.name}
                    </div>
                    <div className="text-xs text-ink/60 truncate">
                      {nextBestAction(r)}
                    </div>
                  </div>
                  <EngineStatusBadge status={r.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RecentActivityCard({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    severity: string;
    created_at: string;
    project_name: string | null;
    project_id: string | null;
  }>;
}) {
  return (
    <SectionCard title="Recent activity">
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="text-ink/85">{a.title}</div>
            <div className="text-xs text-ink/50 mt-0.5">
              {a.project_name ?? "Portfolio"} · {timeAgo(a.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function CaptainBriefCard({ rows }: { rows: EngineProjectRow[] }) {
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;
  const changed = rows.filter(
    (r) => new Date(r.last_activity_at).getTime() >= dayAgo,
  ).length;
  const blocked = rows.filter((r) => r.status === "blocked");
  const needsReview = rows.filter((r) => r.status === "needs_review");

  // Recommendation: blocked first, then most open decisions, then oldest updated.
  const recommendation =
    blocked[0] ??
    [...rows]
      .filter((r) => r.open_decisions > 0)
      .sort((a, b) => b.open_decisions - a.open_decisions)[0] ??
    needsReview[0] ??
    null;

  return (
    <SectionCard title="Captain brief">
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            What changed
          </div>
          <div className="text-ink/85 mt-1">
            {changed} project{changed === 1 ? "" : "s"} updated in the last 24 hours.
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            What matters now
          </div>
          <div className="text-ink/85 mt-1">
            {blocked.length} blocked, {needsReview.length} awaiting review.
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            Recommendation
          </div>
          {recommendation ? (
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId: recommendation.id }}
              className="text-ink/85 mt-1 block hover:text-royal"
            >
              Start with{" "}
              <span className="font-medium">{recommendation.name}</span>
              <span className="text-ink/50"> · {nextBestAction(recommendation)}</span>
            </Link>
          ) : (
            <div className="text-ink/60 mt-1">Nothing urgent in the queue.</div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
