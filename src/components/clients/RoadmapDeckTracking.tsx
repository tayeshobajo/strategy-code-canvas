import { useEffect } from "react";
import { trackEvent } from "@/lib/website-intake/track";
import {
  CONTENT_READ_SECONDS,
  isContentRead,
} from "@/lib/website-intake/use-content-read";

/** Progress through the deck, whether it scrolls the window or its own container. */
function deckProgress(container: HTMLElement | null): number {
  if (typeof window === "undefined") return 0;
  if (container && container.scrollHeight > container.clientHeight + 8) {
    const total = Math.max(1, container.scrollHeight - container.clientHeight);
    return Math.min(1, Math.max(0, container.scrollTop / total));
  }
  const doc = document.documentElement;
  const total = Math.max(1, doc.scrollHeight - window.innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / total));
}

/**
 * Analytics for a client roadmap deck. Emits one page_view per visit, a
 * content_read once the deck is genuinely read, and cta_clicked for named
 * actions. No personal or form data is ever sent.
 */
export function RoadmapDeckTracking({
  slug,
  scrollContainerSelector,
}: {
  slug: string;
  /** Deck that scrolls inside its own element rather than the window. */
  scrollContainerSelector?: string;
}) {
  useEffect(() => {
    trackEvent({
      name: "page_view",
      dedupe: `roadmap:${slug}`,
      properties: { roadmap_slug: slug, surface: "client_deck" },
    });
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let fired = false;
    let activeSeconds = 0;
    let best = 0;

    const container = scrollContainerSelector
      ? (document.querySelector(scrollContainerSelector) as HTMLElement | null)
      : null;

    const measure = () => {
      best = Math.max(best, deckProgress(container));
    };

    const tick = () => {
      if (fired || document.visibilityState !== "visible") return;
      activeSeconds += 1;
      measure();
      if (isContentRead(best, activeSeconds)) {
        fired = true;
        trackEvent({
          name: "content_read",
          dedupe: `roadmap:${slug}`,
          properties: { roadmap_slug: slug, surface: "client_deck" },
        });
      }
    };

    measure();
    const timer = window.setInterval(tick, 1000);
    const target: EventTarget = container ?? window;
    target.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.clearInterval(timer);
      target.removeEventListener("scroll", measure);
    };
  }, [slug, scrollContainerSelector]);

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

export const DECK_READ_SECONDS = CONTENT_READ_SECONDS;
