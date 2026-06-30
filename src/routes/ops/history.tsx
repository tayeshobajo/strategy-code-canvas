import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Search } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ops/Primitives";
import { StatusBadge } from "@/components/ops/StatusBadge";
import { listHistory } from "@/lib/ops.functions";

const searchSchema = z.object({
  status: z.enum(["approved", "rejected", "archived", "all"]).optional(),
  q: z.string().optional(),
  page: z.number().optional(),
});

export const Route = createFileRoute("/ops/history")({
  validateSearch: searchSchema,
  component: HistoryPage,
});

function HistoryPage() {
  const search = Route.useSearch();
  const status = search.status ?? "all";
  const page = search.page ?? 1;
  const [q, setQ] = useState(search.q ?? "");

  const history = useQuery({
    queryKey: ["ops", "history", status, q, page],
    queryFn: () =>
      listHistory({
        data: { status, search: q, page, page_size: 25 },
      }),
  });

  return (
    <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
      <PageHeader
        title="Approved · Rejected · Archived"
        subtitle="Search past roadmap decisions. Reopen anything that needs more work."
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eeeee7] px-5 py-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca0b8]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by founder, company, or email..."
              className="w-full rounded-md border border-[#e0e0d8] bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-[#3a4fcf] focus:ring-2 focus:ring-[#3a4fcf]/15"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("status", e.target.value);
              url.searchParams.delete("page");
              window.location.assign(url.toString());
            }}
            className="rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All decisions</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-[#7d8095]">
                <th className="px-5 py-3 font-medium">Founder / company</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
                <th className="px-5 py-3 font-medium">Decided</th>
                <th className="px-5 py-3 font-medium">Core signal</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {history.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[#7d8095]">
                    Loading…
                  </td>
                </tr>
              ) : (history.data?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12">
                    <EmptyState title="No history yet" body="Decisions will show up here once you approve, reject, or archive." />
                  </td>
                </tr>
              ) : (
                history.data!.rows.map((row) => (
                  <tr key={row.review_id} className="border-t border-[#f1f1ea] hover:bg-[#fafaf5]">
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-[#171c38]">{row.name}</div>
                      <div className="text-[12px] text-[#7d8095]">
                        {row.business ?? "—"} · {row.email}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusBadge status={row.review_status} />
                    </td>
                    <td className="px-5 py-4 align-top text-[#3b3f55]">
                      {new Date(row.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4 align-top text-[#3b3f55]">
                      {new Date(row.review_updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4 align-top max-w-[320px]">
                      <div className="line-clamp-2 text-[13px] text-[#3b3f55]">
                        {row.core_signal || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-right">
                      <Link
                        to="/ops/submissions/$id"
                        params={{ id: row.submission_id }}
                        className="text-xs font-medium text-[#3a4fcf] hover:underline"
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

        {history.data && history.data.total > history.data.page_size ? (
          <div className="flex items-center justify-between border-t border-[#eeeee7] px-5 py-3 text-xs text-[#7d8095]">
            <span>
              Page {history.data.page} of{" "}
              {Math.max(1, Math.ceil(history.data.total / history.data.page_size))} ·{" "}
              {history.data.total} total
            </span>
            <div className="flex gap-2">
              <a
                href={`?status=${status}&q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}`}
                className="rounded-md border border-[#e0e0d8] bg-white px-3 py-1.5 text-[#171c38] hover:bg-[#f9f9f4]"
              >
                Prev
              </a>
              <a
                href={`?status=${status}&q=${encodeURIComponent(q)}&page=${page + 1}`}
                className="rounded-md border border-[#e0e0d8] bg-white px-3 py-1.5 text-[#171c38] hover:bg-[#f9f9f4]"
              >
                Next
              </a>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
