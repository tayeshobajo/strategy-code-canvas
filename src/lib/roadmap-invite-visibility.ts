/**
 * Route visibility rules for the persistent Roadmap invitation widget.
 *
 * Pure so the behaviour is testable without a browser or router.
 */

const HIDDEN_PREFIXES = [
  "/build-my-roadmap",
  "/checkout",
  "/api",
  "/admin",
  "/auth",
  "/login",
  "/ops",
  "/engine",
  "/portal",
  "/lovable",
  "/email",
  "/unsubscribe",
];

/** True when the invitation should be mounted on this path. */
export function showRoadmapInvite(pathname: string): boolean {
  const path = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  return !HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
