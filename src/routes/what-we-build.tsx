import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";

// ----- inline SVG icons (uploaded assets) -----
type IconProps = { className?: string };
const baseIcon = "fill-none stroke-royal";
const IconClarity = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <circle cx="32" cy="32" r="22" />
    <circle cx="32" cy="32" r="14" />
    <circle cx="32" cy="32" r="6" />
  </svg>
);
const IconSequence = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <path d="M14 44L26 31L37 38L50 19" />
    <circle cx="14" cy="44" r="4" />
    <circle cx="26" cy="31" r="4" />
    <circle cx="37" cy="38" r="4" />
    <circle cx="50" cy="19" r="4" />
  </svg>
);
const IconCompounding = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <ellipse cx="32" cy="42" rx="20" ry="8" />
    <ellipse cx="32" cy="32" rx="16" ry="7" />
    <ellipse cx="32" cy="23" rx="12" ry="6" />
  </svg>
);
const IconOwnership = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <circle cx="32" cy="24" r="9" />
    <path d="M15 52c3.5-10 10-15 17-15s13.5 5 17 15" />
    <circle cx="32" cy="32" r="24" />
  </svg>
);
const IconFoundation = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <path d="M8 48h48" />
    <path d="M12 48l14-24l10 16l8-12l8 20" />
    <path d="M26 24l4 10" />
  </svg>
);
const IconStructure = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <rect x="14" y="14" width="14" height="14" rx="2" />
    <rect x="36" y="14" width="14" height="14" rx="2" />
    <rect x="14" y="36" width="14" height="14" rx="2" />
    <rect x="36" y="36" width="14" height="14" rx="2" />
  </svg>
);
const IconBuild = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <path d="M25 20L14 32l11 12" />
    <path d="M39 20l11 12l-11 12" />
    <path d="M35 14l-6 36" />
  </svg>
);
const IconRefinement = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <path d="M32 9l7 15l16 2l-12 11l3 16l-14-8l-14 8l3-16L9 26l16-2l7-15z" />
  </svg>
);
const IconStewardship = ({ className = "" }: IconProps) => (
  <svg viewBox="0 0 64 64" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`${baseIcon} ${className}`} aria-hidden="true">
    <path d="M32 8l20 8v14c0 14-8.5 22-20 26C20.5 52 12 44 12 30V16l20-8z" />
    <path d="M24 31l6 6l12-14" />
  </svg>
);
import heroBook from "@/assets/hero-open-book-desk.png.asset.json";
import ctaSectionBg from "@/assets/cta-section-background.jpg.asset.json";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { Reveal, useReveal } from "@/hooks/use-reveal";


export const Route = createFileRoute("/what-we-build")({
  head: () => ({
    meta: [
      { title: "What We Build | Trust Tai" },
      { name: "description", content: "The milestones inside the map. Eight builds, one connected operating layer, sequenced by the order the business calls for." },
      { property: "og:title", content: "What We Build | Trust Tai" },
      { property: "og:description", content: "Eight milestones. One connected operating layer. Built for founders. Designed to compound." },
      { property: "og:url", content: "https://new.trusttai.com/what-we-build" },
      { property: "og:image", content: heroBook.url },
    ],
    links: [{ rel: "canonical", href: "https://new.trusttai.com/what-we-build" }],
    scripts: [
      {
        type: "application/ld+json",
          id: "jsonld-what-we-build",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              name: "What We Build | Trust Tai",
              description:
                "Eight milestones. One connected operating layer. Built for founders. Designed to compound.",
              url: "https://new.trusttai.com/what-we-build",
              isPartOf: { "@type": "WebSite", name: "Trust Tai", url: "https://new.trusttai.com" },
              about: {
                "@type": "Service",
                name: "Business Operating Roadmap",
                provider: { "@type": "Organization", name: "Trust Tai", url: "https://new.trusttai.com" },
                areaServed: "Global",
                serviceType: "Strategy and operations consultancy",
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://new.trusttai.com/" },
                { "@type": "ListItem", position: 2, name: "What We Build", item: "https://new.trusttai.com/what-we-build" },
              ],
            },
          ],
        }),
      },
    ],


  }),
  component: WhatWeBuild,
});

// ----- nav -----
const NAV = [
  { label: "The Roadmap", to: "/" },
  { label: "What We Build", to: "/what-we-build", active: true },
  { label: "Investment", to: "/" },
  { label: "About", to: "/" },
  { label: "Insights", to: "/" },
];

// ----- feature row -----
const FEATURES = [
  { icon: IconClarity, title: "Clarity", body: "Cut the noise." },
  { icon: IconSequence, title: "Sequence", body: "Build in order." },
  { icon: IconCompounding, title: "Compounding", body: "Each build strengthens the next." },
  { icon: IconOwnership, title: "Ownership", body: "The system becomes yours." },
];

