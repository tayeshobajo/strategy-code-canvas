import { useEffect } from "react";
import { trackEvent } from "@/lib/website-intake/track";
import { useContentRead } from "@/lib/website-intake/use-content-read";

/**
 * Analytics for a client roadmap deck. Emits one page_view per visit, a
 * content_read once the deck is genuinely read, and cta_clicked for named
 * actions. No personal or form data is ever sent.
 */
export function RoadmapDeckTracking({
  slug,
  readTargetId = "deck-root",
}: {
  slug: string;
  readTargetId?: string;
}) {
  useContentRead(`roadmap:${slug}`, readTargetId);

  useEffect(() => {
    trackEvent({
      name: "page_view",
      dedupe: `roadmap:${slug}`,
      properties: { roadmap_slug: slug, surface: "client_deck" },
    });
  }, [slug]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "a,button",
      ) as HTMLElement | null;
      if (!el) return;
      const label = (el.getAttribute("data-cta") ?? "").trim();
      const href = el.getAttribute("href") ?? "";
      const cta =
        label ||
        (href.includes("calendly")
          ? "book_a_call"
          : href.startsWith("/build-my-roadmap")
            ? "build_your_roadmap"
            : href.startsWith("/portal")
              ? "portal_sign_in"
              : "");
      if (!cta) return;
      trackEvent({
        name: "cta_clicked",
        dedupe: `roadmap:${slug}:${cta}`,
        properties: { cta, roadmap_slug: slug, surface: "client_deck" },
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [slug]);

  return null;
}
