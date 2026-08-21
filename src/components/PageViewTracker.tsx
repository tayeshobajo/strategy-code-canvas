import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { recordFirstTouch } from "@/lib/website-intake/attribution";
import { trackEvent } from "@/lib/website-intake/track";
import { initGoogleAnalytics, trackGaPageView } from "@/lib/analytics/gtag";

/** Emits one grounded page_view per path visit. Analytics only. */
export function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    recordFirstTouch();
    initGoogleAnalytics();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith("/api") || pathname.startsWith("/lovable")) return;
    trackEvent({ name: "page_view", dedupe: `${pathname}:${Date.now()}` });
    trackGaPageView(pathname);
  }, [pathname]);

  return null;
}

