import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListPortals } from "@/lib/portal.functions";
import { Card, EmptyState, PageHeader } from "@/components/ops/Primitives";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/ops/portals")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-sm text-[#5d6079]">Loading portals…</div>}>
      <PortalsPage />
    </Suspense>
  ),
});

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PortalsPage() {
  const listFn = useServerFn(adminListPortals);
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["ops", "portals"],
      queryFn: () => listFn({}),
      staleTime: 30_000,
    }),
  );
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.projects;
    return data.projects.filter((p) => {
      return [p.primary_email, p.contact_name, p.company_name, p.portal_status]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [data.projects, q]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Client submissions"
        subtitle="Every client portal after payment — same source the client sees."
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b8fa3]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, company, email, status…"
              className="pl-9"
            />
          </div>
          <div className="text-xs text-[#5d6079] whitespace-nowrap">
            {rows.length} of {data.projects.length}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No submissions"
            description="Portals appear here after Stripe confirms payment."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-[#8b8fa3] border-b border-[#e7e6df]">
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Phase</th>
                  <th className="px-3 py-2 font-medium">Purchased</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-[#f0efe9] hover:bg-[#faf9f4]">
                    <td className="px-3 py-3">
                      <div className="font-medium text-[#171c38]">
                        {p.contact_name ?? p.primary_email}
                      </div>
                      <div className="text-[11px] text-[#5d6079]">{p.primary_email}</div>
                    </td>
                    <td className="px-3 py-3 text-[#171c38]">{p.company_name ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full bg-[#eef0fb] px-2 py-0.5 text-[11px] font-medium text-[#3b3f66]">
                        {(p.portal_status ?? "—").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#3b3f66]">{p.current_phase ?? "—"}</td>
                    <td className="px-3 py-3 text-[#5d6079]">{formatWhen(p.purchase_date)}</td>
                    <td className="px-3 py-3 text-[#5d6079]">
                      {formatWhen(p.last_client_activity_at ?? p.updated_at)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to="/admin/client-portals"
                        className="text-[12px] font-medium text-[#4453d4] hover:underline"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
