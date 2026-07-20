import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalContext } from "@/lib/portal.functions";
import { supabase } from "@/integrations/supabase/client";

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
 * The portal layout's beforeLoad already gated auth, so this hook does NOT
 * block on a serialized `getSession()` roundtrip before enabling the query —
 * it kicks off the fetch immediately and just watches auth state changes.
 *
 * While the client is still waiting on their approved Roadmap handoff, we
 * poll every 20s so the sidebar auto-unlocks the moment Tai publishes it.
 * Once approved (or the project reaches an unlocked status), polling stops
 * and we hold the result with a long stale window so tab switches don't
 * refetch and re-render.
 */
export function usePortalContext({ enabled: enabledProp = true }: { enabled?: boolean } = {}) {
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      setSignedOut(event === "SIGNED_OUT");
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);
  const enabled = enabledProp && !signedOut;
  const fetchCtx = useServerFn(getPortalContext);
  return useQuery({
    queryKey: ["portal", "context"],
    queryFn: () => fetchCtx({}),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: (query) => {
      if (!enabled) return false;
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
