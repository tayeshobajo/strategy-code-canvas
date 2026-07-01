// Central helper for resolving the canonical public site URL.
//
// Priority: PUBLIC_SITE_URL env var when set (server), otherwise the
// canonical Trust Tai domain. Legacy domains listed here are used by the
// domain-hygiene test and by the client-side canonical redirect.

export const CANONICAL_ORIGIN = "https://trusttai.com";
export const CANONICAL_HOST = "trusttai.com";

// Hosts that should redirect to the canonical origin at runtime.
// Preview / lovable.app hosts are NOT redirected — they are valid staging.
export const LEGACY_HOSTS: ReadonlyArray<string> = [
  "trust-tai.com",
  "www.trust-tai.com",
  "www.trusttai.com",
  "new.trusttai.com",
];

// Legacy string fragments that must not appear as hardcoded URLs in
// production source. Excludes /* allowlisted */ comments and known
// backward-compat email aliases.
export const LEGACY_URL_FRAGMENTS: ReadonlyArray<string> = [
  "https://trust-tai.com",
  "https://www.trust-tai.com",
  "https://new.trusttai.com",
  "https://www.trusttai.com",
];

function stripTrailingSlash(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

/**
 * Resolve the site URL for server-side use.
 * Reads PUBLIC_SITE_URL when available, otherwise falls back to trusttai.com.
 */
export function getPublicSiteUrl(env?: { PUBLIC_SITE_URL?: string }): string {
  const source =
    env?.PUBLIC_SITE_URL ??
    (typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined);
  const raw = (source ?? "").trim();
  if (!raw) return CANONICAL_ORIGIN;
  try {
    // Validate — throws for garbage.
    const u = new URL(raw);
    return stripTrailingSlash(`${u.protocol}//${u.host}`);
  } catch {
    return CANONICAL_ORIGIN;
  }
}

/** Build an absolute URL by joining the site URL with a path. */
export function absoluteUrl(path: string, env?: { PUBLIC_SITE_URL?: string }): string {
  const base = getPublicSiteUrl(env);
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Return true if the given host is a legacy host that should redirect. */
export function isLegacyHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return LEGACY_HOSTS.includes(host.toLowerCase());
}
