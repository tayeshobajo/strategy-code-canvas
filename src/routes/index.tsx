import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Target,
  Layers,
  Compass,
  ShieldCheck,
  CheckCircle2,
  Map as MapIcon,
  Hammer,
  Infinity as InfinityIcon,
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

const CHECKLIST = [
  "Current state diagnostic (Point A)",
  "24-month target state (Point B)",
  "10-year category position (Point C)",
  "Prioritized initiatives and milestones",
  "Success metrics and leading indicators",
  "Risk assessment and opportunity map",
  "Technology and systems architecture",
  "Implementation roadmap and timeline",
  "Investment plan and expected outcomes",
];

const TABS = [
  "Executive Summary",
  "Current State (A)",
  "Target State (B)",
  "Future Position (C)",
  "Initiatives & Milestones",
  "Systems & Technology",
  "Metrics & Outcomes",
  "Investment Plan",
  "Appendices",
];

type Status = "planning" | "progress" | "complete";
const ROWS: { name: string; segs: { start: number; end: number; status: Status }[] }[] = [
  { name: "Brand & Positioning", segs: [{ start: 1, end: 5, status: "progress" }] },
  { name: "Lead Generation Engine", segs: [{ start: 1, end: 3, status: "planning" }, { start: 3, end: 6, status: "progress" }] },
  { name: "Sales & Client Experience", segs: [{ start: 2, end: 7, status: "progress" }] },
  { name: "Operations & Systems", segs: [{ start: 1, end: 4, status: "planning" }, { start: 4, end: 8, status: "progress" }] },
  { name: "Technology Foundation", segs: [{ start: 2, end: 5, status: "planning" }] },
  { name: "Team & Culture", segs: [{ start: 3, end: 6, status: "planning" }, { start: 6, end: 8, status: "progress" }] },
  { name: "Financial Performance", segs: [{ start: 4, end: 8, status: "complete" }] },
];

const PRICING = [
  { icon: MapIcon, title: "The Roadmap", body: "The master plan that maps your journey from A → B → C.", price: "$15,000" },
  { icon: Hammer, title: "The Build", body: "Execution of roadmap milestones in strategic phases.", price: "$25,000+ / phase" },
  { icon: InfinityIcon, title: "The Run", body: "Ongoing support, optimization, and growth.", price: "$5,000+ / month" },
];

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
    <section className="relative w-full overflow-hidden bg-paper lg:min-h-[720px] lg:pb-4">
      <div className="lg:grid lg:grid-cols-[48fr_52fr]">
        <div className="relative flex items-center px-6 py-14 pr-6 lg:min-h-[720px] lg:py-0 lg:pl-10 lg:pr-12 lg:pt-8 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]">
          <div className="hero-texture pointer-events-none absolute inset-0 z-0 opacity-90" aria-hidden="true" />
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
          {/* Route-line accent: arcs from below microcopy toward the seam */}
          <svg
            aria-hidden="true"
            viewBox="0 0 220 90"
            className="pointer-events-none absolute bottom-10 right-[-1.5rem] hidden h-[80px] w-[220px] text-royal opacity-70 lg:block"
            fill="none"
          >
            <path
              d="M2 78 C 60 78, 90 60, 120 40 S 190 12, 214 8"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeDasharray="1 6"
            />
            <circle cx="214" cy="8" r="2.5" fill="currentColor" />
          </svg>
        </div>

        <div className="relative h-[420px] w-full lg:h-auto lg:min-h-[720px]">
          <img
            src={heroAsset.url}
            alt="Trust Tai Business Operating Roadmap booklet on a textured desk"
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          {/* Feathered seam between text and image */}
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-paper to-transparent lg:block" aria-hidden="true" />
          {/* Artifact caption */}
          <div className="pointer-events-none absolute bottom-8 left-8 hidden rounded-sm border border-ink/10 bg-paper/85 px-4 py-3 backdrop-blur-sm lg:block">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-royal">The Operating Map</div>
            <div className="mt-1 text-[12px] text-ink/70">A living plan for what to build first.</div>
          </div>
        </div>
      </div>
    </section>
  );
}



