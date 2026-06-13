import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Target,
  Layers,
  Compass,
  ShieldCheck,
  CheckCircle2,
  CircleDot,
  Calendar,
  Zap,
  UserRound,
  MapPin,
  Mail,
  Linkedin,
} from "lucide-react";
import heroAsset from "@/assets/trust-tai-hero.png.asset.json";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trust Tai — The Business Operating Roadmap" },
      { name: "description", content: "We map the journey from where your business is today to where it needs to be — and build the first leg toward the position you could own in a decade." },
      { property: "og:title", content: "Trust Tai — The Business Operating Roadmap" },
      { property: "og:description", content: "A living plan from Point A to Point C. Built for founders who are done guessing." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

const NAV = [
  { label: "The Roadmap", href: "#roadmap", active: true },
  { label: "What We Build", href: "#what" },
  { label: "Investment", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Insights", href: "#insights" },
];

const FEATURES = [
  { icon: Target, title: "Clarity over complexity", body: "We cut through noise and map what matters." },
  { icon: Layers, title: "Strategy and execution", body: "One plan. Real milestones. Measurable outcomes." },
  { icon: Compass, title: "Built to compound", body: "Each milestone strengthens your position long term." },
  { icon: ShieldCheck, title: "Yours to own", body: "You can carry this roadmap into the future — with or without us." },
];

const CHECKLIST: { label: string; body: string }[] = [
  { label: "Point A, documented", body: "how the business runs today and what the drag costs" },
  { label: "Point B, defined", body: "the 24 month destination, in your numbers" },
  { label: "Point C, named", body: "the position you could own in ten years" },
  { label: "The unbuilt asset", body: "the compounding advantage you already hold" },
  { label: "The build order", body: "every milestone, sequenced, with what each unlocks" },
  { label: "The economics", body: "the revenue case, modeled and tracked" },
  { label: "Who carries what", body: "what stays inside the build, and what stays outside it" },
  { label: "The scoreboard", body: "what gets measured, and when" },
];

const TABS = [
  "The Letter",
  "The Summary",
  "Point A",
  "The Asset",
  "Point C",
  "Point B",
  "The Gap",
  "The Build Order",
  "The Economics",
  "The Recommendation",
  "Investment",
  "Who Carries What",
  "Integrity",
  "The Scoreboard",
  "Stewardship",
];

type Status = "mapped" | "build" | "live";
type Row = { name: string; segs: { start: number; end: number; status: Status }[] };

function buildRows(items: { name: string; start: number; end: number }[]): Row[] {
  const last = items.length - 1;
  return items.map((it, i) => {
    const segs: Row["segs"] = [];
    if (it.start > 1) segs.push({ start: 1, end: it.start - 1, status: "mapped" });
    const stillInBuild = i >= last - 1;
    if (stillInBuild) {
      segs.push({ start: it.start, end: 8, status: "build" });
    } else {
      segs.push({ start: it.start, end: it.end, status: "build" });
      if (it.end < 8) segs.push({ start: it.end + 1, end: 8, status: "live" });
    }
    return { name: it.name, segs };
  });
}

const TAB_DATA: { label: string; rows: Row[] }[] = [
  {
    label: "Consulting firm",
    rows: buildRows([
      { name: "Converting Website", start: 1, end: 2 },
      { name: "Connected CRM", start: 1, end: 3 },
      { name: "Operating Dashboard", start: 2, end: 4 },
      { name: "Lead Engine", start: 3, end: 5 },
      { name: "Client Portal", start: 4, end: 6 },
      { name: "AI Support Assistant", start: 5, end: 7 },
      { name: "SEO & Content Engine", start: 5, end: 8 },
      { name: "Workflow Automation", start: 6, end: 8 },
    ]),
  },
  {
    label: "Education business",
    rows: buildRows([
      { name: "Converting Website", start: 1, end: 2 },
      { name: "Connected CRM", start: 1, end: 3 },
      { name: "Learning Platform", start: 2, end: 5 },
      { name: "E-commerce Store", start: 3, end: 5 },
      { name: "Operating Dashboard", start: 4, end: 6 },
      { name: "AI Support Assistant", start: 5, end: 7 },
      { name: "Content Engine", start: 5, end: 8 },
      { name: "Workflow Automation", start: 7, end: 8 },
    ]),
  },
  {
    label: "Healthcare practice",
    rows: buildRows([
      { name: "Converting Website", start: 1, end: 2 },
      { name: "Connected CRM", start: 1, end: 3 },
      { name: "Booking & Payments", start: 2, end: 4 },
      { name: "Patient Portal", start: 3, end: 6 },
      { name: "Operating Dashboard", start: 4, end: 6 },
      { name: "AI Support Assistant", start: 5, end: 7 },
      { name: "Patient Education Hub", start: 6, end: 8 },
      { name: "Workflow Automation", start: 6, end: 8 },
    ]),
  },
];

const WALKS = [
  {
    name: "The Fast Walk",
    price: "$7,500 per month",
    total: "$90,000 over the walk",
    months: 12,
    body: "Point B in one year. The heaviest months, the earliest arrival.",
  },
  {
    name: "The Middle Walk",
    price: "$4,500 per month",
    total: "$81,000 over the walk",
    months: 18,
    body: "Point B in eighteen months.",
  },
  {
    name: "The Steady Walk",
    price: "$2,500 per month",
    total: "$60,000 over the walk",
    months: 24,
    body: "Point B in two years. The walk most founders fund from operations.",
  },
];

function WalkFigure({
  walking,
  arrived,
  strideMs,
}: {
  walking: boolean;
  arrived: boolean;
  strideMs: number;
}) {
  const aStyle = walking
    ? { animation: `tt-step-a ${strideMs}ms steps(1, end) infinite` }
    : undefined;
  const bStyle = walking
    ? { animation: `tt-step-b ${strideMs}ms steps(1, end) infinite` }
    : undefined;
  return (
    <svg
      width="26"
      height="40"
      viewBox="0 0 20 36"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      fill="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-royal block overflow-visible"
    >
      {/* head */}
      <circle cx="10" cy="3.2" r="2.8" stroke="none" />
      {/* torso */}
      <line x1="10" y1="6.5" x2="10" y2="18.5" strokeWidth="3.4" fill="none" />
      {walking ? (
        <>
          <g style={aStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 10 L6.8 16.5" strokeWidth="2.4" />
            <path d="M10 10 L13.2 15.5" strokeWidth="2.4" />
            <path d="M10 18 L13.4 30.5" strokeWidth="3" />
            <path d="M10 18 L8 24 L6.2 27.5" strokeWidth="3" />
          </g>
          <g style={bStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 10 L13.2 16.5" strokeWidth="2.4" />
            <path d="M10 10 L6.8 15.5" strokeWidth="2.4" />
            <path d="M10 18 L6.6 30.5" strokeWidth="3" />
            <path d="M10 18 L12 24 L13.8 27.5" strokeWidth="3" />
          </g>
        </>
      ) : arrived ? (
        <>
          {/* victory pose: arms up in a V, legs planted shoulder-width */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 9.5 L5.4 3" strokeWidth="2.4" />
            <path d="M10 9.5 L14.6 3" strokeWidth="2.4" />
            <path d="M10 18 L8.4 30.5" strokeWidth="3" />
            <path d="M10 18 L11.6 30.5" strokeWidth="3" />
          </g>
          {/* confetti */}
          <g
            stroke="none"
            style={{ animation: "tt-confetti 380ms ease-out 1 both" }}
          >
            <circle cx="3.8" cy="1.2" r="0.9" />
            <circle cx="10" cy="-0.6" r="0.9" />
            <circle cx="16.2" cy="1.2" r="0.9" />
            <circle cx="6.4" cy="-1.4" r="0.7" />
            <circle cx="13.6" cy="-1.4" r="0.7" />
          </g>
        </>
      ) : (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 10 L7.6 17" strokeWidth="2.4" />
          <path d="M10 10 L12.4 17" strokeWidth="2.4" />
          <path d="M10 18 L8.6 30.5" strokeWidth="3" />
          <path d="M10 18 L11.4 30.5" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

// Total walk durations are scaled so on-screen pixel speed is roughly constant
// across the three routes — Fast finishes first.
const STEADY_DURATION_MS = 9000;
// Per-walk stride cadence: faster pace = shorter stride interval.
const STRIDE_MS = [360, 420, 480];

function AnimatedWalksChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState<number[]>(() => WALKS.map(() => 0));
  const [arrivedAt, setArrivedAt] = useState<(number | null)[]>(() =>
    WALKS.map(() => null),
  );
  const startedRef = useRef(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;

      if (reduce) {
        setProgress(WALKS.map(() => 1));
        setArrivedAt(WALKS.map(() => performance.now()));
        return;
      }

      const t0 = performance.now();
      const durations = WALKS.map((w) => STEADY_DURATION_MS * (w.months / 24));
      const arrivedLocal: (number | null)[] = WALKS.map(() => null);

      let raf = 0;
      const tick = (now: number) => {
        const elapsed = now - t0;
        const next = durations.map((d, i) => {
          let p = Math.min(1, elapsed / d);
          // ease-out over the last 10%
          if (p > 0.9) {
            const k = (p - 0.9) / 0.1;
            p = 0.9 + 0.1 * (1 - Math.pow(1 - k, 2));
          }
          if (p >= 1 && arrivedLocal[i] === null) {
            arrivedLocal[i] = now;
          }
          return p;
        });
        setProgress(next);
        if (arrivedLocal.some((a) => a !== null)) {
          setArrivedAt((prev) => {
            // only update if changed
            let changed = false;
            const merged = prev.map((v, i) => {
              if (v === null && arrivedLocal[i] !== null) {
                changed = true;
                return arrivedLocal[i];
              }
              return v;
            });
            return changed ? merged : prev;
          });
        }
        if (next.some((p) => p < 1)) {
          raf = requestAnimationFrame(tick);
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    };

    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            start();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="mt-14 rounded-lg border border-rule bg-white/40 p-6 lg:p-10"
    >
      <style>{`
        @keyframes tt-walk-bob {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -2px); }
        }
        @keyframes tt-marker-pulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          45% { transform: translate(-50%, -50%) scale(1.35); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes tt-ring {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.55; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        @keyframes tt-step-a { 0%, 49.999% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes tt-step-b { 0%, 49.999% { opacity: 0; } 50%, 100% { opacity: 1; } }
        @keyframes tt-fade-in {
          from { opacity: 0; transform: translate(-50%, 3px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes tt-confetti {
          0%   { opacity: 0; transform: translateY(4px); }
          60%  { opacity: 1; transform: translateY(-2px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <h3 className="font-display text-[1.6rem] text-ink">
        The Build. Three walks. One destination.
      </h3>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink/65">
        Every walk reaches Point B. The pace decides when you arrive.
      </p>

      <div className="mt-10 space-y-10 md:space-y-8">
        {WALKS.map((w, i) => {
          const pct = (w.months / 24) * 100;
          const p = progress[i] ?? 0;
          const arrived = p >= 1;
          const walking = p > 0 && p < 1;
          const figureLeft = `${pct * p}%`;
          const strideMs = STRIDE_MS[i];
          return (
            <div
              key={w.name}
              className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8"
            >
              {/* Label rail */}
              <div className="md:pt-1">
                <div className="font-display text-[15px] text-ink">{w.name}</div>
                <div className="mt-1 font-display text-[1.05rem] leading-none text-royal">
                  {w.price}
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink/50">
                  {w.total}
                </div>
              </div>

              {/* Route + caption */}
              <div>
                <div className="relative h-20">
                  {/* dotted route — full length, uniform opacity */}
                  <div
                    className="absolute top-1/2 left-0 -translate-y-1/2 border-t border-dashed border-royal/45 z-0"
                    style={{ width: `${pct}%` }}
                  />
                  {/* Point A (start) */}
                  <span className="absolute top-1/2 left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal z-10" />
                  {/* Point B pulse ring (one-shot on arrival) */}
                  {arrived && (
                    <span
                      key={`ring-${arrivedAt[i] ?? "x"}`}
                      className="pointer-events-none absolute top-1/2 h-3 w-3 rounded-full border border-royal/60 z-10"
                      style={{
                        left: `${pct}%`,
                        animation: "tt-ring 700ms ease-out 1 forwards",
                      }}
                    />
                  )}
                  {/* Point B marker */}
                  <span
                    className="absolute top-1/2 h-3 w-3 rounded-full border-2 border-royal z-20"
                    style={{
                      left: `${pct}%`,
                      backgroundColor: arrived ? "var(--royal)" : "transparent",
                      transform: "translate(-50%, -50%)",
                      animation: arrived
                        ? "tt-marker-pulse 450ms ease-out 1"
                        : undefined,
                    }}
                  />
                  {/* Drop tick from label down toward marker */}
                  <span
                    aria-hidden="true"
                    className="absolute bg-royal/35 z-10"
                    style={{
                      left: `${pct}%`,
                      top: "-22px",
                      width: "1px",
                      height: "10px",
                      transform: "translateX(-50%)",
                    }}
                  />
                  {/* Label: POINT B → ARRIVED · MONTH N */}
                  {arrived ? (
                    <span
                      key={`arr-${arrivedAt[i] ?? "x"}`}
                      className="absolute font-mono text-[10.5px] uppercase tracking-[0.14em] text-royal whitespace-nowrap"
                      style={{
                        left: `${pct}%`,
                        top: "-38px",
                        transform: "translateX(-50%)",
                        animation: "tt-fade-in 280ms ease-out 1 both",
                      }}
                    >
                      Arrived · Month {w.months}
                    </span>
                  ) : (
                    <span
                      className="absolute font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink/55 whitespace-nowrap"
                      style={{ left: `${pct}%`, top: "-38px", transform: "translateX(-50%)" }}
                    >
                      Point B
                    </span>
                  )}
                  {/* Walking figure + ground shadow */}
                  <div
                    className="absolute z-10"
                    style={{
                      left: `calc(${pct * p}% - 8px)`,
                      bottom: "calc(50% - 1px)",
                      transform: "translate(-50%, 0)",
                      animation: walking
                        ? `tt-walk-bob ${strideMs}ms ease-in-out infinite`
                        : undefined,
                    }}
                  >
                    {/* ground shadow */}
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 -translate-x-1/2 rounded-full bg-royal/25"
                      style={{
                        bottom: "-2px",
                        width: "16px",
                        height: "3px",
                        filter: "blur(0.6px)",
                        opacity: arrived ? 0.35 : 0.22,
                      }}
                    />
                    <WalkFigure walking={walking} arrived={arrived} strideMs={strideMs} />
                  </div>
                </div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink/60">{w.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Month axis — desktop/tablet only */}
      <div className="mt-8 hidden md:block md:pl-[212px]">
        <div className="relative h-6 border-t border-rule">
          {[0, 6, 12, 18, 24].map((m) => (
            <div
              key={m}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${(m / 24) * 100}%` }}
            >
              <span className="h-1.5 w-px bg-rule" />
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/55">
                {m} months
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


const PROMISES = [
  { icon: Calendar, title: "60-Minute Conversation", body: "We listen first. You talk. No sales deck." },
  { icon: Zap, title: "Clarity You Can Use", body: "Leave with insights, even if we don't work together." },
  { icon: UserRound, title: "Right Fit Matters", body: "We'll tell you if we're not the right partner." },
];

function Index() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header />
      <Hero />
      <FeatureStrip />
      <RoadmapSection />
      <Pricing />
      <CTABand />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="relative z-20 border-b border-rule/50 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="/" className="text-ink"><TrustTaiLogo /></a>
        <nav className="hidden items-center gap-9 text-[13px] text-ink/75 lg:flex">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className={`relative pb-1 transition-colors hover:text-ink ${n.active ? "text-royal" : ""}`}>
              {n.label}
              {n.active && <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-royal" />}
            </a>
          ))}
        </nav>
        <a href="#cta" className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-paper transition-transform hover:scale-[1.02]">
          Build My Map <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-paper">
      <div className="lg:grid lg:grid-cols-[48fr_52fr] lg:items-stretch">
        <div className="relative flex items-center px-6 py-14 pr-6 lg:py-20 lg:pl-10 lg:pr-12 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]">
          <div className="hero-texture pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true" />
          <div className="relative z-10 max-w-[620px]">
            <h1 className="font-display text-[3rem] leading-[1.04] tracking-tight text-ink sm:text-[3.5rem]">
              We map the journey from where your business is to{" "}
              <span className="italic text-royal">where it needs to be.</span>
            </h1>
            <p className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-ink/70">
              We map the journey from where your business is today (Point A) to where it needs to be at 24 months (Point B) — and build the first leg toward the position you could own in a decade (Point C).
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#cta" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90">
                Build My Map
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#pricing" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-transparent px-6 text-[13.5px] font-medium text-ink transition-colors hover:border-ink/40">
                See what it costs
              </a>
            </div>
            <p className="mt-5 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60">
              <span className="inline-block h-px w-5 bg-ink/40" />
              <span>A 30 minute conversation. No pitch.</span>
            </p>
          </div>
        </div>

        <div className="relative h-[420px] w-full lg:h-full lg:min-h-[640px]">
          <img
            src={heroAsset.url}
            alt="Trust Tai Business Operating Roadmap booklet on a textured desk"
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          {/* Feathered seam between text and image */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-paper to-transparent lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}



function FeatureStrip() {
  return (
    <section className="border-y border-rule/70 bg-white">
      <div className="mx-auto max-w-7xl px-6 pb-12 pt-8 lg:px-10 lg:pb-[72px]">
        <h2 className="text-center font-display text-2xl text-ink">Built for founders who are done guessing.</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-royal/25 text-royal">
                <f.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-sans text-[15px] font-semibold tracking-normal text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink/65">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoadmapSection() {
  return (
    <section id="roadmap" className="bg-secondary/60">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-[minmax(380px,440px)_minmax(760px,1fr)] lg:gap-16 lg:px-10 lg:pt-[72px] lg:pb-24 xl:gap-[72px]">
        <div>
          <p className="eyebrow">What You Get</p>
          <h2 className="mt-4 font-display text-[2.5rem] leading-[1.1] text-ink">
            A living plan. Specific.<br />Sequenced. Yours.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-ink/70">
            The Operating Map turns strategy into a build order your team can follow. It shows what matters now, what can wait, what each milestone must unlock, and where the business is headed over the next 24 months.
          </p>
          <ul className="mt-8 space-y-4">
            {CHECKLIST.map((c) => (
              <li key={c.label} className="flex items-start gap-3 text-[13.5px] leading-[1.65] text-ink/75">
                <CheckCircle2 className="mt-[3px] h-[16px] w-[16px] flex-none text-royal" strokeWidth={1.75} />
                <span>
                  <span className="font-semibold text-ink">{c.label}:</span> {c.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <RoadmapPanel />
          <p className="mt-5 text-[13px] leading-relaxed text-ink/60">
            Three businesses, three build orders. Yours will hold your milestones, in your order. The order is a conversation, not a contract.
          </p>
        </div>
      </div>
    </section>
  );
}

function RoadmapPanel() {
  const statusColor: Record<Status, string> = {
    mapped: "bg-royal-soft/35",
    build: "bg-royal/80",
    live: "bg-ink",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-white">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-rule px-6 py-3.5">
        <div>
          <div className="font-display text-lg text-ink">Trust Tai</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">Operating Map</div>
        </div>
        <div className="hidden gap-10 text-[11px] sm:flex">
          {[
            { l: "Point A", s: "Where you are" },
            { l: "Point B", s: "Where you need to be (24 months)" },
            { l: "Point C", s: "The position you could own (10 years)" },
          ].map((p) => (
            <div key={p.l}>
              <div className="font-mono uppercase tracking-[0.16em] text-royal">{p.l}</div>
              <div className="mt-0.5 text-ink/60">{p.s}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[148px_1fr]">
        {/* Tabs */}
        <div className="bg-ink py-1.5 text-paper/70">
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`flex w-full cursor-pointer items-center gap-2 px-3.5 py-[5px] text-left text-[11.5px] transition-colors ${
                i === 7
                  ? "bg-royal/25 text-paper"
                  : "text-paper/55 hover:bg-white/5 hover:text-paper/80"
              }`}
            >
              <CircleDot
                className={`h-3 w-3 ${i === 7 ? "opacity-70" : "opacity-30"}`}
                strokeWidth={1.5}
              />
              {t}
            </button>
          ))}
        </div>
        {/* Gantt */}
        <div className="px-8 pt-5 pb-5">
          <div className="mb-3.5 flex items-end justify-between">
            <h3 className="font-display text-xl text-ink">The Build Order</h3>
          </div>
          <BuildOrderChart statusColor={statusColor} />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-y-3 border-t border-rule/70 pt-3.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink/55">

            <div>24 Month Operating Map · 8 Quarters, Sequenced</div>
            <div className="flex items-center gap-6 whitespace-nowrap">
              {[
                { l: "Mapped", c: "bg-royal-soft/35" },
                { l: "In build", c: "bg-royal/80" },
                { l: "Live", c: "bg-ink" },
              ].map((x) => (
                <span key={x.l} className="flex items-center gap-2 whitespace-nowrap normal-case">
                  <span className={`h-2.5 w-5 rounded-full ${x.c}`} />
                  <span className="tracking-normal text-ink/65">{x.l}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildOrderChart({ statusColor }: { statusColor: Record<Status, string> }) {
  const [active, setActive] = useState(0);
  const rows = TAB_DATA[active].rows;
  return (
    <>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45">
        Example build orders by business type
      </div>
      <div className="mb-5 inline-flex w-auto items-center gap-9 border-b border-rule/40 pr-2 text-[12.5px]">
        {TAB_DATA.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`group relative -mb-px cursor-pointer pb-2 font-medium transition-colors ${
              i === active
                ? "text-ink"
                : "text-ink/65 hover:text-ink"
            }`}
          >
            {t.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-[2px] transition-colors ${
                i === active
                  ? "bg-royal"
                  : "bg-transparent group-hover:bg-rule"
              }`}
            />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[170px_repeat(8,1fr)] gap-y-3.5 text-[11px] text-ink/55">

        <div />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="text-center font-mono">Q{i + 1}</div>
        ))}
        {rows.map((row, idx) => (
          <RoadmapRow
            key={row.name}
            row={row}
            statusColor={statusColor}
            recommended={idx === 0}
          />
        ))}
        {/* Intelligence Layer band */}
        <div className="mt-2.5 self-center pr-3 text-[12px] font-medium text-ink/75">
          Intelligence Layer
        </div>
        <div className="relative col-span-8 mt-2.5 h-7">
          <div className="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 rounded-full border border-royal-soft/25 bg-royal-soft/10" />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10.5px] tracking-normal text-ink/55">
            Continuous across every milestone
          </span>
        </div>
      </div>
    </>
  );
}

function RoadmapRow({
  row,
  statusColor,
  recommended,
}: {
  row: Row;
  statusColor: Record<Status, string>;
  recommended?: boolean;
}) {
  return (
    <>
      <div className="self-center pr-3 text-[12px] text-ink/80">
        <div className="font-medium">{row.name}</div>
        {recommended && (
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-royal/85">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-royal" />
            <span className="tracking-normal">Recommended start: funds the rest of the map</span>
          </div>
        )}
      </div>
      <div className="relative col-span-8 h-6">

        <div className="absolute inset-y-0 grid w-full grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="border-l border-dashed border-rule/25 first:border-l-0" />
          ))}
        </div>
        {row.segs.map((s, i) => {
          const left = ((s.start - 1) / 8) * 100;
          const width = ((s.end - s.start + 1) / 8) * 100;
          return (
            <div
              key={i}
              className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ${statusColor[s.status]}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
      </div>
    </>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-paper">
      <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10">
        {/* Header row: intro + Operating Map card */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          <div>
            <p className="eyebrow">Investment</p>
            <h2 className="mt-4 font-display text-[2.5rem] leading-[1.05] text-ink">
              What the journey costs.
            </h2>
            <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-ink/70">
              You have planned budgets before. You know a number you cannot see is a number you cannot plan around. So the numbers are here: the map, the walks, the math. Take them to your accountant, your partner, your Sunday evening. The work will be here when you decide.
            </p>
          </div>

          <div className="rounded-lg border border-rule bg-white p-6 lg:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="shrink-0 overflow-hidden rounded-md border border-rule bg-secondary/40">
                <img
                  src={heroAsset.url}
                  alt="The Operating Map cover"
                  className="h-32 w-40 object-cover sm:h-36 sm:w-44"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl leading-none text-ink">The Operating Map</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink/65">
                  The master plan that maps your journey from Point A to Point B to Point C.
                </p>
                <div className="mt-4 font-display text-[1.5rem] leading-none text-royal">$10,000 to $25,000</div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink/55">
                  One engagement. 1 to 2 weeks. Credited into the build if we walk together.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Walks chart */}
        <AnimatedWalksChart />


        {/* Caption */}
        <p className="mt-6 max-w-3xl text-[12.5px] leading-relaxed text-ink/55">
          Faster costs more in total and arrives sooner. Your map's economics section models what arriving early is worth in your numbers.
        </p>

        {/* Close */}
        <div className="mt-12 border-t border-rule pt-8">
          <p className="font-display text-[1.05rem] leading-relaxed text-ink">
            If the numbers fit, we should talk. If they do not, the work is waiting when it is.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <a
            href="#cta"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90"
          >
            Build My Map
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#cta"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-royal transition-colors hover:text-ink"
          >
            See the full Investment page <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function CTABand() {
  return (
    <section id="cta" className="contour-bg relative text-paper">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-[1fr_1.6fr] lg:px-10">
        <div>
          <h2 className="font-display text-[2.5rem] leading-[1.05]">Let's put your journey<br />on paper.</h2>
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-paper/70">
            A conversation is the first step.<br />There's no pitch. Just clarity.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-paper/25">
                <p.icon className="h-4.5 w-4.5" strokeWidth={1.5} />
              </div>
              <h3 className="mt-4 text-[14px] font-semibold">{p.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-paper/65">{p.body}</p>
            </div>
          ))}
          <div className="sm:col-span-3 sm:flex sm:justify-end">
            <a href="#" className="mt-2 inline-flex items-center gap-2 rounded-full border border-paper/30 px-5 py-3 text-[13px] font-medium text-paper transition-colors hover:bg-paper/10">
              Begin the Roadmap conversation <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
      <Footer inset />
    </section>
  );
}

function Footer({ inset = false }: { inset?: boolean }) {
  if (!inset) return null;
  return (
    <div className="border-t border-paper/10">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-4 lg:px-10">
        <div className="sm:col-span-1">
          <TrustTaiLogo className="text-paper" />
          <p className="mt-3 text-[12.5px] text-paper/55">The system behind the system.</p>
        </div>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/45">Navigation</div>
          <ul className="mt-4 space-y-2 text-[13px] text-paper/80">
            <li><a href="#roadmap" className="hover:text-paper">The Roadmap</a></li>
            <li><a href="#what" className="hover:text-paper">What We Build</a></li>
            <li><a href="#walks" className="hover:text-paper">The Walks</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/45">&nbsp;</div>
          <ul className="mt-4 space-y-2 text-[13px] text-paper/80">
            <li><a href="#about" className="hover:text-paper">About</a></li>
            <li><a href="#insights" className="hover:text-paper">Insights</a></li>
            <li><a href="#cta" className="hover:text-paper">Begin</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/45">Connect</div>
          <ul className="mt-4 space-y-2.5 text-[13px] text-paper/80">
            <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" strokeWidth={1.5} /> Murfreesboro, Tennessee</li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" strokeWidth={1.5} /> hello@trusttai.com</li>
            <li className="flex items-center gap-2"><Linkedin className="h-3.5 w-3.5" strokeWidth={1.5} /> LinkedIn</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-paper/10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-6 py-5 text-[11.5px] text-paper/50 sm:flex-row sm:items-center lg:px-10">
          <span>© 2026 Trust Tai. All rights reserved.</span>
          <span className="flex gap-6"><a href="#" className="hover:text-paper">Privacy Policy</a><a href="#" className="hover:text-paper">Terms of Service</a></span>
        </div>
      </div>
    </div>
  );
}