// ----- milestones table -----
type Milestone = {
  n: string;
  name: string;
  tag: string | null;
  phase: number; // index into PathSVG points (0..5)
  desc: string;
  impact: { label: string; value: number }[];
};
const MILESTONES: Milestone[] = [
  {
    n: "01", name: "Conversion-Focused Website", tag: null, phase: 1,
    desc: "The front door that earns attention and turns it into qualified conversation. Built to convert, not impress.",
    impact: [
      { label: "Clarity", value: 78 },
      { label: "Sequence", value: 55 },
      { label: "Compounding", value: 40 },
      { label: "Ownership", value: 62 },
    ],
  },
  {
    n: "02", name: "Connected CRM", tag: null, phase: 1,
    desc: "A single source of truth for every relationship. The system finally knows what the founder knows.",
    impact: [
      { label: "Clarity", value: 84 },
      { label: "Sequence", value: 70 },
      { label: "Compounding", value: 58 },
      { label: "Ownership", value: 72 },
    ],
  },
  {
    n: "03", name: "Lead Capture Engine", tag: null, phase: 2,
    desc: "Predictable, sequenced demand. Less hunting, more harvesting. The pipeline becomes a function, not a hope.",
    impact: [
      { label: "Clarity", value: 70 },
      { label: "Sequence", value: 88 },
      { label: "Compounding", value: 65 },
      { label: "Ownership", value: 60 },
    ],
  },
  {
    n: "04", name: "Client Portal", tag: "Founder Bottleneck Loop™", phase: 2,
    desc: "Where clients self-serve answers, status, and access, and where the founder stops being the routing layer.",
    impact: [
      { label: "Clarity", value: 76 },
      { label: "Sequence", value: 72 },
      { label: "Compounding", value: 78 },
      { label: "Ownership", value: 80 },
    ],
  },
  {
    n: "05", name: "AI Sales & Support Assistant", tag: "The Intelligence Layer™", phase: 3,
    desc: "Reads across the system, answers in context, and escalates only what needs a human. Capacity without headcount.",
    impact: [
      { label: "Clarity", value: 82 },
      { label: "Sequence", value: 75 },
      { label: "Compounding", value: 90 },
      { label: "Ownership", value: 70 },
    ],
  },
  {
    n: "06", name: "Operating Dashboard", tag: "Visibility Before Scale™", phase: 3,
    desc: "One screen the leadership team trusts. Decisions move from instinct to evidence without slowing down.",
    impact: [
      { label: "Clarity", value: 95 },
      { label: "Sequence", value: 80 },
      { label: "Compounding", value: 82 },
      { label: "Ownership", value: 78 },
    ],
  },
  {
    n: "07", name: "Workflow Automation", tag: "Systems Before Automation™", phase: 4,
    desc: "Once the work is mapped, the repeatable parts run themselves. The team is freed for judgement, not motion.",
    impact: [
      { label: "Clarity", value: 80 },
      { label: "Sequence", value: 92 },
      { label: "Compounding", value: 88 },
      { label: "Ownership", value: 84 },
    ],
  },
  {
    n: "08", name: "Internal Workflow Tools", tag: null, phase: 4,
    desc: "Bespoke tooling for the workflows no off-the-shelf product knows about. The compounding edge of the business.",
    impact: [
      { label: "Clarity", value: 86 },
      { label: "Sequence", value: 84 },
      { label: "Compounding", value: 96 },
      { label: "Ownership", value: 94 },
    ],
  },
];

// ----- intelligence layer nodes -----
const IL_LEFT = ["Conversion-Focused Website", "Connected CRM", "Lead Capture Engine", "Client Portal"];
const IL_RIGHT = ["AI Sales & Support Assistant", "Operating Dashboard", "Workflow Automation", "Internal Workflow Tools"];
const IL_OUTCOMES = [
  "Clearer decisions",
  "Better lead visibility",
  "Operational leverage",
  "Long-term business position",
];

type ILDetail = { signals: string; insight: string; decision: string; nextAction: string };
const IL_DETAILS: Record<string, ILDetail> = {
  "Conversion-Focused Website": {
    signals: "Traffic source, scroll depth, CTA clicks, form starts and abandons.",
    insight: "Which pages convert attention into conversation, and which leak it.",
    decision: "Where to tighten copy, what offer to lead with, what page to retire.",
    nextAction: "Ship the winning variation. Rewrite the page losing the most intent.",
  },
  "Connected CRM": {
    signals: "Contact source, stage age, owner activity, revenue by segment.",
    insight: "Which deals stall, where ownership drops, which segment compounds.",
    decision: "Who follows up next, what to deprioritise, where to invest time.",
    nextAction: "Re-route the stalled deals. Lock the next outreach for the top segment.",
  },
  "Lead Capture Engine": {
    signals: "Channel cost, form fill rate, lead quality and reply rate by source.",
    insight: "Which channels create real conversation, and which only create noise.",
    decision: "Double down on the channel that compounds, shut off the channel that does not.",
    nextAction: "Shift budget. Refresh the offer behind the highest-intent channel.",
  },
  "Client Portal": {
    signals: "Login frequency, ticket type, self-serve resolution rate, time-to-answer.",
    insight: "Which requests should never have reached the founder in the first place.",
    decision: "What becomes a documented flow, what stays a human call.",
    nextAction: "Turn the repeat question into a portal answer. Remove a routing step.",
  },
  "AI Sales & Support Assistant": {
    signals: "Questions asked, resolution rate, escalation reasons, conversation quality.",
    insight: "Where the assistant answers well, and where it should hand off to a person.",
    decision: "What knowledge to add, what to route to a human, what to script.",
    nextAction: "Extend the answer set. Sharpen the escalation rule for high-value asks.",
  },
  "Operating Dashboard": {
    signals: "Revenue, pipeline, capacity, delivery health, leading indicators.",
    insight: "Which metric is moving against plan before it becomes a problem.",
    decision: "Where leadership focuses this week, what target gets reset.",
    nextAction: "Trigger the right review. Reset the number the team is chasing.",
  },
  "Workflow Automation": {
    signals: "Step duration, exception rate, manual touchpoints, handoff delays.",
    insight: "Where work still stalls, and which step a human no longer needs to touch.",
    decision: "Which step to automate next, which to retire, which to leave alone.",
    nextAction: "Ship the next automation. Remove a manual handoff from the workflow.",
  },
  "Internal Workflow Tools": {
    signals: "Tool usage, time-on-task, error rates, where spreadsheets are doing too much.",
    insight: "Which custom workflow is now worth dedicated tooling.",
    decision: "What to build internally, what to standardise across the team.",
    nextAction: "Scope the next internal tool. Retire the spreadsheet it replaces.",
  },
};