function FeatureStrip() {
  return (
    <section className="border-y border-rule/70 bg-white">
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-10 lg:px-10">
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
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-[0.9fr_1.6fr] lg:px-10">
        <div>
          <p className="eyebrow">What You Get</p>
          <h2 className="mt-4 font-display text-[2.5rem] leading-[1.1] text-ink">
            A living plan. Prioritized.<br />Measurable. Built to win.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-ink/70">
            Our roadmap is both the strategy and the blueprint. It aligns your team, focuses your resources, and gives you a clear path to results.
          </p>
          <ul className="mt-7 space-y-3">
            {CHECKLIST.map((c) => (
              <li key={c} className="flex items-start gap-3 text-[13.5px] text-ink/80">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-royal" strokeWidth={1.75} />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <RoadmapPanel />
      </div>
    </section>
  );
}

function RoadmapPanel() {
  const statusColor: Record<Status, string> = {
    planning: "bg-royal-soft/45",
    progress: "bg-royal",
    complete: "bg-ink",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-white shadow-[0_30px_60px_-30px_rgba(15,23,80,0.25)]">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-rule px-6 py-5">
        <div>
          <div className="font-display text-lg text-ink">Trust Tai</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">Business Operating Roadmap</div>
        </div>
        <div className="hidden gap-10 text-[11px] sm:flex">
          {[
            { l: "Point A", s: "Where you are" },
            { l: "Point B", s: "Where you need to be (24 months)" },
            { l: "Point C", s: "The position you could own (10 years)" },
          ].map((p) => (
            <div key={p.l}>
              <div className="font-mono uppercase tracking-[0.16em] text-royal">{p.l}</div>
              <div className="mt-1 text-ink/60">{p.s}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[180px_1fr]">
        {/* Tabs */}
        <div className="bg-ink py-5 text-paper/90">
          {TABS.map((t, i) => (
            <button
              key={t}
              className={`flex w-full items-center gap-2 px-5 py-2.5 text-left text-[12.5px] transition-colors ${
                i === 4 ? "bg-royal/25 text-paper" : "hover:bg-white/5"
              }`}
            >
              <CircleDot className="h-3 w-3 opacity-60" strokeWidth={1.5} />
              {t}
            </button>
          ))}
        </div>
        {/* Gantt */}
        <div className="p-6">
          <div className="mb-4 flex items-end justify-between">
            <h3 className="font-display text-xl text-ink">Initiatives & Milestones</h3>
          </div>
          <div className="grid grid-cols-[140px_repeat(8,1fr)] gap-y-3 text-[11px] text-ink/55">
            <div />
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="text-center font-mono">Q{i + 1}</div>
            ))}
            {ROWS.map((row) => (
              <RoadmapRow key={row.name} row={row} statusColor={statusColor} />
            ))}
          </div>

          <div className="mt-7 flex items-center justify-between border-t border-rule pt-4 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink/55">
            <div>
              <div>24-Month Roadmap</div>
              <div className="mt-1 text-ink/40">8 Quarters of Execution</div>
            </div>
            <div className="flex items-center gap-5">
              {[
                { l: "Planning", c: "bg-royal-soft/45" },
                { l: "In Progress", c: "bg-royal" },
                { l: "Complete", c: "bg-ink" },
              ].map((x) => (
                <span key={x.l} className="flex items-center gap-2 normal-case">
                  <span className={`h-2.5 w-5 rounded-sm ${x.c}`} />
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

function RoadmapRow({ row, statusColor }: { row: typeof ROWS[number]; statusColor: Record<Status, string> }) {
  return (
    <>
      <div className="self-center pr-3 text-[12px] text-ink/75">{row.name}</div>
      <div className="relative col-span-8 h-6">
        <div className="absolute inset-y-0 grid w-full grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="border-l border-dashed border-rule first:border-l-0" />
          ))}
        </div>
        {row.segs.map((s, i) => {
          const left = ((s.start - 1) / 8) * 100;
          const width = ((s.end - s.start + 1) / 8) * 100;
          return (
            <div
              key={i}
              className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${statusColor[s.status]}`}
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
    <section className="bg-paper">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1.6fr]">
          <div>
            <p className="eyebrow">Investment</p>
            <h2 className="mt-4 font-display text-[2.5rem] leading-[1.1] text-ink">Transparent. Fair. Worth it.</h2>
            <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-ink/70">
              Great work requires great commitment. Here's how we invest in your journey.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
            {PRICING.map((p) => (
              <div key={p.title}>
                <div className="flex items-center gap-3 text-ink">
                  <p.icon className="h-5 w-5 text-ink/80" strokeWidth={1.5} />
                  <div className="font-display text-xl">{p.title}</div>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink/65">{p.body}</p>
                <div className="mt-4 font-display text-2xl text-royal">{p.price}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col items-center justify-center gap-5 border-t border-rule pt-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/55">
            <CircleDot className="h-3.5 w-3.5 text-royal" strokeWidth={1.5} />
            Custom scope. Clear proposals. No surprises.
          </p>
          <a href="#cta" className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/50">
            Talk about your journey <ArrowRight className="h-3.5 w-3.5" />
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
