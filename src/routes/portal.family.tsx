// Portal-safe family surface. Read-only. Uses the existing
// getPortalProjectFamily server fn which already filters to
// approved/completed + published nodes and returns an aggregated
// hiddenInProgressCount (never names in-progress relatives).

import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { usePortalContext } from "@/hooks/use-portal-context";
import { getPortalProjectFamily, type PortalFamilyPayload } from "@/lib/portal-family.functions";
import { PortalPage, PortalCard, PortalPageHeader } from "@/components/portal/PortalPage";

export const Route = createFileRoute("/portal/family")({
  head: () => ({
    meta: [
      { title: "Related projects — Trust Tai" },
      { name: "description", content: "Related workstreams for your engagement." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalFamilyPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed to load family: {(error as Error).message}</div>
  ),
});

function PortalFamilyPage() {
  const ctx = usePortalContext();
  const portalProjectId = (ctx.data as { project?: { id?: string } } | undefined)?.project?.id;

  return (
    <PortalPage>
      <PortalPageHeader
        eyebrow="Related projects"
        title="Your related workstreams"
        description="A view of the approved and completed projects related to your engagement. Anything still in progress is aggregated — we'll only name it once it's ready."
      />
      <Suspense fallback={<PortalCard><Loader2 className="w-4 h-4 animate-spin" /></PortalCard>}>
        {portalProjectId ? (
          <FamilyContent portalProjectId={portalProjectId} />
        ) : (
          <PortalCard>
            <p className="text-sm text-ink/70">Loading your project…</p>
          </PortalCard>
        )}
      </Suspense>
    </PortalPage>
  );
}

function FamilyContent({ portalProjectId }: { portalProjectId: string }) {
  const fetchFn = useServerFn(getPortalProjectFamily);
  const q = useQuery({
    queryKey: ["portal", "family", portalProjectId],
    queryFn: () => fetchFn({ data: { portalProjectId } }) as Promise<PortalFamilyPayload>,
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <PortalCard>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PortalCard>
    );
  }
  if (q.isError) {
    return (
      <PortalCard>
        <p className="text-sm text-red-700">Could not load related projects.</p>
      </PortalCard>
    );
  }
  const data = q.data;
  if (!data) return null;
  const { visible, hiddenInProgressCount } = data;

  return (
    <div className="space-y-4">
      <PortalCard>
        <h2 className="font-display text-xl text-ink">
          Related workstreams ({visible.length})
        </h2>
        {visible.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">
            No related workstreams are visible yet. We'll share more as things are approved.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visible.map((v) => (
              <li
                key={v.id}
                className="rounded-xl border border-border bg-white/70 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{v.name}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink/60">
                      {v.status}
                      {v.completed_at
                        ? ` · completed ${new Date(v.completed_at).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <StatusPill status={v.status} />
                </div>
                {v.child_progress.total > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/5">
                      <div
                        className="h-full bg-royal"
                        style={{
                          width: `${Math.round(
                            (v.child_progress.completed /
                              Math.max(1, v.child_progress.total)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-ink/60">
                      {v.child_progress.completed} of {v.child_progress.total} sub-projects
                      completed
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </PortalCard>

      <PortalCard>
        <h3 className="font-display text-lg text-ink">Impact summary</h3>
        {hiddenInProgressCount > 0 ? (
          <p className="mt-2 text-sm text-ink/70">
            {hiddenInProgressCount} additional workstream
            {hiddenInProgressCount === 1 ? " is" : "s are"} still in progress. We'll surface
            details here once each one is approved and ready to share.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink/70">
            Everything related to your engagement is visible above.
          </p>
        )}
        <p className="mt-4 text-xs text-ink/60">
          Have a question? <Link to="/portal/messages" search={{}} className="underline">Send us a message</Link>.
        </p>
      </PortalCard>
    </div>
  );
}

function StatusPill({ status }: { status: "approved" | "completed" }) {
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-royal/10 text-royal border-royal/30";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
