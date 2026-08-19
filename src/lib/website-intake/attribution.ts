/**
 * First-touch attribution capture for the public site.
 *
 * Deliberately small: clean facts only, recorded once at the start of the
 * journey and carried into the intake record. No analytics platform lives
 * in this repo — Trust Tai OS does the reasoning.
 */

import type { Attribution } from "./types";

const STORAGE_KEY = "tt_first_touch_v1";
const SESSION_KEY = "tt_session_id_v1";
const PAGEVIEW_KEY = "tt_pageviews_v1";

export const EMPTY_ATTRIBUTION: Attribution = {
  landing_path: null,
  entry_referrer: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  gclid: null,
  fbclid: null,
  session_id: null,
  started_at: null,
  page_views_before_intake: null,
};

/** Pure parser so the behaviour is testable without a browser. */
export function parseAttribution(input: {
  url: string;
  referrer?: string | null;
  sessionId: string;
  startedAt: string;
  pageViews?: number | null;
}): Attribution {
  let params: URLSearchParams;
  let pathname = "/";
  try {
    const u = new URL(input.url);
    params = u.searchParams;
    pathname = u.pathname;
  } catch {
    params = new URLSearchParams();
  }
  const get = (k: string) => {
    const v = params.get(k);
    return v && v.trim() ? v.trim().slice(0, 200) : null;
  };
  const ref = (input.referrer ?? "").trim();
  return {
    landing_path: pathname,
    entry_referrer: ref ? ref.slice(0, 500) : null,
    utm_source: get("utm_source"),
    utm_medium: get("utm_medium"),
    utm_campaign: get("utm_campaign"),
    utm_term: get("utm_term"),
    utm_content: get("utm_content"),
    gclid: get("gclid"),
    fbclid: get("fbclid"),
    session_id: input.sessionId,
    started_at: input.startedAt,
    page_views_before_intake: input.pageViews ?? null,
  };
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** Record first touch once per session. Safe to call from an effect on every page. */
export function recordFirstTouch(): void {
  if (typeof window === "undefined") return;
  try {
    let sessionId = window.sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = randomId();
      window.sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    const views = Number(window.sessionStorage.getItem(PAGEVIEW_KEY) ?? "0") + 1;
    window.sessionStorage.setItem(PAGEVIEW_KEY, String(views));
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;
    const attribution = parseAttribution({
      url: window.location.href,
      referrer: document.referrer,
      sessionId,
      startedAt: new Date().toISOString(),
      pageViews: 0,
    });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    /* storage blocked — attribution is best effort */
  }
}

/** Read what we captured, topped up with the page views seen since. */
export function readAttribution(): Attribution {
  if (typeof window === "undefined") return EMPTY_ATTRIBUTION;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const views = Number(window.sessionStorage.getItem(PAGEVIEW_KEY) ?? "0");
    if (!raw) {
      recordFirstTouch();
      const retry = window.sessionStorage.getItem(STORAGE_KEY);
      if (!retry) return EMPTY_ATTRIBUTION;
      return { ...(JSON.parse(retry) as Attribution), page_views_before_intake: views };
    }
    return { ...(JSON.parse(raw) as Attribution), page_views_before_intake: Math.max(0, views - 1) };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}
