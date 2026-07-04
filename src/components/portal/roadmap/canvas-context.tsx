import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PhaseKey } from "@/lib/portal-roadmap-model";
import {
  DEFAULT_MUTED_KINDS,
  DEFAULT_VISIBLE_KINDS,
  type LegendKind,
  type ZoomLevel,
} from "./view-mode";

type NodeRefs = Map<string, HTMLElement>;

/** Persisted UI state key. */
const LS_STATUS_COLLAPSED = "portal.roadmap.status.collapsed";
const LS_LEGEND_VISIBLE = "portal.roadmap.legend.visible";
const LS_LEGEND_MUTED = "portal.roadmap.legend.muted";

function loadKindSet(key: string, fallback: Set<LegendKind>): Set<LegendKind> {
  if (typeof window === "undefined") return new Set(fallback);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set(fallback);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(fallback);
    return new Set(arr as LegendKind[]);
  } catch {
    return new Set(fallback);
  }
}

function saveKindSet(key: string, set: Set<LegendKind>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

type CanvasCtx = {
  /** Total scrollable width of the canvas in px. */
  scrollWidth: number;
  /** Current scrollLeft of the canvas viewport in px. */
  scrollLeft: number;
  /** Visible viewport width in px. */
  clientWidth: number;
  /** Phase whose horizontal band contains the viewport center. */
  viewportPhaseKey: string | null;
  /** Business-truth "current phase" — injected from the journey model. */
  currentPhaseKey: PhaseKey | null;
  /** Phase the user explicitly focused (e.g. via mini-map click). */
  selectedPhaseKey: PhaseKey | null;
  /** Slug of the marker whose adjacent segment should be highlighted. */
  highlightedSlug: string | null;
  /** Information zoom — controls marker density on the canvas. */
  zoomLevel: ZoomLevel;
  /** Kinds shown at full strength via the interactive legend. */
  visibleKinds: Set<LegendKind>;
  /** Kinds shown at muted strength (dimmed, no label). */
  mutedKinds: Set<LegendKind>;
  /** Cluster keys the user has explicitly fanned out ("exploded"). */
  explodedClusterKeys: Set<string>;
  /** Horizontal pixels reserved on the right for the open drawer (0 when closed
   *  or when the drawer is a bottom sheet on mobile). Drives pan-offset math
   *  so the selected marker never hides behind the drawer, at any viewport. */
  drawerOffset: number;

  setScrollState: (s: { scrollWidth: number; scrollLeft: number; clientWidth: number }) => void;
  setCurrentPhaseKey: (k: PhaseKey | null) => void;
  setSelectedPhaseKey: (k: PhaseKey | null) => void;
  setHighlightedSlug: (s: string | null) => void;
  setZoomLevel: (z: ZoomLevel) => void;
  setDrawerOffset: (px: number) => void;
  /** Cycle a legend kind: visible → muted → hidden → visible. */
  toggleKind: (k: LegendKind) => void;
  /** Toggle whether a cluster is fanned out in place. */
  toggleClusterExpanded: (key: string) => void;
  /** Collapse every fanned-out cluster (e.g. on zoom change). */
  collapseAllClusters: () => void;

  /** Smooth-scroll the canvas so that `x` is visible near the viewport center. */
  scrollToX: (x: number) => void;
  /**
   * Pan the visible viewport so `x` is centered inside `canvasWidth - drawerWidth`
   * (so the marker isn't hidden behind an open drawer).
   */
  scrollToXWithDrawer: (x: number, drawerWidth: number) => void;
  registerScroller: (el: HTMLElement | null) => void;

  /** Focus-return registry: markers register themselves so the sheet can
   *  return focus to the originating node when it closes. */
  registerNode: (slug: string, el: HTMLElement | null) => void;
  focusNode: (slug: string) => void;
};

const Ctx = createContext<CanvasCtx | null>(null);

export function RoadmapCanvasProvider({ children }: { children: React.ReactNode }) {
  const [scrollWidth, setScrollWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const [viewportPhaseKey, setViewportPhaseKey] = useState<string | null>(null);
  const [currentPhaseKey, setCurrentPhaseKey] = useState<PhaseKey | null>(null);
  const [selectedPhaseKey, setSelectedPhaseKey] = useState<PhaseKey | null>(null);
  const [highlightedSlug, setHighlightedSlug] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("strategic");
  const [visibleKinds, setVisibleKinds] = useState<Set<LegendKind>>(() =>
    loadKindSet(LS_LEGEND_VISIBLE, DEFAULT_VISIBLE_KINDS),
  );
  const [mutedKinds, setMutedKinds] = useState<Set<LegendKind>>(() =>
    loadKindSet(LS_LEGEND_MUTED, DEFAULT_MUTED_KINDS),
  );
  const [explodedClusterKeys, setExplodedClusterKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [drawerOffset, setDrawerOffset] = useState(0);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const nodeRefs = useRef<NodeRefs>(new Map());

  useEffect(() => saveKindSet(LS_LEGEND_VISIBLE, visibleKinds), [visibleKinds]);
  useEffect(() => saveKindSet(LS_LEGEND_MUTED, mutedKinds), [mutedKinds]);

  const setScrollState = useCallback(
    (s: { scrollWidth: number; scrollLeft: number; clientWidth: number }) => {
      setScrollWidth(s.scrollWidth);
      setScrollLeft(s.scrollLeft);
      setClientWidth(s.clientWidth);
    },
    [],
  );

  const registerScroller = useCallback((el: HTMLElement | null) => {
    scrollerRef.current = el;
  }, []);

  const scrollToX = useCallback((x: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, x - el.clientWidth / 2);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, []);

  const scrollToXWithDrawer = useCallback((x: number, drawerWidth: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const visible = Math.max(0, el.clientWidth - drawerWidth);
    const target = Math.max(0, x - visible / 2);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, []);

  const registerNode = useCallback((slug: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(slug, el);
    else nodeRefs.current.delete(slug);
  }, []);

  const focusNode = useCallback((slug: string) => {
    const el = nodeRefs.current.get(slug);
    if (el) el.focus({ preventScroll: false });
  }, []);

  const toggleKind = useCallback((k: LegendKind) => {
    setVisibleKinds((prev) => {
      const isVisible = prev.has(k);
      let mutedState = false;
      setMutedKinds((mPrev) => {
        mutedState = mPrev.has(k);
        const next = new Set(mPrev);
        if (isVisible) {
          // visible -> muted
          next.add(k);
        } else if (mutedState) {
          // muted -> hidden
          next.delete(k);
        } else {
          // hidden -> visible (no change here)
        }
        return next;
      });
      const nextVisible = new Set(prev);
      if (isVisible) nextVisible.delete(k);
      else if (!mutedState) nextVisible.add(k); // hidden -> visible
      return nextVisible;
    });
  }, []);

  const toggleClusterExpanded = useCallback((key: string) => {
    setExplodedClusterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAllClusters = useCallback(() => {
    setExplodedClusterKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // Any zoom change should reset in-place expansions — the marker layout
  // shifts, so lingering fanned-out members would be misleading.
  useEffect(() => {
    setExplodedClusterKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, [zoomLevel]);

  const value = useMemo<CanvasCtx>(
    () => ({
      scrollWidth,
      scrollLeft,
      clientWidth,
      viewportPhaseKey,
      currentPhaseKey,
      selectedPhaseKey,
      highlightedSlug,
      zoomLevel,
      visibleKinds,
      mutedKinds,
      explodedClusterKeys,
      setScrollState,
      setCurrentPhaseKey,
      setSelectedPhaseKey,
      setHighlightedSlug,
      setZoomLevel,
      toggleKind,
      toggleClusterExpanded,
      collapseAllClusters,
      scrollToX,
      scrollToXWithDrawer,
      registerScroller,
      registerNode,
      focusNode,
    }),
    [
      scrollWidth,
      scrollLeft,
      clientWidth,
      viewportPhaseKey,
      currentPhaseKey,
      selectedPhaseKey,
      highlightedSlug,
      zoomLevel,
      visibleKinds,
      mutedKinds,
      explodedClusterKeys,
      setScrollState,
      scrollToX,
      scrollToXWithDrawer,
      registerScroller,
      registerNode,
      focusNode,
      toggleKind,
      toggleClusterExpanded,
      collapseAllClusters,
    ],
  );

  // Internal setter for viewport-derived phase — exposed on the context via a
  // separate function name so consumers know it's live state, not user intent.
  (value as CanvasCtx & { setViewportPhaseKey: (k: string | null) => void }).setViewportPhaseKey =
    setViewportPhaseKey;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the canvas context. */
export function useRoadmapCanvas(): CanvasCtx & {
  setViewportPhaseKey: (k: string | null) => void;
} {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRoadmapCanvas must be used inside RoadmapCanvasProvider");
  return c as CanvasCtx & { setViewportPhaseKey: (k: string | null) => void };
}

/** Compact hook: `displayPhase = selectedPhaseKey || viewportPhaseKey || currentPhaseKey`. */
export function useDisplayPhaseKey(): string | null {
  const c = useRoadmapCanvas();
  return c.selectedPhaseKey ?? c.viewportPhaseKey ?? c.currentPhaseKey ?? null;
}

/** Persistence key for the collapsed status card (imported by StatusOverlayCard). */
export const STATUS_COLLAPSED_KEY = LS_STATUS_COLLAPSED;
