import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

/**
 * Per-room scroll restoration for the project workspace.
 *
 * TanStack's built-in scrollRestoration handles back/forward navigation
 * but resets to top when clicking a sibling <Link> to another route
 * (e.g. switching from Spine → Work via the persistent rail). This hook
 * keeps a sessionStorage-backed cache of window.scrollY per pathname,
 * scoped to a namespace, and restores it after paint on route change.
 */
export function useRoomScrollRestoration(namespace: string) {
  const location = useLocation();
  const router = useRouter();
  const pathname = location.pathname;
  const lastPath = useRef<string | null>(null);
  const restoreFrame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = (p: string) => `room-scroll:${namespace}:${p}`;

    // Save scroll on the previous path before switching.
    const prev = lastPath.current;
    if (prev && prev !== pathname) {
      try {
        sessionStorage.setItem(storageKey(prev), String(window.scrollY));
      } catch {
        /* ignore quota */
      }
    }
    lastPath.current = pathname;

    // Restore scroll for the new path after content paints. Try a few
    // frames because loader data may arrive asynchronously and change
    // page height.
    let attempts = 0;
    const raw = (() => {
      try {
        return sessionStorage.getItem(storageKey(pathname));
      } catch {
        return null;
      }
    })();
    const target = raw ? Number(raw) : 0;
    if (!Number.isFinite(target)) return;

    const restore = () => {
      window.scrollTo(0, target);
      attempts += 1;
      // Retry until the page is tall enough or we give up.
      if (attempts < 6 && document.documentElement.scrollHeight - window.innerHeight < target) {
        restoreFrame.current = window.requestAnimationFrame(restore);
      }
    };
    restoreFrame.current = window.requestAnimationFrame(restore);

    const onScroll = () => {
      try {
        sessionStorage.setItem(storageKey(pathname), String(window.scrollY));
      } catch {
        /* ignore quota */
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Persist on unload too.
    const onUnload = () => onScroll();
    window.addEventListener("pagehide", onUnload);

    return () => {
      if (restoreFrame.current) window.cancelAnimationFrame(restoreFrame.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onUnload);
      // Save final position on unmount / path change.
      try {
        sessionStorage.setItem(storageKey(pathname), String(window.scrollY));
      } catch {
        /* ignore */
      }
    };
    // router included so the effect re-arms if navigation model changes
  }, [pathname, namespace, router]);
}