// ----- standards -----
const STANDARDS = [
  { n: "01", icon: IconFoundation, title: "Foundation", body: "Before we lay the foundation, we map the ground." },
  { n: "02", icon: IconStructure, title: "Structure", body: "The architecture is decided before the first line is written." },
  { n: "03", icon: IconBuild, title: "Build", body: "Authored, not assembled." },
  { n: "04", icon: IconRefinement, title: "Refinement", body: "Nothing ships below a nine." },
  { n: "05", icon: IconStewardship, title: "Stewardship", body: "The system holds when no one is watching it." },
];

// =====================================================
function WhatWeBuild() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activePhase = MILESTONES[activeIndex].phase;
  return (
    <div className="relative min-h-screen bg-paper text-ink antialiased">
      <AmbientLayer />
      <div className="relative z-10">
        <SiteHeader />
        <div className="h-20 sm:h-24" aria-hidden="true" />
        <Hero />
        <FeatureRow />
        <MappedPath activePhase={activePhase} />
        <Milestones activeIndex={activeIndex} onSelect={setActiveIndex} />
        <IntelligenceLayer />
        <StandardsRow />
        <BeforeAfter />
      </div>
      <SiteClosing
        headline={<>The build is never the point. <Accent>The position it earns you is.</Accent></>}
        supporting={<>Every system here is a milestone inside a larger map, built in the order your business needs them.</>}
      />
    </div>
  );
}

function AmbientLayer() {
  return (
    <div className="ambient-layer" aria-hidden="true">
      <div className="ambient-gradient" />
      <div className="ambient-dust" />
    </div>
  );
}

// ----------- HEADER -----------
function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule/60 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-6 sm:h-20 sm:px-10">
        <Link to="/" className="flex items-center gap-2">
          <TrustTaiLogo variant="dark" />
        </Link>
        <nav className="hidden items-center gap-9 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className={`relative font-sans text-[13px] tracking-tight transition-colors ${
                n.active ? "text-ink" : "text-ink/65 hover:text-ink"
              }`}
            >
              {n.label}
              {n.active && (
                <span className="absolute -bottom-2 left-0 right-0 mx-auto h-px w-8 bg-royal" />
              )}
            </Link>
          ))}
        </nav>
        <div className="hidden sm:block">
          <PrimaryButton href="/build-my-roadmap">Build My Roadmap</PrimaryButton>
        </div>
      </div>
    </header>
  );
}

// ----------- BUTTONS -----------
function PrimaryButton({
  children,
  href = "#",
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full bg-[#0a1733] px-5 py-2.5 text-[13px] font-medium text-paper shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_8px_24px_-12px_rgba(10,23,51,0.4)] transition-all hover:bg-[#0f1f43] hover:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_28px_-12px_rgba(10,23,51,0.5)] ${className}`}
    >
      <span>{children}</span>
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
    </a>
  );
}

