/**
 * Google Analytics (GA4) browser tracking.
 *
 * Inert during SSR and when no measurement ID is configured. Runs alongside
 * the internal website-intake event stream; neither depends on the other.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let initialised = false;

/**
 * Public GA4 measurement ID for trusttai.com. Not a secret (it ships in the
 * client bundle by design). Used when the connector env var is absent from a
 * build environment, which previously left tracking silently inert.
 */
const FALLBACK_MEASUREMENT_ID = "G-M7M7Y7WDXW";

export function getMeasurementId(): string | null {
  const id = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY as
    | string
    | undefined;
  const trimmed = (id ?? "").trim() || FALLBACK_MEASUREMENT_ID;
  return trimmed ? trimmed : null;
}

// gtag.js only processes dataLayer entries that are real `arguments` objects.
// Pushing a plain array is silently ignored, so keep the classic shape.
function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  (function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  })(...(args as []));
}

/** Load gtag.js once. Safe to call on every render. */
export function initGoogleAnalytics(): void {
  if (typeof window === "undefined" || initialised) return;
  const measurementId = getMeasurementId();
  if (!measurementId) return;
  initialised = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  // Route changes are sent explicitly below.
  gtag("config", measurementId, { send_page_view: false });
}

let lastTrackedPath: string | null = null;

/** Send one GA4 page view for a client-side route change. */
export function trackGaPageView(path: string): void {
  if (typeof window === "undefined") return;
  const measurementId = getMeasurementId();
  if (!measurementId) return;
  // Effects can re-run for the same path (remount, hydration); send once.
  if (lastTrackedPath === path) return;
  lastTrackedPath = path;
  gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
