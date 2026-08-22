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

  // Contact intent: mail and phone links only, no form values.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("a");
      const href = target?.getAttribute("href") ?? "";
      if (!href.startsWith("mailto:") && !href.startsWith("tel:")) return;
      trackEvent({
        name: "contact_clicked",
        dedupe: `${href.split(":")[0]}:${window.location.pathname}`,
        properties: { channel: href.startsWith("mailto:") ? "email" : "phone" },
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname.startsWith("/api") || pathname.startsWith("/lovable")) return;
    // One page_view per route per session: the key is stable, so a remount or
    // a retry never writes a second row.
    trackEvent({ name: "page_view", dedupe: pathname });
    trackGaPageView(pathname);
  }, [pathname]);

  return null;
}
