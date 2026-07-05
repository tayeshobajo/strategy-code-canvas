import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/ops/Primitives";
import { StatusBadge, STATUS_FILTERS } from "@/components/ops/StatusBadge";
import { getQueueStats, listSubmissions, bulkSetReviewStatus } from "@/lib/ops.functions";
import { Button } from "@/components/ui/button";
import { ClipboardList, Edit3, Clock, Send, Search, ArrowUpDown, Loader2 } from "lucide-react";

const searchSchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["oldest", "newest"]).optional(),
});


export const Route = createFileRoute("/ops/queue")({
  validateSearch: searchSchema,
  component: QueuePage,
});

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  const yest = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function QueuePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const status = (search.status as string | undefined) ?? "queue";
  const sort = (search.sort as "oldest" | "newest" | undefined) ?? "oldest";
  const [q, setQ] = useState(search.q ?? "");

  const stats = useQuery({
    queryKey: ["ops", "queue-stats"],
    queryFn: () => getQueueStats(),
    staleTime: 30_000,
  });

  const submissions = useQuery({
    queryKey: ["ops", "queue", status, q, sort],
    queryFn: () =>
      listSubmissions({
        data: {
          status: status as "queue" | "all" | "needs_review" | "in_review" | "approved" | "rejected" | "archived",
          search: q,
          sort,
          limit: 100,
          offset: 0,
        },
      }),
    staleTime: 15_000,
  });

  const heading = useMemo(() => {
    switch (status) {
      case "in_review":
        return "In review";
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "archived":
        return "Archived";
      case "all":
        return "All submissions";
      default:
        return "Roadmap Review Queue";
    }
  }, [status]);

  return (
    <div className="px-6 py-6 md:px-10 md:py-8">
      <PageHeader
        title={heading}
        subtitle="New founder notes, generated drafts, and requests waiting for a decision."
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<ClipboardList className="h-5 w-5" />}
          value={stats.data?.needs_review ?? "—"}
          label="Needs review"
          sub="New submissions"
        />
        <StatTile
          icon={<Edit3 className="h-5 w-5" />}
          value={stats.data?.in_review ?? "—"}
          label="In review"
          sub="Being worked"
        />
        <StatTile
          icon={<Clock className="h-5 w-5" />}
          value={stats.data?.archived ?? "—"}
          label="Archived"
          sub="Set aside"
        />
        <StatTile
          icon={<Send className="h-5 w-5" />}
          value={stats.data?.approved_week ?? "—"}
          label="Approved this week"
          sub="Mon – Sun"
        />
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eeeee7] px-5 py-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca0b8]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  navigate({ search: (s: Record<string, unknown>) => ({ ...s, q: q || undefined }) });
              }}
              placeholder="Search by founder, company, email, or website..."
              className="w-full rounded-md border border-[#e0e0d8] bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-[#3a4fcf] focus:ring-2 focus:ring-[#3a4fcf]/15"
            />
          </div>
          <select
            value={status}
            onChange={(e) =>
              navigate({ search: (s: Record<string, unknown>) => ({ ...s, status: e.target.value || undefined }) })
            }
            className="rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              navigate({
                search: (s: Record<string, unknown>) => ({ ...s, sort: sort === "oldest" ? "newest" : "oldest" }),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm text-[#171c38] hover:bg-[#f9f9f4]"
            title="Toggle sort"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort === "oldest" ? "Oldest first" : "Newest first"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-[#7d8095]">
                <th className="px-5 py-3 font-medium">Founder</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Core signal</th>
                <th className="px-5 py-3 font-medium">Last updated</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-[#7d8095]">
                    Loading…
                  </td>
                </tr>
              ) : (submissions.data?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12">
                    <EmptyState
                      title="Nothing waiting"
                      body="When new founder submissions come in, they will land here for review."
                    />
                  </td>
                </tr>
              ) : (
                submissions.data!.map((row) => (
                  <tr
                    key={row.review_id}
                    className="border-t border-[#f1f1ea] hover:bg-[#fafaf5]"
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-[#171c38]">{row.name}</div>
                      <div className="text-[12px] text-[#7d8095]">{row.email}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="text-[#171c38]">{row.business ?? "—"}</div>
                      <div className="text-[12px] text-[#7d8095]">{row.website ?? ""}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-[#171c38]">
                      {formatWhen(row.submitted_at)}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusBadge status={row.review_status} />
                    </td>
                    <td className="px-5 py-4 align-top max-w-[320px]">
                      <div className="line-clamp-2 text-[13px] text-[#3b3f55]">
                        {row.core_signal || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-[12px] text-[#7d8095]">
                      {formatWhen(row.review_updated_at)}
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <Link
                        to="/ops/submissions/$id"
                        params={{ id: row.submission_id }}
                        className="inline-flex items-center justify-center rounded-md border border-[#3a4fcf]/30 px-3 py-1.5 text-xs font-medium text-[#3a4fcf] hover:bg-[#eef1fb]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
