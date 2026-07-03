import { useEffect, useState } from "react";
import { useRoadmapCanvas } from "./canvas-context";
import { measure as perfMeasure } from "./perf";

/** Drawer width on desktop — must match MilestoneSheet sm:max-w-[410px]. */
const DRAWER_WIDTH = 410;

type Props = {
  /** Slug of the selected marker. When null, the connector is hidden. */
  selectedSlug: string | null;
  /** True when the drawer is actually open (desktop only). */
  active: boolean;
};

/**
 * Subtle premium connector — a thin, glowing arc from the selected marker
 * to the left edge of the open drawer. Persists while the drawer is open,
 * updates on scroll/resize, and never intercepts pointer events.
 */
export function SelectionConnector({ selectedSlug, active }: Props) {
  const canvas = useRoadmapCanvas();
  const [box, setBox] = useState<{
    stageLeft: number;
    stageTop: number;
    stageWidth: number;
    stageHeight: number;
    markerX: number;
    markerY: number;
  } | null>(null);

  useEffect(() => {
    if (!active || !selectedSlug) {
      setBox(null);
      return;
    }
    const stage = document.getElementById("portal-canvas-scroll");
    if (!stage) return;

    let raf = 0;
    const measureRect = () => {
      raf = 0;
      perfMeasure("connector:measure", () => {
        // read the registered node's rect through the shared registry
        const marker = document.querySelector<HTMLElement>(
          `[data-milestone-node][data-marker-slug="${cssEscape(selectedSlug)}"]`,
        );
        const stageRect = stage.getBoundingClientRect();
        if (!marker) {
          setBox(null);
          return;
        }
        const mRect = marker.getBoundingClientRect();
        setBox({
          stageLeft: stageRect.left,
          stageTop: stageRect.top,
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          markerX: mRect.left + mRect.width / 2 - stageRect.left,
          markerY: mRect.top + mRect.height / 2 - stageRect.top,
        });
      });
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measureRect);
    };
    measureRect();
    stage.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(stage);
    return () => {
      stage.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // re-measure when pan/zoom changes propagate into context
  }, [selectedSlug, active, canvas.scrollLeft, canvas.scrollWidth, canvas.clientWidth]);


  if (!active || !selectedSlug || !box) return null;

  // Drawer left edge, relative to the stage box.
  const drawerLeft = box.stageWidth - DRAWER_WIDTH;
  // If the marker somehow sits under the drawer, don't draw.
  if (box.markerX < 0 || box.markerX > drawerLeft - 8) return null;
  if (box.markerY < 0 || box.markerY > box.stageHeight) return null;

  const startX = box.markerX + 14; // just outside the marker halo
  const startY = box.markerY;
  const endX = drawerLeft;
  const endY = Math.min(
    Math.max(box.markerY, 60),
    box.stageHeight - 60,
  );
  const midX = (startX + endX) / 2;
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

  return (
    <svg
      aria-hidden="true"
      data-testid="selection-connector"
      className="pointer-events-none absolute inset-0"
      width={box.stageWidth}
      height={box.stageHeight}
      viewBox={`0 0 ${box.stageWidth} ${box.stageHeight}`}
      style={{ zIndex: 40 }}
    >
      <defs>
        <linearGradient id="sel-connector-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(47,93,246,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
        </linearGradient>
        <filter id="sel-connector-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Outer soft glow */}
      <path
        d={path}
        fill="none"
        stroke="rgba(47,93,246,0.35)"
        strokeWidth={5}
        strokeLinecap="round"
        filter="url(#sel-connector-glow)"
      />
      {/* Crisp inner line */}
      <path
        d={path}
        fill="none"
        stroke="url(#sel-connector-grad)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray="1 5"
        opacity={0.9}
      />
      {/* Endpoint dot on the drawer edge */}
      <circle
        cx={endX}
        cy={endY}
        r={3.5}
        fill="rgba(255,255,255,0.95)"
        stroke="rgba(47,93,246,0.9)"
        strokeWidth={1.25}
      />
    </svg>
  );
}

function cssEscape(v: string): string {
  if (typeof window !== "undefined" && "CSS" in window && window.CSS?.escape) {
    return window.CSS.escape(v);
  }
  return v.replace(/["\\]/g, "\\$&");
}
