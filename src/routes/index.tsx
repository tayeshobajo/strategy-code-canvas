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
} from "lucide-react";
import heroAsset from "@/assets/trust-tai-hero.png.asset.json";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { ClientMarquee } from "@/components/ClientMarquee";
import { Reveal } from "@/hooks/use-reveal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_LABEL: Record<Status, string> = {
  mapped: "Mapped",
  build: "In build",
  live: "Live",
};

function ownerFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("website") || n.includes("seo") || n.includes("content")) return "Studio";
  if (n.includes("dashboard") || n.includes("operating")) return "Ops";
  if (n.includes("workflow") || n.includes("automation")) return "Automation";
  if (n.includes("ai") || n.includes("assistant") || n.includes("intelligence")) return "Intelligence";
  if (n.includes("learning") || n.includes("education")) return "Learning";
  if (n.includes("commerce") || n.includes("payments") || n.includes("booking")) return "Commerce";
  if (n.includes("crm") || n.includes("lead") || n.includes("portal")) return "Revenue";
  return "Build squad";
}

function phaseFor(startQ: number): string {
  if (startQ <= 2) return "Foundations";
  if (startQ <= 4) return "Activation";
  if (startQ <= 6) return "Compounding";
  return "Scale";
}

function rowSpan(row: Row): { start: number; end: number } {
  const start = Math.min(...row.segs.map((s) => s.start));
  const end = Math.max(...row.segs.map((s) => s.end));
  return { start, end };
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trust Tai | The Business Operating Roadmap" },
      { name: "description", content: "We map the journey from where your business is today to where it needs to be, and build the first leg toward the position you could own in a decade." },
      { property: "og:title", content: "Trust Tai | The Business Operating Roadmap" },
      { property: "og:description", content: "A living plan from Point A to Point C. Built for founders who are done guessing." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://new.trusttai.com/" },
    ],
    links: [{ rel: "canonical", href: "https://new.trusttai.com/" }],
    scripts: [
      {
        type: "application/ld+json",
          id: "jsonld-home",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Trust Tai | The Business Operating Roadmap",
          description:
            "We map the journey from where your business is today to where it needs to be, and build the first leg toward the position you could own in a decade.",
          url: "https://new.trusttai.com/",
          isPartOf: { "@type": "WebSite", name: "Trust Tai", url: "https://new.trusttai.com" },
          about: { "@type": "Organization", name: "Trust Tai" },
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: "https://storage.googleapis.com/gpt-engineer-file-uploads/5AF3iZ8RMUTUtcLFr34LH1XEPBM2/social-images/social-1782064559119-image_(6).webp",
          },
        }),
      },
    ],
  }),
  component: Index,
});

