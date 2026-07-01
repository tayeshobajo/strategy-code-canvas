import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalContext } from "@/lib/portal.functions";

/**
 * Shared, cached fetch of the caller's portal context (project, onboarding,
 * approved roadmap, billing preview). Used by every /portal/* page so the
 * project id + package name only round-trip once per session.
 */
export function usePortalContext() {
  const fetchCtx = useServerFn(getPortalContext);
  return useQuery({
    queryKey: ["portal", "context"],
    queryFn: () => fetchCtx({}),
    staleTime: 60_000,
  });
}