function SecondaryButton({
  children,
  href = "#",
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-full border border-ink/12 bg-paper px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/25 hover:bg-white ${className}`}
    >
      {children}
    </a>
  );
}

// ----------- HERO -----------
function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-paper">
      <div className="lg:grid lg:grid-cols-[48fr_52fr] lg:items-stretch">
        <div className="relative flex items-center px-6 py-14 pr-6 lg:py-20 lg:pl-10 lg:pr-12 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]">
          <div className="hero-texture pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true" />
          <div className="relative z-10 max-w-[620px]">
            <Reveal immediate variant="fade-up" delay={0} as="p" className="eyebrow mb-6">What We Build</Reveal>
            <Reveal immediate variant="rise" delay={120} as="h1" className="font-display text-[3rem] leading-[1.04] tracking-tight text-ink sm:text-[3.5rem]">
              The milestones inside{" "}
              <span className="italic text-royal drift inline-block">the map.</span>
            </Reveal>
            <Reveal immediate variant="fade-up" delay={260} as="p" className="mt-6 max-w-[32rem] text-[15px] leading-relaxed text-ink/70">
              After the Roadmap, we build the systems inside it: the website, CRM, lead engine, client portal, AI assistant, dashboard, automation, and internal tools your business needs — in the right order.
            </Reveal>
            <Reveal immediate variant="fade-up" delay={340} as="p" className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-ink/70">
              Everything we build sits inside your Roadmap, in the order the business calls for it. Each milestone removes friction, sharpens execution, and strengthens the position you are building toward.
            </Reveal>
            <Reveal immediate variant="fade-up" delay={400} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="/build-my-roadmap" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90">
                Build My Roadmap
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-transparent px-6 text-[13.5px] font-medium text-ink transition-colors hover:border-ink/40">
                See the full investment page
              </a>
            </Reveal>
            <Reveal immediate variant="fade-up" delay={540} as="p" className="mt-5 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60">
              <span className="inline-block h-px w-5 bg-ink/40" />
              <span>Built for founders. Designed to compound.</span>
            </Reveal>
          </div>
        </div>

        <Reveal immediate variant="fade-right" delay={300} className="relative h-[420px] w-full lg:h-full lg:min-h-[640px]">
          <img
            src={heroBook.url}
            alt="Open Roadmap notebook on a warm desk surface"
            loading="eager"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-right lg:hero-photo-fade"
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-[42%] lg:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--paper) 0%, color-mix(in oklab, var(--paper) 80%, transparent) 30%, color-mix(in oklab, var(--paper) 40%, transparent) 60%, transparent 100%)",
            }}
            aria-hidden="true"
          />
        </Reveal>

      </div>
    </section>
  );
}

// ----------- FEATURE ROW -----------
function FeatureRow() {
  return (
    <section className="border-t border-rule/60 bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-24 sm:px-10 lg:py-28">
        <Reveal variant="rise" as="h2" className="text-center font-display text-[32px] leading-tight tracking-[-0.02em] text-ink sm:text-[40px]">
          Built by sequence, not guesswork.
        </Reveal>
        <div className="mt-16 grid grid-cols-2 gap-y-12 md:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              variant="fade-up"
              delay={i * 110}
              iconStagger
              className={`flex flex-col items-center px-6 text-center ${
                i > 0 ? "md:border-l md:border-ink/10" : ""
              }`}
              style={{ ["--len" as never]: "260" }}
            >
              <f.icon className="mb-6 h-14 w-14" />
              <h3 className="font-display text-[18px] leading-tight tracking-[-0.01em] text-ink">
                {f.title}
              </h3>
              <p className="mt-3 max-w-[200px] text-[13px] leading-[1.6] text-ink/65">
                {f.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

  );
}

// ----------- MAPPED PATH -----------
function MappedPath({ activePhase }: { activePhase: number }) {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="bg-[oklch(0.965_0.012_255)]">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)] lg:gap-20 lg:py-32">
        <div>
          <Reveal as="p" variant="fade-up" className="eyebrow mb-5">The Walk</Reveal>
          <Reveal as="h2" variant="rise" delay={80} className="font-display text-[34px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
            Every build sits on
            <br />a mapped path.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={220} className="mt-6 max-w-[400px] text-[14px] leading-[1.75] text-ink/70">
            Your map names three points: where the business is today, where it
            needs to be in 24 months, and the position it could own in a decade.
            Each phase on the path is one engagement. Each milestone is a
            capability the business unlocks.
          </Reveal>
          <Reveal variant="fade-up" delay={360}>
            <a
              href="#"
              className="mt-8 inline-flex items-center gap-2 text-[13px] font-medium text-royal hover:text-royal/80"
            >
              See how the map gets built
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </a>
          </Reveal>
        </div>

        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="min-w-[640px] sm:min-w-0">
            <PathSVG revealed={inView} activePhase={activePhase} />
          </div>
        </div>
      </div>
    </section>
  );
}

type PathPoint = { x: number; y: number; label: string; title?: string; sub?: string; sub2?: string; filled?: boolean; small?: boolean; outlined?: boolean };
const PATH_POINTS: PathPoint[] = [
  { x: 60, y: 90, label: "A", title: "Point A", sub: "Where you are", filled: true },
  { x: 190, y: 90, label: "Phase 1", small: true },
  { x: 310, y: 90, label: "Phase 2", small: true },
  { x: 430, y: 90, label: "Phase 3", small: true },
  { x: 570, y: 90, label: "B", title: "Point B", sub: "Where you need to be", sub2: "(24 months)", filled: true },
  { x: 700, y: 90, label: "C", title: "Point C", sub: "The position you could own", sub2: "(10 years)", filled: true, outlined: true },
];

function PathSVG({ revealed, activePhase }: { revealed: boolean; activePhase: number }) {
  const W = 760;
  const H = 240;
  const points = PATH_POINTS;
  const active = points[Math.min(activePhase, points.length - 1)];
  const startX = 60;
  // progress line: from start to active point, animated via stroke-dashoffset
  const totalLen = 640;
  const progressLen = Math.max(0, active.x - startX);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`svg-reveal h-auto w-full ${revealed ? "is-revealed" : ""}`} aria-hidden="true">
      {/* base line */}
      <line
        x1="60" y1="90" x2="700" y2="90"
        stroke="oklch(0.82 0.02 255)" strokeWidth="1"
        data-anim="line"
        style={{ ["--len" as never]: "640" }}
      />
      {/* royal progress overlay that grows to active point */}
      {revealed && (
        <line
          x1={startX} y1="90" x2="700" y2="90"
          stroke="var(--royal)" strokeWidth="2" strokeLinecap="round"
          className="path-progress"
          style={{
            strokeDasharray: totalLen,
            strokeDashoffset: totalLen - progressLen,
          }}
        />
      )}
      {points.map((p, i) => {
        const dotDelay = `${600 + i * 90}ms`;
        const labelDelay = `${900 + i * 90}ms`;
        const isActive = i === activePhase;
        const isPast = i < activePhase;
        const dimState = revealed && !isActive && !isPast ? "dim" : "on";
        return (
          <g key={i} className="path-point" data-state={dimState}>
            {p.small ? (
              <circle cx={p.x} cy={p.y} r="5" fill={isPast || isActive ? "var(--royal)" : "#0a1733"} data-anim="dot" style={{ ["--d" as never]: dotDelay }} />
            ) : "outlined" in p && p.outlined ? (
              <g data-anim="dot" style={{ ["--d" as never]: dotDelay, transformBox: "fill-box", transformOrigin: "center" }}>
                <circle cx={p.x} cy={p.y} r="11" fill="white" stroke="var(--royal)" strokeWidth="2" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--royal)">{p.label}</text>
              </g>
            ) : (
              <g data-anim="dot" style={{ ["--d" as never]: dotDelay, transformBox: "fill-box", transformOrigin: "center" }}>
                <circle cx={p.x} cy={p.y} r="13" fill="var(--royal)" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="white">{p.label}</text>
              </g>
            )}
            {"title" in p && p.title && (
              <text x={p.x} y={p.y + 36} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.title}
              </text>
            )}
            {"sub" in p && p.sub && (
              <text x={p.x} y={p.y + 52} textAnchor="middle" fontSize="9.5" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.sub}
              </text>
            )}
            {"sub2" in p && p.sub2 && (
              <text x={p.x} y={p.y + 65} textAnchor="middle" fontSize="9.5" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.sub2}
              </text>
            )}
            {"small" in p && p.small && (
              <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize="10" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.label}
              </text>
            )}
          </g>
        );
      })}
      {/* Active marker pulse — slides between points */}
      {revealed && (
        <g
          className="path-active-marker"
          style={{ transform: `translate(${active.x}px, ${active.y}px)` }}
        >
          <circle r="18" fill="none" stroke="var(--royal)" strokeOpacity="0.35" strokeWidth="1.5" />
          <circle r="26" fill="none" stroke="var(--royal)" strokeOpacity="0.18" strokeWidth="1" />
        </g>
      )}
      <path
        d={`M 80 180 Q ${W / 2} 200 ${W - 100} 180`}
        fill="none" stroke="oklch(0.82 0.02 255)" strokeWidth="1"
        data-anim="line"
        style={{ ["--len" as never]: "600", animationDelay: "1100ms" }}
      />
      <text x={W / 2} y="222" textAnchor="middle" fontSize="9" letterSpacing="2" fill="var(--royal)" data-anim="fade" style={{ ["--d" as never]: "1700ms" }}>
        ASSET THREAD
      </text>
    </svg>
  );
}


// ----------- MILESTONES -----------
function Milestones({ activeIndex, onSelect }: { activeIndex: number; onSelect: (i: number) => void }) {
  const active = MILESTONES[activeIndex];
  // re-trigger staggered detail animation on change
  const [detailKey, setDetailKey] = React.useState(0);
  React.useEffect(() => { setDetailKey((k) => k + 1); }, [activeIndex]);

  return (
    <section className="border-t border-rule/60 bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-32">
        <div>
          <Reveal as="p" variant="fade-up" className="eyebrow mb-5">The Milestones</Reveal>
          <Reveal as="h2" variant="rise" delay={80} className="font-display text-[32px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">
            Eight milestones.
            <br />
            One connected
            <br />
            operating layer.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={220} className="mt-6 max-w-[320px] text-[14px] leading-[1.7] text-ink/70">
            Select a milestone to see what it unlocks, where it sits on the
            mapped path, and how it shapes clarity, sequence, compounding,
            and ownership.
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          <ul className="divide-y divide-rule/60" role="tablist" aria-label="Milestones">
            {MILESTONES.map((m, i) => {
              const isActive = i === activeIndex;
              return (
                <Reveal
                  as="li"
                  key={m.n}
                  variant="fade-up"
                  delay={i * 60}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelect(i)}
                    data-active={isActive ? "true" : "false"}
                    className="ms-item grid w-full grid-cols-[20px_28px_minmax(0,1fr)_auto] items-center gap-x-4 py-5 text-left"
                  >
                    <span className="ms-dot inline-block size-2.5 rounded-full bg-royal" aria-hidden="true" />
                    <span className="font-mono text-[11px] tracking-wider text-ink/40 sm:text-[12px]">{m.n}</span>
                    <span className="text-[15px] font-medium leading-snug text-ink">{m.name}</span>
                    {m.tag ? (
                      <span className="hidden sm:inline-flex w-fit items-center rounded-sm border border-royal/15 bg-[oklch(0.97_0.02_260)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-royal justify-self-end">
                        {m.tag}
                      </span>
                    ) : <span />}
                  </button>
                </Reveal>
              );
            })}
          </ul>

          <div
            key={detailKey}
            className="ms-detail sticky top-28 self-start rounded-md border border-rule/60 bg-[oklch(0.985_0.008_85)] p-6 sm:p-8"
            data-state="in"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-royal">
              Milestone {active.n}
              {active.tag ? <span className="ml-2 text-ink/40">· {active.tag}</span> : null}
            </p>
            <h3 className="mt-3 font-display text-[26px] leading-[1.15] tracking-[-0.01em] text-ink sm:text-[30px]">
              {active.name}
            </h3>
            <p className="mt-4 text-[14.5px] leading-[1.7] text-ink/75">
              {active.desc}
            </p>
            <div className="mt-6 space-y-3.5">
              {active.impact.map((b) => (
                <div key={b.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-mono uppercase tracking-[0.14em] text-ink/55">
                    <span>{b.label}</span>
                    <span className="tabular-nums text-ink/45">{b.value}</span>
                  </div>
                  <div className="ms-bar-track">
                    <div className="ms-bar-fill" style={{ width: `${b.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ----------- INTELLIGENCE LAYER -----------
function IntelligenceLayer() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const active = hovered ?? selected;
  const detail = active ? IL_DETAILS[active] : null;

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#08122b] text-paper">
      <div className="absolute inset-0 opacity-60">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(80,140,255,0.18), transparent 70%)",
            animation: "pulse-soft 6s ease-in-out infinite",
          }}
        />
      </div>
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-6 py-20 sm:px-10 sm:py-24 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.7fr)] lg:gap-12 lg:py-32">
        <div>
          <Reveal as="p" variant="fade-up" className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7aa6ff]">
            The Intelligence Layer
          </Reveal>
          <Reveal as="h2" variant="rise" delay={80} className="mt-5 font-display text-[30px] leading-[1.1] tracking-[-0.02em] sm:text-[38px]">
            One layer turns the system into insight.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={220} className="mt-6 max-w-[340px] text-[14px] leading-[1.7] text-paper/70">
            Every website, CRM, lead engine, portal, assistant, and dashboard creates signals. The intelligence layer helps the business see what is working, what is stuck, and what should happen next.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={320} className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#7aa6ff]/80">
            <span className="hidden lg:inline">Hover or click a system →</span>
            <span className="lg:hidden">Tap a system to see how it turns signals into action ↓</span>
          </Reveal>
        </div>

        {/* Mobile/tablet: tappable pill grid in place of the SVG */}
        <div className="lg:hidden">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...IL_LEFT, ...IL_RIGHT].map((name) => {
              const isActive = active === name;
              const isPinned = selected === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelected((s) => (s === name ? null : name))}
                  aria-pressed={isPinned}
                  className={`min-h-11 rounded-full border px-3 py-2 text-left text-[12.5px] leading-tight transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7aa6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08122b] active:scale-[0.97] ${
                    isActive
                      ? "border-[#7aa6ff] bg-[#5b8cff]/20 text-paper shadow-[0_0_18px_rgba(91,140,255,0.25)]"
                      : "border-white/15 bg-white/[0.03] text-paper/80 hover:border-white/35 hover:text-paper"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop diagram */}
        <div className="hidden lg:block">
          <ILDiagram
            revealed={inView}
            active={active}
            onHover={setHovered}
            onSelect={(name) => setSelected((s) => (s === name ? null : name))}
          />
        </div>

        <div className="lg:border-l lg:border-white/10 lg:pl-8">
          {detail ? (
            <ILDetailPanel
              key={active}
              name={active!}
              detail={detail}
              isPinned={selected === active}
              onClear={() => {
                setSelected(null);
                setHovered(null);
              }}
            />
          ) : (
            <ul className="flex flex-col justify-center gap-5">
              <li className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#7aa6ff]/80">
                What the layer produces
              </li>
              {IL_OUTCOMES.map((o, i) => (
                <Reveal as="li" key={o} variant="fade-right" delay={400 + i * 100} className="flex items-center gap-3 text-[14px]">
                  <span className="size-2 rounded-full bg-[#5b8cff] shadow-[0_0_10px_rgba(91,140,255,0.8)] pulse-dot" style={{ animationDelay: `${i * 400}ms` }} />
                  <span className="text-paper/85">{o}</span>
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}


function ILDetailPanel({
  name,
  detail,
  isPinned,
  onClear,
}: {
  name: string;
  detail: ILDetail;
  isPinned: boolean;
  onClear: () => void;
}) {
  const stages: { label: string; value: string }[] = [
    { label: "Signals", value: detail.signals },
    { label: "Insight", value: detail.insight },
    { label: "Decision", value: detail.decision },
    { label: "Next action", value: detail.nextAction },
  ];
  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#7aa6ff]">
            {isPinned ? "Pinned · click again to clear" : "Previewing"}
          </div>
          <div className="mt-2 font-display text-[20px] leading-tight text-paper">{name}</div>
        </div>
        {isPinned && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-paper/70 transition-colors hover:border-white/40 hover:text-paper"
            aria-label="Clear selection"
          >
            Clear
          </button>
        )}
      </div>
      <ol className="mt-5 flex flex-col gap-4">
        {stages.map((s, i) => (
          <li key={s.label} className="relative pl-5">
            <span
              className="absolute left-0 top-[7px] size-1.5 rounded-full bg-[#5b8cff]"
              style={{ boxShadow: "0 0 8px rgba(91,140,255,0.8)" }}
            />
            {i < stages.length - 1 && (
              <span className="absolute left-[3px] top-[16px] h-[calc(100%-4px)] w-px bg-gradient-to-b from-[#5b8cff]/60 to-[#5b8cff]/0" />
            )}
            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#7aa6ff]">{s.label}</div>
            <div className="mt-1 text-[13px] leading-[1.6] text-paper/85">{s.value}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ILDiagram({
  revealed,
  active,
  onHover,
  onSelect,
}: {
  revealed: boolean;
  active: string | null;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
}) {
  const W = 560;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const leftX = 90;
  const rightX = W - 90;
  const ys = [60, 140, 220, 300];
  const dim = active != null;

  const pillFill = (name: string) =>
    active === name ? "rgba(91,140,255,0.22)" : "rgba(255,255,255,0.04)";
  const pillStroke = (name: string) =>
    active === name ? "#7aa6ff" : dim ? "rgba(140,180,255,0.18)" : "rgba(140,180,255,0.35)";
  const pillStrokeW = (name: string) => (active === name ? 1.6 : 1);
  const textFill = (name: string) =>
    active === name ? "#ffffff" : dim ? "rgba(221,231,255,0.55)" : "#dde7ff";
  const lineStroke = (name: string) =>
    active === name ? "#7aa6ff" : dim ? "rgba(140,180,255,0.12)" : "rgba(140,180,255,0.35)";
  const lineW = (name: string) => (active === name ? 1.6 : 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`svg-reveal h-auto w-full ${revealed ? "is-revealed" : ""}`}>
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6da4ff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#2e58c8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0a1733" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* connectors */}
      {ys.map((y, i) => {
        const d = `${400 + i * 120}ms`;
        const leftName = IL_LEFT[i];
        const rightName = IL_RIGHT[i];
        return (
          <g key={`l${i}`}>
            <path
              d={`M ${leftX + 60} ${y} C ${cx - 80} ${y}, ${cx - 60} ${cy}, ${cx - 30} ${cy}`}
              stroke={lineStroke(leftName)}
              strokeWidth={lineW(leftName)}
              fill="none"
              data-anim="line"
              className={`il-connector ${active === leftName ? "is-active" : ""}`}
              style={{ ["--len" as never]: "260", animationDelay: d }}
            />
            <path
              d={`M ${rightX - 60} ${y} C ${cx + 80} ${y}, ${cx + 60} ${cy}, ${cx + 30} ${cy}`}
              stroke={lineStroke(rightName)}
              strokeWidth={lineW(rightName)}
              fill="none"
              data-anim="line"
              className={`il-connector ${active === rightName ? "is-active" : ""}`}
              style={{ ["--len" as never]: "260", animationDelay: d }}
            />
          </g>
        );
      })}
      {/* glow core */}
      <circle cx={cx} cy={cy} r="110" fill="url(#core)" data-anim="dot" style={{ ["--d" as never]: "200ms" }} />
      <circle cx={cx} cy={cy} r="48" fill="#0a1733" stroke="#5b8cff" strokeWidth="1.5" data-anim="dot" style={{ ["--d" as never]: "300ms" }} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui" data-anim="fade" style={{ ["--d" as never]: "600ms" }}>The</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui" data-anim="fade" style={{ ["--d" as never]: "650ms" }}>Intelligence</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui" data-anim="fade" style={{ ["--d" as never]: "700ms" }}>Layer</text>

      {/* left pills */}
      {IL_LEFT.map((label, i) => (
        <g
          key={label}
          data-anim="fade"
          style={{ ["--d" as never]: `${i * 90}ms`, cursor: "pointer" }}
          onMouseEnter={() => onHover(label)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(label)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(label);
            }
          }}
        >
          <rect
            x={leftX - 60}
            y={ys[i] - 15}
            rx="15"
            ry="15"
            width="120"
            height="30"
            fill={pillFill(label)}
            stroke={pillStroke(label)}
            strokeWidth={pillStrokeW(label)}
            style={{ transition: "fill 200ms, stroke 200ms, stroke-width 200ms" }}
          />
          <text
            x={leftX}
            y={ys[i] + 4}
            textAnchor="middle"
            fontSize="10.5"
            fill={textFill(label)}
            style={{ transition: "fill 200ms", pointerEvents: "none" }}
          >
            {label}
          </text>
        </g>
      ))}
      {IL_RIGHT.map((label, i) => (
        <g
          key={label}
          data-anim="fade"
          style={{ ["--d" as never]: `${i * 90}ms`, cursor: "pointer" }}
          onMouseEnter={() => onHover(label)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(label)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(label);
            }
          }}
        >
          <rect
            x={rightX - 60}
            y={ys[i] - 15}
            rx="15"
            ry="15"
            width="120"
            height="30"
            fill={pillFill(label)}
            stroke={pillStroke(label)}
            strokeWidth={pillStrokeW(label)}
            style={{ transition: "fill 200ms, stroke 200ms, stroke-width 200ms" }}
          />
          <text
            x={rightX}
            y={ys[i] + 4}
            textAnchor="middle"
            fontSize="10.5"
            fill={textFill(label)}
            style={{ transition: "fill 200ms", pointerEvents: "none" }}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ----------- STANDARDS ROW -----------
function StandardsRow() {
  return (
    <section className="border-t border-rule/60 bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-24 sm:px-10 lg:py-32">
        <Reveal variant="fade-up" className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <Reveal as="p" variant="fade-up" className="eyebrow mb-5">The Standard</Reveal>
            <Reveal as="h2" variant="rise" delay={80} className="font-display text-[32px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">
              How every
              <br />
              milestone gets built.
            </Reveal>
          </div>

          <div className="relative">
            {/* dotted connector between numbered circles */}
            <div
              className="connector-grow absolute left-[10%] right-[10%] top-[26px] hidden h-px md:block"
              style={{ backgroundImage: "repeating-linear-gradient(to right, color-mix(in oklab, var(--ink) 22%, transparent) 0 3px, transparent 3px 8px)" }}
              aria-hidden="true"
            />
            <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-5">
              {STANDARDS.map((s, i) => (
                <Reveal
                  key={s.n}
                  variant="fade-up"
                  delay={i * 130}
                  iconStagger
                  className="relative flex flex-col items-center text-center"
                  style={{ ["--len" as never]: "260" }}
                >
                  <div className="relative z-10 mb-5 grid size-[52px] place-items-center rounded-full border border-royal/30 bg-white">
                    <span className="font-mono text-[11px] tracking-wider text-royal">{s.n}</span>
                  </div>
                  <s.icon className="mb-3 h-12 w-12" />
                  <h3 className="font-display text-[16px] tracking-[-0.01em] text-ink">{s.title}</h3>
                  <p className="mt-2 max-w-[160px] text-[12.5px] leading-[1.55] text-ink/60">{s.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}

// ----------- BEFORE / AFTER -----------
function BeforeAfter() {
  const { ref, inView } = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="border-t border-rule/60 bg-paper">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10 lg:py-32">
        <div>
          <Reveal as="p" variant="fade-up" className="eyebrow mb-5">The Order Is The Point</Reveal>
          <Reveal as="h2" variant="rise" delay={80} className="font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[34px]">
            The right order
            <br />
            changes the outcome.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={220} className="mt-6 max-w-[380px] text-[14px] leading-[1.7] text-ink/70">
            Any agency can build these. The difference is the sequence. We build
            visibility before scale. We build systems before automation. We
            build the foundation before the milestone that stands on it.
          </Reveal>
        </div>

        <Reveal variant="fade-up" delay={120}>
          <ChartCard label="Before the map">
            <ScatterChart revealed={inView} />
          </ChartCard>
        </Reveal>

        <Reveal variant="fade-up" delay={320} className="relative">
          <ChartCard label="After the map">
            <TrendChart revealed={inView} />
          </ChartCard>
          <div className="absolute left-[-32px] top-1/2 hidden -translate-y-1/2 lg:block" style={{ opacity: inView ? 1 : 0, transform: `translate(${inView ? 0 : -8}px, -50%)`, transition: "opacity 600ms ease 600ms, transform 600ms ease 600ms" }}>
            <ArrowRight className="size-5 text-ink/40" strokeWidth={1.5} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ChartCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-rule/70 bg-white p-6">
      <p className="mb-4 text-[12.5px] font-medium text-ink/55">{label}</p>
      <div className="aspect-[16/9]">{children}</div>
    </div>
  );
}

function ScatterChart({ revealed }: { revealed: boolean }) {
  const dots = [
    [25, 70, 8, 0.4],
    [70, 45, 10, 0.45],
    [130, 80, 9, 0.4],
    [180, 55, 11, 0.55],
    [225, 90, 8, 0.4],
    [275, 60, 10, 0.5],
  ];
  return (
    <svg viewBox="0 0 320 140" className={`svg-reveal h-full w-full ${revealed ? "is-revealed" : ""}`}>
      {dots.map(([x, y, r, o], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={`rgba(120,140,170,${o})`} data-anim="dot" style={{ ["--d" as never]: `${i * 80}ms` }} />
      ))}
    </svg>
  );
}

function TrendChart({ revealed }: { revealed: boolean }) {
  const pts = [
    [20, 110],
    [70, 95],
    [115, 80],
    [165, 60],
    [220, 45],
    [275, 25],
  ];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  return (
    <svg viewBox="0 0 320 140" className={`svg-reveal h-full w-full ${revealed ? "is-revealed" : ""}`}>
      <path d={d} fill="none" stroke="var(--royal)" strokeWidth="1.5" data-anim="line" style={{ ["--len" as never]: "320" }} />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 7 : 5} fill="var(--royal)" data-anim="dot" style={{ ["--d" as never]: `${300 + i * 180}ms` }} />
      ))}
    </svg>
  );
}


// ----------- BOTTOM CTA -----------
function BottomCTA() {
  return (
    <section
      id="cta"
      className="relative overflow-hidden border-t border-[oklch(0.88_0.02_75)] bg-[oklch(0.95_0.018_80)]"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(251,249,244,0.98) 0%, rgba(251,249,244,0.92) 38%, rgba(251,249,244,0.35) 62%, rgba(251,249,244,0.05) 100%), url(${ctaSectionBg.url})`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, 92% center",
        backgroundRepeat: "no-repeat, no-repeat",
      }}
    >
      <div className="mx-auto grid w-full max-w-[1220px] grid-cols-1 items-center gap-10 px-6 py-16 sm:px-10 sm:py-[72px] lg:min-h-[420px] lg:grid-cols-2 lg:gap-12 lg:py-[92px]">
        <div className="flex flex-col items-start">
          <Reveal as="h2" variant="rise" className="max-w-[540px] font-display text-[42px] leading-[1.0] tracking-[-0.025em] text-ink md:text-[54px] lg:text-[60px] lg:leading-[0.98]">
            Every build
            <br />
            begins with the map.
          </Reveal>
          <Reveal variant="fade" delay={250} className="mt-5">
            <span
              aria-hidden="true"
              className="block h-[2px] w-0 origin-left bg-royal [animation:cta-rule_0.6s_ease-out_0.1s_forwards]"
            />
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={400} className="mt-6 max-w-[420px] text-[17px] leading-[1.65] text-ink/85 md:text-[18px]">
            The map says whether you need what is on this page, when, and in
            what order. That is where every engagement starts. You own the map
            either way.
          </Reveal>
          <Reveal variant="fade-up" delay={600} className="mt-[30px]">
            <PrimaryButton href="/build-my-roadmap" className="h-[54px] px-8 text-[14px]">
              Build My Roadmap
            </PrimaryButton>
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={780} className="mt-[18px] max-w-[360px] text-[14px] leading-[1.6] text-ink/65">
            A 30-minute conversation. No pitch. If the timing is right, we
            should talk. If not, the work will be waiting when it is.
          </Reveal>
        </div>


        {/* Right column intentionally empty — book lives in the background image */}
        <div aria-hidden="true" className="hidden lg:block" />
      </div>
    </section>
  );
}