const NAV = [
  { label: "The Roadmap", href: "#roadmap", active: true },
  { label: "What We Build", href: "/what-we-build" },
  { label: "Investment", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Insights", href: "#insights" },
];

const FEATURES = [
  { icon: Target, title: "Clarity over complexity", body: "We cut through noise and map what matters." },
  { icon: Layers, title: "Strategy and execution", body: "One plan. Real milestones. Measurable outcomes." },
  { icon: Compass, title: "Built to compound", body: "Each milestone strengthens your position long term." },
  { icon: ShieldCheck, title: "Yours to own", body: "You can carry this roadmap into the future, with or without us." },
];

const CHECKLIST: { label: string; body: string }[] = [
  { label: "Point A, documented", body: "how the business runs today and what the drag costs" },
  { label: "Point B, defined", body: "the 24 month destination, in your numbers" },
  { label: "Point C, named", body: "the position you could own in ten years" },
  { label: "The unbuilt asset", body: "each initiative row on your roadmap: the website, system, tool, content engine, workflow, or operating layer the business needs but has not built yet" },
  { label: "The build order", body: "every initiative placed across the eight quarters, in the order the business needs them, with what depends on it and what it unlocks next" },
  { label: "The economics", body: "the revenue case, modeled and tracked" },
  { label: "Who carries what", body: "the owner stamped on every row (Studio, Ops, Automation, Intelligence, Learning, Commerce, Revenue), and what stays with your team" },
  { label: "The scoreboard", body: "the status of every row at a glance (Mapped, In build, Live) across the visibility, lead, content, workflow, and business indicators we track" },
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
    name: "Accelerated Pace",
    price: "$7,500 per month",
    total: "$90,000 over the walk",
    months: 12,
    body: "Point B in one year. The heaviest months, the earliest arrival.",
  },
  {
    name: "Balanced Pace",
    price: "$4,500 per month",
    total: "$81,000 over the walk",
    months: 18,
    body: "Point B in eighteen months.",
  },
  {
    name: "Steady Pace",
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
    ? { animation: `tt-step-3a ${strideMs}ms steps(1, end) infinite` }
    : undefined;
  const midStyle = walking
    ? { animation: `tt-step-3mid ${strideMs}ms steps(1, end) infinite` }
    : undefined;
  const bStyle = walking
    ? { animation: `tt-step-3b ${strideMs}ms steps(1, end) infinite` }
    : undefined;
  return (
    <svg
      width="24"
      height="34"
      viewBox="0 -2 20 34"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      fill="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-royal block overflow-visible"
    >
      {/* head */}
      <circle cx="10" cy="3" r="2.4" stroke="none" />
      {/* tapered torso (shoulders wider than waist) */}
      <path
        d="M8.2 6.6 L11.8 6.6 L11.3 18.2 L8.7 18.2 Z"
        stroke="none"
      />
      {/* shoulder yoke */}
      <line x1="7.6" y1="7" x2="12.4" y2="7" strokeWidth="1" fill="none" />
      {walking ? (
        <>
          {/* Frame A: left leg forward (bent), right leg back; right arm forward, left arm back */}
          <g style={aStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7.4 L7.4 16.9" strokeWidth="2.2" />
            <path d="M12 7.4 L12.6 16.9" strokeWidth="2.2" />
            {/* right leg planted (straight, slightly back) */}
            <path d="M10.6 18 L10.9 29.8" strokeWidth="2.8" />
            <line x1="10.0" y1="30" x2="11.8" y2="30" strokeWidth="1.6" />
            {/* left leg forward, subtle knee */}
            <path d="M9.4 18 L8.6 23.8 L8.0 28.8" strokeWidth="2.8" />
            <line x1="7.1" y1="29.0" x2="8.9" y2="28.8" strokeWidth="1.6" />
          </g>
          {/* MID frame: legs passing, arms vertical (shown twice per cycle) */}
          <g style={midStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7.4 L7.9 17" strokeWidth="2.2" />
            <path d="M12 7.4 L12.1 17" strokeWidth="2.2" />
            <path d="M9.4 18 L9.4 29.8" strokeWidth="2.8" />
            <path d="M10.6 18 L10.6 29.8" strokeWidth="2.8" />
            <line x1="8.5" y1="30" x2="10.3" y2="30" strokeWidth="1.6" />
            <line x1="9.7" y1="30" x2="11.5" y2="30" strokeWidth="1.6" />
          </g>
          {/* Frame B: mirror of A */}
          <g style={bStyle} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7.4 L8.6 16.9" strokeWidth="2.2" />
            <path d="M12 7.4 L11.4 16.9" strokeWidth="2.2" />
            {/* left leg planted (straight, slightly back) */}
            <path d="M9.4 18 L9.1 29.8" strokeWidth="2.8" />
            <line x1="8.2" y1="30" x2="10.0" y2="30" strokeWidth="1.6" />
            {/* right leg forward, subtle knee */}
            <path d="M10.6 18 L11.4 23.8 L12.0 28.8" strokeWidth="2.8" />
            <line x1="11.1" y1="29.0" x2="12.9" y2="28.8" strokeWidth="1.6" />
          </g>
        </>
      ) : (
        /* Neutral standing pose, used for both pre-start and arrival */
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7.4 L7.9 17" strokeWidth="2.2" />
          <path d="M12 7.4 L12.1 17" strokeWidth="2.2" />
          <path d="M9.4 18 L9.4 29.8" strokeWidth="2.8" />
          <path d="M10.6 18 L10.6 29.8" strokeWidth="2.8" />
          <line x1="8.5" y1="30" x2="10.3" y2="30" strokeWidth="1.6" />
          <line x1="9.7" y1="30" x2="11.5" y2="30" strokeWidth="1.6" />
        </g>
      )}
    </svg>
  );
}

// Constant pixel-per-second speed across all three walks: total duration scales
// with route length (months/24), so Fast finishes first, Steady last.
const STEADY_DURATION_MS = 14000;
// Single calm cadence for all figures (~2 steps/sec).
const STRIDE_MS = 500;

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
          const p = Math.min(1, elapsed / d);
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
          0%, 50%, 100% { transform: translate(-50%, 0); }
          25%, 75%      { transform: translate(-50%, -1px); }
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
        /* 3-frame cycle: A (0-25) → MID (25-50) → B (50-75) → MID (75-100) */
        @keyframes tt-step-3a   { 0%, 24.999% { opacity: 1; } 25%, 100% { opacity: 0; } }
        @keyframes tt-step-3mid { 0%, 24.999% { opacity: 0; } 25%, 49.999% { opacity: 1; } 50%, 74.999% { opacity: 0; } 75%, 100% { opacity: 1; } }
        @keyframes tt-step-3b   { 0%, 49.999% { opacity: 0; } 50%, 74.999% { opacity: 1; } 75%, 100% { opacity: 0; } }
        @keyframes tt-fade-in {
          from { opacity: 0; transform: translate(-50%, 3px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <h3 className="font-display text-[1.6rem] text-ink">
        The Build. Three walks. One destination.
      </h3>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink/65">
        Every walk gets you to the destination. The difference is pace, monthly investment, team capacity, and how quickly the business needs the new systems in place.
      </p>


      <div className="mt-10 space-y-10 md:space-y-8">
        {WALKS.map((w, i) => {
          const pct = (w.months / 24) * 100;
          const p = progress[i] ?? 0;
          const arrived = p >= 1;
          const walking = p > 0 && p < 1;
          const figureLeft = `${pct * p}%`;
          const strideMs = STRIDE_MS;
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
                  {/* dotted route, full length, uniform opacity */}
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
                      bottom: "50%",
                      marginBottom: "-1px",
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
                        bottom: "-1px",
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

      {/* Month axis, desktop/tablet only */}
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
function Index() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <div className="h-20 sm:h-24" aria-hidden="true" />
      <Hero />
      <FeatureStrip />
      <ClientMarquee />
      <RoadmapSection />
      <Pricing />
      <SiteClosing
        headline={<>The Roadmap is where the next two years <Accent>stop being a guess</Accent>.</>}
        supporting={<>One conversation. One document. The distance from where you are to where you need to be, drawn before the first build begins.</>}
      />
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
        <a href="/build-my-roadmap" className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-paper transition-transform hover:scale-[1.02]">
          Build My Roadmap <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-paper">
      <div className="flex flex-col-reverse lg:grid lg:grid-cols-[48fr_52fr] lg:items-stretch">
        <div className="relative flex items-center px-6 py-14 pr-6 lg:py-20 lg:pl-10 lg:pr-12 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]">
          <div className="hero-texture pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true" />
          <div className="relative z-10 max-w-[620px]">
            <Reveal immediate variant="rise" delay={60} as="h1" className="font-display text-[3rem] leading-[1.04] tracking-tight text-ink sm:text-[3.5rem]">
              We map the journey from where your business is to{" "}
              <span className="italic text-royal drift inline-block">where it needs to be.</span>
            </Reveal>
            <span className="hero-hairline mt-5" aria-hidden="true" />
            <Reveal immediate variant="fade-up" delay={260} as="p" className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-ink/70">
              We map where your business is today, define where it needs to be next, and sequence the digital systems, tools, content, workflows, and milestones that can move it there with clarity.
            </Reveal>
            <Reveal immediate variant="fade-up" delay={400} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="/build-my-roadmap" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90">
                Build My Roadmap
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#pricing" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-transparent px-6 text-[13.5px] font-medium text-ink transition-colors hover:border-ink/40">
                See what it costs
              </a>
            </Reveal>
            <Reveal immediate variant="fade-up" delay={540} as="p" className="mt-5 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60">
              <span className="inline-block h-px w-5 bg-ink/40" />
              <span>A 30 minute conversation. No pitch.</span>
            </Reveal>
          </div>
        </div>

        <Reveal immediate variant="fade-right" delay={300} className="relative h-[420px] w-full lg:h-full lg:min-h-[640px]">
          <img
            src={heroAsset.url}
            alt="Trust Tai Business Operating Roadmap booklet on a textured desk"
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          {/* Feathered seam between text and image */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-paper to-transparent lg:block" aria-hidden="true" />
        </Reveal>
      </div>
    </section>
  );
}



function FeatureStrip() {
  return (
    <section className="border-y border-rule/70 bg-white">
      <div className="mx-auto max-w-7xl px-6 pb-12 pt-8 lg:px-10 lg:pb-[72px]">
        <Reveal as="h2" variant="rise" className="text-center font-display text-2xl text-ink">Built for founders who are done guessing.</Reveal>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} variant="fade-up" delay={i * 110} className="flex gap-4">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-royal/25 text-royal">
                <f.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-sans text-[15px] font-semibold tracking-normal text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink/65">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoadmapSection() {
  return (
    <section id="roadmap" className="bg-secondary/60">
      <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-10 lg:pt-[72px] lg:pb-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(380px,440px)_minmax(760px,1fr)] lg:gap-16 xl:gap-[72px]">
          <div>
            <Reveal as="p" variant="fade-up" className="eyebrow">What You Get</Reveal>
            <Reveal as="h2" variant="rise" delay={80} className="mt-4 font-display text-[2.5rem] leading-[1.1] text-ink">
              A living plan. Specific.<br />Sequenced. Yours.
            </Reveal>
            <Reveal as="p" variant="fade-up" delay={180} className="mt-5 max-w-md text-[14px] leading-relaxed text-ink/70">
              The Roadmap turns strategy into a build order your team can follow. It shows what matters now, what can wait, what each milestone must unlock, and where the business is headed over the next 24 months.
            </Reveal>
            <ul className="mt-8 space-y-4">
              {CHECKLIST.map((c, i) => (
                <Reveal as="li" key={c.label} variant="fade-up" delay={260 + i * 60} className="flex items-start gap-3 text-[13.5px] leading-[1.65] text-ink/75">
                  <CheckCircle2 className="mt-[3px] h-[16px] w-[16px] flex-none text-royal" strokeWidth={1.75} />
                  <span>
                    <span className="font-semibold text-ink">{c.label}:</span> {c.body}
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
          <div>
            <Reveal variant="fade-up" delay={120}>
              <RoadmapPanel />
            </Reveal>
            <Reveal as="p" variant="fade-up" delay={260} className="mt-5 text-[13px] leading-relaxed text-ink/60">
              Three businesses, three build orders. Yours will hold your milestones, in your order. The order is a conversation, not a contract.
            </Reveal>
          </div>
        </div>
        <Reveal variant="fade-up" delay={160} className="mt-16">
          <BuildOrderSequence />
        </Reveal>
      </div>
    </section>
  );
}

function BuildOrderSequence() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const rows = TAB_DATA[active].rows;
  // Sort milestones by start quarter, then end quarter
  const milestones = rows
    .map((r) => {
      const span = rowSpan(r);
      return { name: r.name, start: span.start, end: span.end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Dependencies: milestones that began before this one and are still active (end >= my.start)
  // Unlocks: next milestones whose start is >= my.start and <= my.end + 1 (handed off as I finish)
  const depsIdx = (i: number) =>
    milestones
      .map((m, j) => ({ m, j }))
      .filter(({ m, j }) => j < i && m.end >= milestones[i].start && m.start < milestones[i].start)
      .map(({ j }) => j);
  const unlocksIdx = (i: number) =>
    milestones
      .map((m, j) => ({ m, j }))
      .filter(({ m, j }) => j > i && m.start <= milestones[i].end + 1 && m.start >= milestones[i].start + 1)
      .map(({ j }) => j);

  // Refs + computed arc geometry for the dependency graph overlay
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [arcs, setArcs] = useState<{ key: string; d: string; from: number; to: number }[]>([]);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const compute = () => {
      const sRect = stage.getBoundingClientRect();
      const pts = cardRefs.current.map((el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          cx: r.left - sRect.left + r.width / 2,
          top: r.top - sRect.top,
        };
      });
      const next: { key: string; d: string; from: number; to: number }[] = [];
      milestones.forEach((_, i) => {
        depsIdx(i).forEach((j) => {
          const a = pts[j];
          const b = pts[i];
          if (!a || !b) return;
          const x1 = a.cx;
          const x2 = b.cx;
          const baseY = Math.min(a.top, b.top);
          const dist = Math.abs(x2 - x1);
          const arcH = Math.min(56, 22 + dist * 0.18);
          const cy = baseY - arcH;
          next.push({
            key: `${j}->${i}`,
            from: j,
            to: i,
            d: `M ${x1} ${baseY} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${baseY}`,
          });
        });
      });
      setArcs(next);
      setStageSize({ w: stage.scrollWidth, h: stage.scrollHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(stage);
    cardRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-white">
      <div className="flex flex-col gap-3 border-b border-rule px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-royal">Build Order · Sequence View</div>
          <div className="mt-1 font-display text-lg text-ink">Each milestone in order, with what it needs and what it unlocks.</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
          {TAB_DATA.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActive(i)}
              className={`relative cursor-pointer pb-1 transition-colors ${
                i === active ? "text-ink" : "text-ink/60 hover:text-ink"
              }`}
            >
              {t.label}
              {i === active && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-royal" />}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto px-4 pb-6 pt-20 sm:px-6">
        <div ref={stageRef} className="relative min-w-max">
          {/* Dependency arcs overlay */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={stageSize.w || "100%"}
            height={stageSize.h || "100%"}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="bo-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-royal/70" />
              </marker>
              <marker
                id="bo-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-royal" />
              </marker>
            </defs>
            {arcs.map((a) => {
              const isActive =
                hovered !== null && (a.from === hovered || a.to === hovered);
              const dimmed = hovered !== null && !isActive;
              return (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 1.6 : 1}
                  strokeLinecap="round"
                  className={
                    isActive
                      ? "text-royal"
                      : dimmed
                        ? "text-royal/15"
                        : "text-royal/45"
                  }
                  markerEnd={isActive ? "url(#bo-arrow-active)" : "url(#bo-arrow)"}
                  style={{ transition: "stroke 200ms, stroke-width 200ms, color 200ms" }}
                />
              );
            })}
          </svg>

          <ol className="relative flex items-stretch gap-3">
            {milestones.map((m, i) => {
              const dI = depsIdx(i);
              const uI = unlocksIdx(i);
              const owner = ownerFor(m.name);
              const phase = phaseFor(m.start);
              const isHover = hovered === i;
              const isLinked =
                hovered !== null &&
                (depsIdx(hovered).includes(i) || unlocksIdx(hovered).includes(i));
              const dimmed = hovered !== null && !isHover && !isLinked;
              return (
                <li key={m.name} className="flex items-stretch">
                  <div
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className={`relative flex w-[240px] flex-col rounded-md border bg-paper/60 p-3.5 transition-all ${
                      isHover
                        ? "border-royal/60 shadow-[0_2px_18px_-8px_rgba(30,58,138,0.45)]"
                        : isLinked
                          ? "border-royal/40"
                          : "border-rule"
                    } ${dimmed ? "opacity-55" : "opacity-100"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-royal">
                        Step {i + 1} · Q{m.start}
                        {m.end !== m.start ? `–Q${m.end}` : ""}
                      </span>
                      <span className="rounded-full border border-rule px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink/55">
                        {phase}
                      </span>
                    </div>
                    <div className="mt-2 font-display text-[15px] leading-snug text-ink">{m.name}</div>
                    <div className="mt-1 text-[11px] text-ink/55">Owner · {owner}</div>
                    <div className="mt-3 border-t border-rule/60 pt-2.5 text-[11.5px] leading-relaxed">
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink/45">Depends on</div>
                      <div className="mt-0.5 text-ink/75">
                        {dI.length ? (
                          dI.map((j) => milestones[j].name).join(", ")
                        ) : (
                          <span className="text-ink/40">Starts the sequence</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 text-[11.5px] leading-relaxed">
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink/45">Unlocks next</div>
                      <div className="mt-0.5 text-royal/90">
                        {uI.length ? (
                          uI.map((j) => milestones[j].name).join(", ")
                        ) : (
                          <span className="text-ink/40">Final milestone in the walk</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {i < milestones.length - 1 && (
                    <div className="flex w-8 flex-none items-center justify-center text-royal/45">
                      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule/70 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/50 sm:px-6">
        <span>Sequenced left to right · Arcs show what each milestone depends on</span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <svg width="34" height="10" aria-hidden="true">
            <path d="M2 8 C 2 1, 32 1, 32 8" fill="none" stroke="currentColor" strokeWidth="1" className="text-royal/55" />
          </svg>
          <span className="text-ink/55">Dependency · hover a card to highlight</span>
        </span>
      </div>
    </div>
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
      <div className="flex flex-col gap-3 border-b border-rule px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="shrink-0">
          <div className="font-display text-lg text-ink">Trust Tai</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">Roadmap</div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-[11px] sm:grid-cols-3 sm:gap-6 lg:gap-10">
          {[
            { l: "Point A", s: "Where you are" },
            { l: "Point B", s: "Where you need to be (24 months)" },
            { l: "Point C", s: "The position you could own (10 years)" },
          ].map((p) => (
            <div key={p.l} className="min-w-0">
              <div className="font-mono uppercase tracking-[0.16em] text-royal">{p.l}</div>
              <div className="mt-0.5 text-ink/60">{p.s}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[148px_1fr]">
        {/* Tabs */}
        <div className="flex overflow-x-auto bg-ink py-1.5 text-paper/70 md:block md:overflow-visible">
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap px-3.5 py-[5px] text-left text-[11.5px] transition-colors md:w-full ${
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
        <div className="min-w-0 px-4 pt-5 pb-5 sm:px-6 md:px-8">
          <div className="mb-3.5 flex items-end justify-between">
            <h3 className="font-display text-xl text-ink">The Build Order</h3>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
            <div className="min-w-[540px]">
              <BuildOrderChart statusColor={statusColor} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-rule/70 pt-3.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink/55 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">

            <div>24 Month Roadmap · 8 Quarters, Sequenced</div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
    <TooltipProvider delayDuration={120} skipDelayDuration={200}>
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
      <div
        key={active}
        className="roadmap-rows grid min-w-[540px] grid-cols-[130px_repeat(8,minmax(38px,1fr))] gap-y-3.5 text-[11px] text-ink/55 sm:grid-cols-[170px_repeat(8,1fr)]"
        data-animate="true"
      >

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
            rowIndex={idx}
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
    </TooltipProvider>
  );
}

function RoadmapRow({
  row,
  statusColor,
  recommended,
  rowIndex = 0,
}: {
  row: Row;
  statusColor: Record<Status, string>;
  recommended?: boolean;
  rowIndex?: number;
}) {
  const span = rowSpan(row);
  const owner = ownerFor(row.name);
  const phase = phaseFor(span.start);
  const overall: Status =
    row.segs.find((s) => s.status === "build")?.status ??
    row.segs.find((s) => s.status === "live")?.status ??
    "mapped";
  return (
    <>
      <div
        className="roadmap-row self-center pr-3 text-[12px] text-ink/80"
        style={{ ["--row-i" as never]: rowIndex }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cursor-default text-left font-medium outline-none focus-visible:text-royal"
            >
              {row.name}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="start"
            className="bg-paper text-ink border border-rule shadow-sm rounded-md px-3 py-2 text-[11px] leading-snug font-normal normal-case tracking-normal max-w-[220px]"
          >
            <div className="font-medium text-ink">{row.name}</div>
            <div className="mt-1 grid grid-cols-[58px_1fr] gap-x-2 gap-y-0.5 text-ink/70">
              <span className="font-mono uppercase tracking-[0.12em] text-[9.5px] text-ink/45">Phase</span>
              <span>{phase} · Q{span.start}–Q{span.end}</span>
              <span className="font-mono uppercase tracking-[0.12em] text-[9.5px] text-ink/45">Owner</span>
              <span>{owner}</span>
              <span className="font-mono uppercase tracking-[0.12em] text-[9.5px] text-ink/45">Status</span>
              <span>{STATUS_LABEL[overall]}</span>
            </div>
          </TooltipContent>
        </Tooltip>
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
          const segPhase = phaseFor(s.start);
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${row.name}: ${STATUS_LABEL[s.status]} Q${s.start}${s.end !== s.start ? `–Q${s.end}` : ""}`}
                  className={`roadmap-seg absolute top-1/2 h-3 -translate-y-1/2 cursor-default rounded-full outline-none transition-[filter,transform] duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-royal/50 ${statusColor[s.status]}`}
                  style={{ left: `${left}%`, width: `${width}%`, ["--row-i" as never]: rowIndex, ["--seg-i" as never]: i }}
                />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-paper text-ink border border-rule shadow-sm rounded-md px-2.5 py-1.5 text-[11px] leading-snug font-normal normal-case tracking-normal"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${statusColor[s.status]}`} />
                  <span className="font-medium">{STATUS_LABEL[s.status]}</span>
                  <span className="text-ink/55">·</span>
                  <span className="font-mono text-[10px] text-ink/65">Q{s.start}{s.end !== s.start ? `–Q${s.end}` : ""}</span>
                </div>
                <div className="mt-0.5 text-ink/60">{segPhase} · {ownerFor(row.name)}</div>
              </TooltipContent>
            </Tooltip>
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
        {/* Header row: intro + Roadmap card */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          <div>
            <Reveal as="p" variant="fade-up" className="eyebrow">Investment</Reveal>
            <Reveal as="h2" variant="rise" delay={80} className="mt-4 font-display text-[2.5rem] leading-[1.05] text-ink">
              What the journey costs.
            </Reveal>
            <Reveal as="p" variant="fade-up" delay={200} className="mt-5 max-w-lg text-[14px] leading-relaxed text-ink/70">
              You have planned budgets before. You know a number you cannot see is a number you cannot plan around. So the numbers are here: the map, the walks, the math. Take them to your accountant, your partner, your Sunday evening. The work will be here when you decide.
            </Reveal>
          </div>

          <Reveal variant="fade-up" delay={180} className="price-card-featured rounded-lg border border-rule bg-white p-6 lg:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="shrink-0 overflow-hidden rounded-md border border-rule bg-secondary/40">
                <img
                  src={heroAsset.url}
                  alt="The Roadmap cover"
                  className="h-32 w-40 object-cover sm:h-36 sm:w-44"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl leading-none text-ink">The Roadmap</h3>
                <p className="mt-3 text-[13.5px] leading-relaxed text-ink/65">
                  The master plan that maps your journey from Point A to Point B to Point C.
                </p>
                <div className="mt-4 font-display text-[1.5rem] leading-none text-royal">$10,000 to $25,000</div>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink/55">
                  One engagement. 1 to 2 weeks. Credited into the build if we walk together.
                </p>
              </div>
            </div>
          </Reveal>
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
            href="/build-my-roadmap"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90"
          >
            Build My Roadmap
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

const REASONS = [
  { title: "We listen first", body: "You talk. We map. You leave with a clearer picture of your business either way." },
  { title: "Clarity you can keep", body: "Leave with insight you can use, even if we never build together." },
  { title: "The right fit, or none", body: "We will tell you plainly if we are not the right partner for your map." },
];

function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function RouteMark({ inView, small = false }: { inView: boolean; small?: boolean }) {
  const h = small ? 10 : 16;
  const dotR = small ? 3 : 5;
  return (
    <div
      className={`tt-routemark ${inView ? "is-in" : ""} ${small ? "tt-routemark--sm" : ""}`}
      style={{ height: h }}
      aria-hidden="true"
    >
      <div className="tt-routemark__track" />
      <div className="tt-routemark__marker" style={{ width: dotR * 2, height: dotR * 2 }}>
        <div className="tt-routemark__glow" />
        <div className="tt-routemark__core" />
      </div>
    </div>
  );
}

function CTABand() {
  const headline = useInViewOnce<HTMLDivElement>();
  const reasons = useInViewOnce<HTMLDivElement>();
  return (
    <section id="cta" className="contour-bg relative text-paper">
      <style>{`
        .tt-routemark { position: relative; width: 100%; }
        .tt-routemark__track {
          position: absolute;
          top: 50%;
          left: 0;
          height: 2px;
          transform: translateY(-50%);
          background-image: radial-gradient(circle, oklch(0.85 0.14 252 / 0.85) 1px, transparent 1.4px);
          background-size: 7px 2px;
          background-repeat: repeat-x;
          background-position: left center;
          /* end at marker center (marker is on the right edge) */
          right: 0;
          width: 0%;
          transition: width 900ms linear;
        }
        .tt-routemark.is-in .tt-routemark__track { width: 100%; }
        .tt-routemark__marker {
          position: absolute;
          top: 50%;
          right: 0;
          transform: translate(50%, -50%);
          border-radius: 9999px;
          opacity: 0;
          transition: opacity 200ms linear 900ms;
        }
        .tt-routemark.is-in .tt-routemark__marker { opacity: 1; }
        .tt-routemark__core {
          position: absolute; inset: 0;
          border-radius: 9999px;
          background: oklch(0.92 0.12 252);
          box-shadow: 0 0 0 1px oklch(1 0 0 / 0.25);
        }
        .tt-routemark__glow {
          position: absolute;
          left: 50%; top: 50%;
          width: 56px; height: 56px;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: radial-gradient(circle, oklch(0.85 0.18 252 / 0.55) 0%, oklch(0.7 0.18 252 / 0.18) 35%, transparent 70%);
          filter: blur(6px);
          pointer-events: none;
        }
        .tt-routemark--sm .tt-routemark__glow { width: 26px; height: 26px; filter: blur(3px); }
        .tt-routemark.tt-routemark--pulse.is-in .tt-routemark__marker {
          animation: tt-marker-pulse 1100ms ease-out 900ms 1 both;
        }
        @keyframes tt-marker-pulse {
          0% { transform: translate(50%, -50%) scale(1); }
          40% { transform: translate(50%, -50%) scale(1.18); }
          100% { transform: translate(50%, -50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-routemark__track { width: 100% !important; transition: none !important; }
          .tt-routemark__marker { opacity: 1 !important; animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[1180px] px-6 pt-24 pb-16 lg:px-10 lg:pt-28">
        {/* Arrival route + marker, centered above headline */}
        <div ref={headline.ref} className="relative">
          <div className="pointer-events-none absolute left-1/2 top-0 w-[min(720px,90%)] -translate-x-1/2 -translate-y-2">
            <div className={`tt-routemark tt-routemark--pulse ${headline.inView ? "is-in" : ""}`} style={{ height: 16 }} aria-hidden="true">
              <div className="tt-routemark__track" />
              <div className="tt-routemark__marker" style={{ width: 14, height: 14 }}>
                <div className="tt-routemark__glow" />
                <div className="tt-routemark__core" />
              </div>
            </div>
          </div>

          <h2 className="mx-auto max-w-3xl pt-10 text-center font-display text-[clamp(1.9rem,4.2vw,2.75rem)] leading-[1.12] text-paper">
            Where you are is where you are.<br />
            Where you need to be is{" "}
            <span className="italic text-[oklch(0.92_0.07_85)] whitespace-nowrap">what we map next</span>.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-center text-[13.5px] leading-relaxed text-paper/65">
            A 30-minute conversation. If the timing is right, we should talk. If it is not, the work is waiting when it is.
          </p>
        </div>

        {/* Three reasons */}
        <div ref={reasons.ref} className="mt-14 grid grid-cols-1 gap-12 sm:gap-10 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="mx-auto max-w-xs text-center">
              <div className="mx-auto w-32">
                <RouteMark inView={reasons.inView} small />
              </div>
              <h3 className="mt-5 font-display text-[1.25rem] leading-tight text-paper">{r.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/65">{r.body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 flex justify-center">
          <a
            href="/build-my-roadmap"
            className="inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-paper px-7 text-[13.5px] font-semibold text-ink shadow-[0_0_40px_-10px_oklch(0.85_0.18_252/0.55)] transition-transform hover:scale-[1.02] sm:w-auto"
          >
            Build My Roadmap <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

    </section>
  );
}
