import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Linkedin, Instagram } from "lucide-react";
import { NAV } from "@/components/SiteHeader";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.99L4.6 22H1.34l8.02-9.165L1 2h7.02l4.84 6.39L18.244 2Zm-1.2 18h1.9L7.04 4H5.05l11.994 16Z" />
    </svg>
  );
}
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

const NAVY = "#0A0F1F";
const ROUTE_BLUE = "#2563FF";
const CREAM = "oklch(0.92 0.07 85)";

const container = "mx-auto max-w-[1240px] px-6 sm:px-8 lg:px-10";

export type SiteClosingProps = {
  headline: ReactNode;
  supporting: ReactNode;
};

export function SiteClosing({ headline, supporting }: SiteClosingProps) {
  return (
    <>
      <section
        className="relative overflow-hidden text-white"
        style={{ backgroundColor: NAVY }}
      >
        <ContourField />

        {/* Close slot */}
        <div className={`${container} relative pt-4 pb-8 sm:pt-8 sm:pb-12`}>
          <div className="mx-auto max-w-[760px] text-center">
            <h2 className="font-display text-[clamp(1.85rem,4vw,2.6rem)] leading-[1.18] tracking-[-0.018em] text-white">
              {headline}
            </h2>
            <p className="mx-auto mt-5 max-w-[60ch] text-[14px] leading-[1.75] text-white/70">
              {supporting}
            </p>
          </div>

          <RouteAnimation />

          <div className="mt-2 flex flex-col items-center gap-4">
            <a
              href="#contact"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-[13.5px] font-semibold text-[#0A0F1F] transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-12px_rgba(255,255,255,0.4)]"
            >
              Build My Roadmap
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
            <p className="mx-auto max-w-[56ch] text-center text-[12px] leading-[1.75] text-white/50">
              A 30-minute conversation. If the timing is right, we should talk. If it is not, the work is waiting when it is.
            </p>
          </div>
        </div>

        {/* Footer chrome */}
        <div className={`${container} relative pb-12 pt-16`}>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-0 md:divide-x md:divide-white/10">
            <div className="md:pr-8">
              <img
                src={logoWhite.url}
                alt="Trust Tai"
                className="h-7 w-auto"
              />
              <p className="mt-4 text-[13px] leading-[1.6] text-white/55">
                The system behind the system.
              </p>
            </div>
            <div className="md:px-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                Navigate
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-white/70">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <Link
                      to={n.to}
                      hash={n.hash}
                      className="transition-colors hover:text-white"
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:px-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                Connect
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-white/70">
                <li>Murfreesboro, Tennessee</li>
                <li>
                  <a
                    href="mailto:hello@trusttai.com"
                    className="transition-colors hover:text-white"
                  >
                    hello@trusttai.com
                  </a>
                </li>
              </ul>
            </div>
            <div className="md:pl-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
                Follow
              </p>
              <div className="mt-4 flex items-center gap-3">
                <a
                  href="#"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
                <a
                  href="#"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <Instagram className="h-4 w-4" />
                </a>
                <a
                  href="#"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/45 sm:flex-row sm:items-center">
            <p>© 2026 Trust Tai. All rights reserved.</p>
            <div className="flex gap-5">
              <a href="#" className="hover:text-white">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------- Route animation -------------------- */
// Single horizontal journey: Point A → three uneven milestones → destination.
// Draws once on first scroll-in. Holds. No loop.
function RouteAnimation() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || armed) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.4) {
            setArmed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.4] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [armed]);

  // Path: gentle curve from (left, mid) to (right, mid).
  // viewBox 1000 x 100. Path drawn as a quadratic that rises softly then settles.
  const W = 1000;
  const H = 100;
  const startX = 40;
  const endX = 960;
  const midY = 56;
  const path = `M ${startX} ${midY} C 220 36, 420 78, 560 50 S 820 38, ${endX} ${midY}`;
  // Approximate pathLength for stroke-dash; we set pathLength="1" for normalized animation.
  const milestones = [0.22, 0.48, 0.78];

  // Compute approximate (x,y) for milestones by sampling a path in a hidden SVG node.
  const pathRef = useRef<SVGPathElement | null>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const total = p.getTotalLength();
    setPoints(
      milestones.map((t) => {
        const pt = p.getPointAtLength(total * t);
        return { x: pt.x, y: pt.y };
      }),
    );
    // milestones is a stable literal; no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = armed || reduced;
  // Total draw duration in ms
  const duration = 2500;

  return (
    <div ref={wrapRef} className="relative mx-auto mt-10 mb-10 w-full max-w-[860px]">
      {/* Point A label */}
      <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 select-none">
        <span className="block font-mono text-[10px] uppercase tracking-[0.25em] text-white/55">
          Point A
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[80px] w-full"
        aria-hidden="true"
      >
        {/* Hollow Point A marker */}
        <circle
          cx={startX}
          cy={midY}
          r={6}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={1.5}
        />
        {/* Hidden reference path for milestone point sampling */}
        <path
          ref={pathRef}
          d={path}
          fill="none"
          stroke="none"
          style={{ visibility: "hidden" }}
        />
        {/* Draw via clipPath that grows left→right */}
        <defs>
          <clipPath id="route-clip">
            <rect
              x={0}
              y={0}
              width={active ? W : 0}
              height={H}
              style={{
                transition: active
                  ? `width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
                  : "none",
              }}
            />
          </clipPath>
        </defs>
        <g clipPath="url(#route-clip)">
          <path
            d={path}
            fill="none"
            stroke={ROUTE_BLUE}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="2 7"
          />
        </g>

        {/* Milestones — light in sequence as the draw passes them */}
        {points.map((pt, i) => (
          <Milestone
            key={i}
            cx={pt.x}
            cy={pt.y}
            delayMs={Math.round(milestones[i] * duration)}
            active={active}
            reduced={reduced}
          />
        ))}

        {/* Destination marker on right — settles last with soft glow */}
        <DestinationMarker
          cx={endX}
          cy={midY}
          delayMs={duration}
          active={active}
          reduced={reduced}
        />
      </svg>
    </div>
  );
}

function Milestone({
  cx,
  cy,
  delayMs,
  active,
  reduced,
}: {
  cx: number;
  cy: number;
  delayMs: number;
  active: boolean;
  reduced: boolean;
}) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setLit(true);
      return;
    }
    const t = window.setTimeout(() => setLit(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, reduced, delayMs]);

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill={ROUTE_BLUE}
        opacity={lit ? 0.22 : 0}
        style={{ transition: "opacity 600ms ease-out" }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={lit ? ROUTE_BLUE : "rgba(255,255,255,0.18)"}
        style={{ transition: "fill 600ms ease-out" }}
      />
    </g>
  );
}

function DestinationMarker({
  cx,
  cy,
  delayMs,
  active,
  reduced,
}: {
  cx: number;
  cy: number;
  delayMs: number;
  active: boolean;
  reduced: boolean;
}) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setLit(true);
      return;
    }
    const t = window.setTimeout(() => setLit(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, reduced, delayMs]);

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={16}
        fill={ROUTE_BLUE}
        opacity={lit ? 0.18 : 0}
        style={{ transition: "opacity 700ms ease-out" }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={10}
        fill={ROUTE_BLUE}
        opacity={lit ? 0.32 : 0}
        style={{ transition: "opacity 700ms ease-out" }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={lit ? "#FFFFFF" : "rgba(255,255,255,0.35)"}
        style={{ transition: "fill 700ms ease-out" }}
      />
    </g>
  );
}

/* -------------------- Topographic texture -------------------- */
function ContourField() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1240 800"
    >
      <g fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1">
        {[60, 130, 220, 320, 430, 550, 680].map((r) => (
          <ellipse key={`l-${r}`} cx="180" cy="780" rx={r * 1.7} ry={r} />
        ))}
        {[60, 130, 220, 320, 430, 550, 680].map((r) => (
          <ellipse key={`r-${r}`} cx="1080" cy="40" rx={r * 1.7} ry={r} />
        ))}
      </g>
    </svg>
  );
}

/* Cream-italic accent helper for headlines */
export function Accent({ children }: { children: ReactNode }) {
  return (
    <em className="italic font-normal" style={{ color: CREAM }}>
      {children}
    </em>
  );
}

