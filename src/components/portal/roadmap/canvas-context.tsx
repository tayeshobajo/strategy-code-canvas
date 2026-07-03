import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type NodeRefs = Map<string, HTMLElement>;

type CanvasCtx = {
  /** Total scrollable width of the canvas in px. */
  scrollWidth: number;
  /** Current scrollLeft of the canvas viewport in px. */
  scrollLeft: number;
  /** Visible viewport width in px. */
  clientWidth: number;
  /** Slug of the phase that best matches the current scroll position. */
  activePhaseKey: string | null;
  /** Slug of the marker whose adjacent segment should be highlighted. */
  highlightedSlug: string | null;

  setScrollState: (s: { scrollWidth: number; scrollLeft: number; clientWidth: number }) => void;
  setActivePhaseKey: (k: string | null) => void;
  setHighlightedSlug: (s: string | null) => void;

  /** Smooth-scroll the canvas so that `x` is visible near the viewport center. */
  scrollToX: (x: number) => void;
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
  const [activePhaseKey, setActivePhaseKey] = useState<string | null>(null);
  const [highlightedSlug, setHighlightedSlug] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const nodeRefs = useRef<NodeRefs>(new Map());

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

  const registerNode = useCallback((slug: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(slug, el);
    else nodeRefs.current.delete(slug);
  }, []);

  const focusNode = useCallback((slug: string) => {
    const el = nodeRefs.current.get(slug);
    if (el) el.focus({ preventScroll: false });
  }, []);

  const value = useMemo<CanvasCtx>(
    () => ({
      scrollWidth,
      scrollLeft,
      clientWidth,
      activePhaseKey,
      highlightedSlug,
      setScrollState,
      setActivePhaseKey,
      setHighlightedSlug,
      scrollToX,
      registerScroller,
      registerNode,
      focusNode,
    }),
    [
      scrollWidth,
      scrollLeft,
      clientWidth,
      activePhaseKey,
      highlightedSlug,
      setScrollState,
      scrollToX,
      registerScroller,
      registerNode,
      focusNode,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoadmapCanvas(): CanvasCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRoadmapCanvas must be used inside RoadmapCanvasProvider");
  return c;
}
