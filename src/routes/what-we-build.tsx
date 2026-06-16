import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

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
import ctaBg from "@/assets/cta-section-background.jpg.asset.json";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal, useReveal } from "@/hooks/use-reveal";


export const Route = createFileRoute("/what-we-build")({
  head: () => ({
    meta: [
      { title: "What We Build — Trust Tai" },
      { name: "description", content: "The milestones inside the map. Eight builds, one connected operating layer, sequenced by the order the business calls for." },
      { property: "og:title", content: "What We Build — Trust Tai" },
      { property: "og:description", content: "Eight milestones. One connected operating layer. Built for founders. Designed to compound." },
      { property: "og:image", content: heroBook.url },
    ],
    links: [{ rel: "canonical", href: "/what-we-build" }],
  }),
  component: WhatWeBuild,
});

// ----- nav -----
const NAV = [
  { label: "The Map", to: "/" },
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
const MILESTONES = [
  { n: "01", name: "Converting Website", tag: null },
  { n: "02", name: "Connected CRM", tag: null },
  { n: "03", name: "Lead Engine", tag: null },
  { n: "04", name: "Client Portal", tag: "Founder Bottleneck Loop™" },
  { n: "05", name: "AI Support Assistant", tag: "The Intelligence Layer™" },
  { n: "06", name: "Operating Dashboard", tag: "Visibility Before Scale™" },
  { n: "07", name: "Workflow Automation", tag: "Systems Before Automation™" },
  { n: "08", name: "Internal Tools", tag: null },
];

// ----- intelligence layer nodes -----
const IL_LEFT = ["Converting Website", "Connected CRM", "Lead Engine", "Client Portal"];
const IL_RIGHT = ["AI Support Assistant", "Operating Dashboard", "Workflow Automation", "Internal Tools"];
const IL_OUTCOMES = [
  "Clarity",
  "Decisions",
  "Operational leverage",
  "Compounding position",
];

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
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <SiteHeader />
      <div className="h-20 sm:h-24" aria-hidden="true" />
      <Hero />
      <FeatureRow />
      <MappedPath />
      <Milestones />
      <IntelligenceLayer />
      <StandardsRow />
      <BeforeAfter />
      <BottomCTA />
      <Footer />
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
          <PrimaryButton href="#cta">Build My Map</PrimaryButton>
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
            <Reveal immediate variant="fade-up" delay={260} as="p" className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-ink/70">
              Everything we build sits inside your Operating Map, in the order the business calls for it. Each milestone removes friction, sharpens execution, and strengthens the position you are building toward.
            </Reveal>
            <Reveal immediate variant="fade-up" delay={400} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#cta" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90">
                Build My Map
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
            alt="Open Operating Map notebook on a warm desk surface"
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
function MappedPath() {
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
            <PathSVG revealed={inView} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PathSVG({ revealed }: { revealed: boolean }) {
  const W = 760;
  const H = 240;
  const points = [
    { x: 60, y: 90, label: "A", title: "Point A", sub: "Where you are", filled: true },
    { x: 190, y: 90, label: "Phase 1", small: true },
    { x: 310, y: 90, label: "Phase 2", small: true },
    { x: 430, y: 90, label: "Phase 3", small: true },
    { x: 570, y: 90, label: "B", title: "Point B", sub: "Where you need to be", sub2: "(24 months)", filled: true },
    { x: 700, y: 90, label: "C", title: "Point C", sub: "The position you could own", sub2: "(10 years)", filled: true, outlined: true },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`svg-reveal h-auto w-full ${revealed ? "is-revealed" : ""}`} aria-hidden="true">
      <line
        x1="60" y1="90" x2="700" y2="90"
        stroke="oklch(0.82 0.02 255)" strokeWidth="1"
        data-anim="line"
        style={{ ["--len" as never]: "640" }}
      />
      {points.map((p, i) => {
        const dotDelay = `${600 + i * 90}ms`;
        const labelDelay = `${900 + i * 90}ms`;
        return (
          <g key={i}>
            {p.small ? (
              <circle cx={p.x} cy={p.y} r="5" fill="#0a1733" data-anim="dot" style={{ ["--d" as never]: dotDelay }} />
            ) : p.outlined ? (
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
            {p.title && (
              <text x={p.x} y={p.y + 36} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.title}
              </text>
            )}
            {p.sub && (
              <text x={p.x} y={p.y + 52} textAnchor="middle" fontSize="9.5" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.sub}
              </text>
            )}
            {("sub2" in p) && p.sub2 && (
              <text x={p.x} y={p.y + 65} textAnchor="middle" fontSize="9.5" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.sub2}
              </text>
            )}
            {p.small && (
              <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize="10" fill="oklch(0.45 0.02 260)" data-anim="fade" style={{ ["--d" as never]: labelDelay }}>
                {p.label}
              </text>
            )}
          </g>
        );
      })}
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
function Milestones() {
  return (
    <section className="border-t border-rule/60 bg-white">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-32">
        <div>
          <p className="eyebrow mb-5">The Milestones</p>
          <h2 className="font-display text-[32px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">
            Eight milestones.
            <br />
            One connected
            <br />
            operating layer.
          </h2>
          <p className="mt-6 max-w-[320px] text-[14px] leading-[1.7] text-ink/70">
            These systems work together to remove friction, raise visibility,
            and create the capacity to lead what comes next. Your map names
            which ones you need, when, and in what order.
          </p>
        </div>

        <div>
          <ul className="divide-y divide-rule/60">
            {MILESTONES.map((m) => (
              <li
                key={m.n}
                className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-5 sm:grid-cols-[20px_28px_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5"
              >
                <span className="mt-1.5 size-2.5 rounded-full bg-royal sm:mt-0 sm:size-3" aria-hidden="true" />
                <span className="font-mono text-[11px] tracking-wider text-ink/40 sm:text-[12px]">
                  {m.n}
                </span>
                <span className="col-start-2 text-[15px] font-medium leading-snug text-ink sm:col-start-auto">
                  {m.name}
                </span>
                {m.tag && (
                  <span className="col-start-2 inline-flex w-fit items-center rounded-sm border border-royal/15 bg-[oklch(0.97_0.02_260)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-royal sm:col-start-auto sm:justify-self-end">
                    {m.tag}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ----------- INTELLIGENCE LAYER -----------
function IntelligenceLayer() {
  return (
    <section className="relative overflow-hidden bg-[#08122b] text-paper">
      <div className="absolute inset-0 opacity-60">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(80,140,255,0.18), transparent 70%)",
          }}
        />
      </div>
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-14 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.55fr)] lg:gap-12 lg:py-32">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7aa6ff]">
            The Intelligence Layer
          </p>
          <h2 className="mt-5 font-display text-[32px] leading-[1.1] tracking-[-0.02em] sm:text-[38px]">
            One layer
            <br />
            reads all of it.
          </h2>
          <p className="mt-6 max-w-[320px] text-[14px] leading-[1.7] text-paper/70">
            Every build creates signals. The intelligence layer reads across the
            system so the business can see what comes next.
          </p>
        </div>

        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="min-w-[560px] sm:min-w-0">
            <ILDiagram />
          </div>
        </div>

        <ul className="flex flex-col justify-center gap-5 lg:border-l lg:border-white/10 lg:pl-8">
          {IL_OUTCOMES.map((o) => (
            <li key={o} className="flex items-center gap-3 text-[14px]">
              <span className="size-2 rounded-full bg-[#5b8cff] shadow-[0_0_10px_rgba(91,140,255,0.8)]" />
              <span className="text-paper/85">{o}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ILDiagram() {
  const W = 560;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const leftX = 90;
  const rightX = W - 90;
  const ys = [60, 140, 220, 300];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6da4ff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#2e58c8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0a1733" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* connectors */}
      {ys.map((y, i) => (
        <g key={`l${i}`}>
          <path d={`M ${leftX + 60} ${y} C ${cx - 80} ${y}, ${cx - 60} ${cy}, ${cx - 30} ${cy}`} stroke="rgba(140,180,255,0.35)" strokeWidth="1" fill="none" />
          <path d={`M ${rightX - 60} ${y} C ${cx + 80} ${y}, ${cx + 60} ${cy}, ${cx + 30} ${cy}`} stroke="rgba(140,180,255,0.35)" strokeWidth="1" fill="none" />
        </g>
      ))}
      {/* glow core */}
      <circle cx={cx} cy={cy} r="110" fill="url(#core)" />
      <circle cx={cx} cy={cy} r="48" fill="#0a1733" stroke="#5b8cff" strokeWidth="1.5" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui">The</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui">Intelligence</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="11" fill="#cfe0ff" fontFamily="ui-sans-serif,system-ui">Layer</text>

      {/* left pills */}
      {IL_LEFT.map((label, i) => (
        <g key={label}>
          <rect x={leftX - 60} y={ys[i] - 15} rx="15" ry="15" width="120" height="30" fill="rgba(255,255,255,0.04)" stroke="rgba(140,180,255,0.35)" />
          <text x={leftX} y={ys[i] + 4} textAnchor="middle" fontSize="10.5" fill="#dde7ff">{label}</text>
        </g>
      ))}
      {IL_RIGHT.map((label, i) => (
        <g key={label}>
          <rect x={rightX - 60} y={ys[i] - 15} rx="15" ry="15" width="120" height="30" fill="rgba(255,255,255,0.04)" stroke="rgba(140,180,255,0.35)" />
          <text x={rightX} y={ys[i] + 4} textAnchor="middle" fontSize="10.5" fill="#dde7ff">{label}</text>
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
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <p className="eyebrow mb-5">The Standard</p>
            <h2 className="font-display text-[32px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[36px]">
              How every
              <br />
              milestone gets built.
            </h2>
          </div>

          <div className="relative">
            {/* dotted connector between numbered circles */}
            <div
              className="absolute left-[10%] right-[10%] top-[26px] hidden h-px md:block"
              style={{ backgroundImage: "repeating-linear-gradient(to right, color-mix(in oklab, var(--ink) 22%, transparent) 0 3px, transparent 3px 8px)" }}
              aria-hidden="true"
            />
            <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 md:grid-cols-5">
              {STANDARDS.map((s) => (
                <div key={s.n} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 mb-5 grid size-[52px] place-items-center rounded-full border border-royal/30 bg-white">
                    <span className="font-mono text-[11px] tracking-wider text-royal">{s.n}</span>
                  </div>
                  <s.icon className="mb-3 h-12 w-12" />
                  <h3 className="font-display text-[16px] tracking-[-0.01em] text-ink">{s.title}</h3>
                  <p className="mt-2 max-w-[160px] text-[12.5px] leading-[1.55] text-ink/60">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ----------- BEFORE / AFTER -----------
function BeforeAfter() {
  return (
    <section className="border-t border-rule/60 bg-paper">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10 lg:py-32">
        <div>
          <p className="eyebrow mb-5">The Order Is The Point</p>
          <h2 className="font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[34px]">
            The right order
            <br />
            changes the outcome.
          </h2>
          <p className="mt-6 max-w-[380px] text-[14px] leading-[1.7] text-ink/70">
            Any agency can build these. The difference is the sequence. We build
            visibility before scale. We build systems before automation. We
            build the foundation before the milestone that stands on it.
          </p>
        </div>

        <ChartCard label="Before the map">
          <ScatterChart />
        </ChartCard>

        <div className="relative">
          <ChartCard label="After the map">
            <TrendChart />
          </ChartCard>
          <div className="absolute left-[-32px] top-1/2 hidden -translate-y-1/2 lg:block">
            <ArrowRight className="size-5 text-ink/40" strokeWidth={1.5} />
          </div>
        </div>
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

function ScatterChart() {
  const dots = [
    [25, 70, 8, 0.4],
    [70, 45, 10, 0.45],
    [130, 80, 9, 0.4],
    [180, 55, 11, 0.55],
    [225, 90, 8, 0.4],
    [275, 60, 10, 0.5],
  ];
  return (
    <svg viewBox="0 0 320 140" className="h-full w-full">
      {dots.map(([x, y, r, o], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={`rgba(120,140,170,${o})`} />
      ))}
    </svg>
  );
}

function TrendChart() {
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
    <svg viewBox="0 0 320 140" className="h-full w-full">
      <path d={d} fill="none" stroke="var(--royal)" strokeWidth="1.5" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 7 : 5} fill="var(--royal)" />
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
        backgroundImage: `linear-gradient(to right, rgba(251,249,244,0.98) 0%, rgba(251,249,244,0.92) 38%, rgba(251,249,244,0.35) 62%, rgba(251,249,244,0.05) 100%), url(${ctaBg.url})`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center right",
        backgroundRepeat: "no-repeat, no-repeat",
      }}
    >
      <div className="mx-auto grid w-full max-w-[1220px] grid-cols-1 items-center gap-10 px-6 py-16 sm:px-10 sm:py-[72px] lg:min-h-[420px] lg:grid-cols-2 lg:gap-12 lg:py-[92px]">
        <div className="flex flex-col items-start">
          <h2
            className="max-w-[540px] font-display text-[42px] leading-[1.0] tracking-[-0.025em] text-ink opacity-0 [animation:fade-in_0.7s_ease-out_0.05s_forwards] md:text-[54px] lg:text-[60px] lg:leading-[0.98]"
          >
            Every build
            <br />
            begins with the map.
          </h2>
          <span
            aria-hidden="true"
            className="mt-5 block h-[2px] w-0 origin-left bg-royal [animation:cta-rule_0.6s_ease-out_0.35s_forwards]"
          />
          <p className="mt-6 max-w-[420px] text-[17px] leading-[1.65] text-ink/85 opacity-0 [animation:fade-in_0.7s_ease-out_0.55s_forwards] md:text-[18px]">
            The map says whether you need what is on this page, when, and in
            what order. That is where every engagement starts. You own the map
            either way.
          </p>
          <div className="mt-[30px] opacity-0 [animation:fade-in_0.7s_ease-out_0.75s_forwards]">
            <PrimaryButton href="#" className="h-[54px] px-8 text-[14px]">
              Build My Map
            </PrimaryButton>
          </div>
          <p className="mt-[18px] max-w-[360px] text-[14px] leading-[1.6] text-ink/65 opacity-0 [animation:fade-in_0.7s_ease-out_0.95s_forwards]">
            A 30-minute conversation. No pitch. If the timing is right, we
            should talk. If not, the work will be waiting when it is.
          </p>
        </div>

        {/* Right column intentionally empty — book lives in the background image */}
        <div aria-hidden="true" className="hidden lg:block" />
      </div>
    </section>
  );
}

// ----------- FOOTER -----------
function Footer() {
  return (
    <footer className="bg-[#08122b] text-paper">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-6 py-14 sm:px-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <TrustTaiLogo variant="white" />
        </div>
        <ul className="flex flex-col gap-2 text-[13px] text-paper/70">
          <li><Link to="/" className="hover:text-paper">The Map</Link></li>
          <li><Link to="/what-we-build" className="hover:text-paper">Our Builds</Link></li>
          <li><a href="#" className="hover:text-paper">Our Story</a></li>
          <li><a href="#" className="hover:text-paper">Insights</a></li>
          <li><a href="#" className="hover:text-paper">Investment</a></li>
        </ul>
        <div className="flex flex-col items-start justify-between gap-4 text-[12.5px] text-paper/55 md:items-end md:text-right">
          <p>© 2025 Trust Tai. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-paper">Privacy Policy</a>
            <a href="#" className="hover:text-paper">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
