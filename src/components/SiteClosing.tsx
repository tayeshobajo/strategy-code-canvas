import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

const NAVY = "#0A0F1F";
const ROUTE_BLUE = "#2563FF";
const IVORY = "#FBF9F4";
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

        {/* Close slot — generous breathing room above the headline */}
        <div className={`${container} relative pt-[120px] sm:pt-[180px] pb-12 sm:pb-16`}>
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
              <img src={logoWhite.url} alt="Trust Tai" className="h-7 w-auto" />
              <p className="mt-4 text-[13px] leading-[1.6] text-white/55">
                The system behind the system.
              </p>
            </div>
            <div className="md:px-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Navigate</p>
              <ul className="mt-4 space-y-2 text-[13px] text-white/70">
                {NAV.map((n) => (
                  <li key={n.to}>
                    <Link to={n.to} hash={n.hash} className="transition-colors hover:text-white">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:px-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Connect</p>
              <ul className="mt-4 space-y-2 text-[13px] text-white/70">
                <li>Murfreesboro, Tennessee</li>
                <li>
                  <a href="mailto:hello@trusttai.com" className="transition-colors hover:text-white">
                    hello@trusttai.com
                  </a>
                </li>
              </ul>
            </div>
            <div className="md:pl-8">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Follow</p>
              <div className="mt-4 flex items-center gap-3">
                <a href="#" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white">
                  <Linkedin className="h-4 w-4" />
                </a>
                <a href="#" target="_blank" rel="noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white">
                  <Instagram className="h-4 w-4" />
                </a>
                <a href="#" target="_blank" rel="noreferrer" aria-label="X" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white">
                  <XIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/45 sm:flex-row sm:items-center">
            <p>© 2026 Trust Tai. All rights reserved.</p>
            <div className="flex gap-5">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------- Engraved cartographic route --------------------
   A single hairline contour, pre-etched into the navy. On scroll-in,
   one warm point of light travels its length once over ~3.5s, inscribing
   five hairline survey marks at uneven positions as it passes. The
   destination retains a faint electric-blue core. No loop, no pulse. */
function RouteAnimation() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 along path

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

  // Animate progress 0 → 1 over 3500ms with long ease-in-out.
  useEffect(() => {
    if (!armed) return;
    if (reduced) {
      setProgress(1);
      return;
    }
    const duration = 3500;
    const start = performance.now();
    let raf = 0;
    const easeInOut = (t: number) =>
      t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(easeInOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, reduced]);

  // Geometry — gentle contour-line wave across the field.
  const W = 1000;
  const H = 120;
  const startX = 56;
  const endX = 944;
  const path = `M ${startX} 70 C 180 38, 280 96, 400 70 S 560 38, 660 64 S 840 92, ${endX} 60`;

  // Uneven waypoints — cluster two close, then a long stretch, then spaced.
  // Values are normalized t along the path (0..1).
  const waypoints = [0.16, 0.24, 0.55, 0.72, 0.88];

  // Sample geometry from the SVG path once it's mounted.
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [endPt, setEndPt] = useState<{ x: number; y: number } | null>(null);
  const [travelPt, setTravelPt] = useState<{ x: number; y: number } | null>(null);
  const [totalLen, setTotalLen] = useState(0);

  useEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const total = p.getTotalLength();
    setTotalLen(total);
    setPts(
      waypoints.map((t) => {
        const pt = p.getPointAtLength(total * t);
        return { x: pt.x, y: pt.y };
      }),
    );
    const ept = p.getPointAtLength(total);
    setEndPt({ x: ept.x, y: ept.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update traveling light point.
  useEffect(() => {
    const p = pathRef.current;
    if (!p || !totalLen) return;
    const pt = p.getPointAtLength(totalLen * progress);
    setTravelPt({ x: pt.x, y: pt.y });
  }, [progress, totalLen]);

  return (
    <div ref={wrapRef} className="relative mx-auto mt-12 mb-10 w-full max-w-[860px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[96px] w-full" aria-hidden="true">
        {/* Pre-etched hairline contour — present at rest */}
        <path
          ref={pathRef}
          d={path}
          fill="none"
          stroke={IVORY}
          strokeOpacity={0.12}
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* Point A — hollow hairline ring */}
        <circle
          cx={startX}
          cy={70}
          r={5}
          fill="none"
          stroke={IVORY}
          strokeOpacity={0.55}
          strokeWidth={1}
        />

        {/* Survey marks — fade in as the light reaches each waypoint */}
        {pts.map((pt, i) => {
          const t = waypoints[i];
          // Begin inscribing slightly before arrival; fully inked at arrival.
          const lit = progress >= t;
          const opacity = lit ? 0.7 : 0;
          // Alternate between hairline ring and crosshair tick for variety.
          const isRing = i % 2 === 0;
          return (
            <g
              key={i}
              style={{
                opacity,
                transition: "opacity 600ms ease-out",
              }}
            >
              {isRing ? (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={3.5}
                  fill="none"
                  stroke={IVORY}
                  strokeWidth={1}
                />
              ) : (
                <g stroke={IVORY} strokeWidth={1} strokeLinecap="round">
                  <line x1={pt.x - 4} y1={pt.y} x2={pt.x + 4} y2={pt.y} />
                  <line x1={pt.x} y1={pt.y - 4} x2={pt.x} y2={pt.y + 4} />
                </g>
              )}
            </g>
          );
        })}

        {/* Destination — inscribed when light arrives; faint blue core. */}
        {endPt && (
          <g
            style={{
              opacity: progress >= 1 ? 1 : 0,
              transition: "opacity 700ms ease-out",
            }}
          >
            <circle
              cx={endPt.x}
              cy={endPt.y}
              r={5}
              fill="none"
              stroke={IVORY}
              strokeOpacity={0.7}
              strokeWidth={1}
            />
            <circle cx={endPt.x} cy={endPt.y} r={1.5} fill={ROUTE_BLUE} />
          </g>
        )}

        {/* Traveling point of light — only visible while moving */}
        {travelPt && !reduced && progress > 0 && progress < 1 && (
          <g>
            <circle
              cx={travelPt.x}
              cy={travelPt.y}
              r={2.5}
              fill={IVORY}
              opacity={0.95}
            />
            <circle
              cx={travelPt.x}
              cy={travelPt.y}
              r={6}
              fill={IVORY}
              opacity={0.18}
            />
          </g>
        )}
      </svg>

      {/* POINT A label, thin mono */}
      <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-[calc(50%+18px)] select-none">
        <span className="block font-mono text-[9px] uppercase tracking-[0.32em] text-white/45">
          Point A
        </span>
      </div>
    </div>
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
