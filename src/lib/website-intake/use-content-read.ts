import { useEffect, useRef } from "react";
import { trackEvent } from "./track";

export const CONTENT_READ_PROGRESS = 0.5;
export const CONTENT_READ_SECONDS = 30;

/** Deterministic read test: half the article seen and half a minute of active time. */
export function isContentRead(progress: number, activeSeconds: number): boolean {
  return progress >= CONTENT_READ_PROGRESS && activeSeconds >= CONTENT_READ_SECONDS;
}

/**
 * Fires content_read once per article per session, only after meaningful
 * engagement. No scroll or mouse telemetry is ever sent.
 */
export function useContentRead(slug: string, elementId = "article-root") {
  const fired = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    fired.current = false;
    let activeSeconds = 0;
    let progress = 0;

    const measure = () => {
      const el = document.getElementById(elementId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      progress = Math.min(1, Math.max(0, -rect.top / total));
    };

    const tick = () => {
      if (fired.current) return;
      if (document.visibilityState !== "visible") return;
      activeSeconds += 1;
      measure();
      if (isContentRead(progress, activeSeconds)) {
        fired.current = true;
        trackEvent({ name: "content_read", dedupe: slug, properties: { slug } });
      }
    };

    measure();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", measure);
    };
  }, [slug, elementId]);
}
