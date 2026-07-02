import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalContext } from "@/lib/portal.functions";

// Lifecycle statuses at which the Roadmap/Files sidebar entries unlock.
// Mirrors the rules in src/routes/portal.tsx so we know when to stop polling.
const UNLOCK_STATUSES = new Set([
  "roadmap_ready",
  "roadmap_delivered",
  "engagement_active",
  "engagement_complete",
]);

/**
 * Shared, cached fetch of the caller's portal context (project, onboarding,
 * approved roadmap, billing preview). Used by every /portal/* page so the
 * project id + package name only round-trip once per session.
 *
 * While the client is still waiting on their approved Roadmap handoff, we
 * poll every 20s and refetch on window focus so the sidebar auto-unlocks the
 * moment Tai publishes the delivery — without requiring a manual refresh.
 * Once the roadmap is approved (or the project reaches an unlocked status),
 * polling stops and we fall back to the standard 60s stale window.
 */
export function usePortalContext() {
  const fetchCtx = useServerFn(getPortalContext);
  return useQuery({
    queryKey: ["portal", "context"],
    queryFn: () => fetchCtx({}),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { approvedRoadmap?: unknown; project?: { portal_status?: string } }
        | undefined;
      if (!data) return false;
      const unlocked =
        !!data.approvedRoadmap ||
        UNLOCK_STATUSES.has(data.project?.portal_status ?? "");
      return unlocked ? false : 20_000;
    },
  });
}
