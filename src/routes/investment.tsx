import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Footprints, PersonStanding, Snail, Target, Settings, ShieldCheck, X, Equal, ListChecks, BarChart3, Wallet, Cog, Users, ArrowLeftRight, LineChart, Wrench, UserCheck, Check } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import heroDesk from "@/assets/hero-investment-book-desk.png.asset.json";
import bridgeImg from "@/assets/bridge-illustration-river.png.asset.json";
import landscapeImg from "@/assets/roadmap-landscape-divider.png.asset.json";
import starscapeImg from "@/assets/footer-network-starscape.png.asset.json";

export const Route = createFileRoute("/investment")({
  head: () => ({
    meta: [
      { title: "Investment — Trust Tai" },
      { name: "description", content: "The price of a business that runs without you. Map, build, and the three walks — named before the engagement begins." },
      { property: "og:title", content: "Investment — Trust Tai" },
      { property: "og:description", content: "Every number on one page. The map, the build, the three walks." },
      { property: "og:image", content: heroDesk.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroDesk.url },
    ],
  }),
  component: InvestmentPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function PrimaryCTA({ children = "Build My Map" }: { children?: React.ReactNode }) {
  return (
    <a href="#cta" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-medium text-paper transition-transform hover:scale-[1.02]">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}

function GhostCTA({ children = "Start with the map" }: { children?: React.ReactNode }) {
  return (
    <a href="#map" className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[13px] font-medium text-ink/80 transition-colors hover:text-ink">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}

// ---------- Section-aware nav ----------
const SECTION_NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "bridge", label: "The Bridge" },
  { id: "map", label: "The Map" },
  { id: "build", label: "The Build" },
  { id: "holds", label: "What It Buys" },
  { id: "review", label: "Reviews" },
  { id: "cta", label: "Talk" },
];

function useActiveSection(ids: string[]) {
  const [active, setActive] = React.useState<string>(ids[0]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const offset = 140; // pill header + sub-nav

    const compute = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = id;
      }
      setActive(current);
    };

    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [ids]);

  return active;
}

function SectionNav({ active }: { active: string }) {
  return (
    <div className="pointer-events-none sticky top-[72px] z-40 flex justify-center px-3 sm:top-[84px] sm:px-6">
      <nav
        aria-label="Investment sections"
        className="pointer-events-auto w-full max-w-[1100px] overflow-x-auto rounded-full border border-rule/60 bg-paper/85 px-2 py-1.5 shadow-[0_6px_20px_-14px_rgba(10,23,51,0.25)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex items-center gap-1 whitespace-nowrap text-[12px] text-ink/65">
          {SECTION_NAV.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative inline-flex items-center rounded-full px-3 py-1.5 transition-colors ${
                    isActive ? "bg-ink text-paper" : "hover:text-ink"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// ---------- Hero ----------
function Hero() {
  return (
    <section id="overview" className="relative overflow-hidden scroll-mt-32">
      <img
        src={heroDesk.url}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[62%] object-cover object-left sm:block"
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-paper via-paper/95 to-transparent sm:block" />
      <div className={`${container} relative pt-24 pb-20 sm:pt-32 sm:pb-28 lg:pt-40 lg:pb-32`}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Eyebrow>Investment</Eyebrow>
            <h1 className="mt-5 text-[36px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[52px] lg:text-[64px]">
              The price of a business<br className="hidden sm:block" /> that runs without you.
            </h1>
            <p className="mt-7 max-w-[44ch] text-[15px] leading-relaxed text-ink/70">
              Every number is on this page. The map, the build, the three walks.
              No call required to see it, because a decision this size deserves the
              whole picture before the first conversation, not after.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PrimaryCTA />
              <GhostCTA />
            </div>
            <p className="mt-10 max-w-[40ch] text-[12.5px] leading-relaxed text-ink/55">
              A 30-minute conversation. No pitch. If the timing is right, we should talk.
              If it is not, the work is waiting when it is.
            </p>
          </div>
          <div className="hidden lg:col-span-6 lg:block" />
        </div>
      </div>
    </section>
  );
}

// ---------- Bridge ----------
function Bridge() {
  return (
    <section id="bridge" className="scroll-mt-32 border-t border-rule/60 bg-white">
      <div className={`${container} grid grid-cols-1 items-center gap-10 py-20 sm:py-24 lg:grid-cols-12 lg:gap-16 lg:py-32`}>
        <div className="order-2 lg:order-1 lg:col-span-6">
          <img src={bridgeImg.url} alt="Bridge spanning a river — where most firms start to where your business is headed" className="w-full" />
        </div>
        <div className="order-1 lg:order-2 lg:col-span-6">
          <h2 className="text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
            We build the bridge before<br className="hidden sm:block" /> you reach the river.
          </h2>
          <div className="mt-6 max-w-[52ch] space-y-4 text-[14.5px] leading-relaxed text-ink/70">
            <p>Most firms wait until you are at the edge, under pressure, then start building. By then you are paying for speed and stress at the same time.</p>
            <p>We work the other way. We step into where your business is heading, see the crossing coming, and build the bridge before the business gets there. When you arrive, the road is already down. You cross without waiting.</p>
            <p>That is what the number on this page buys. Not a project. Foresight, built into systems, ahead of the moment you need them.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Map pricing ----------
const mapSteps = [
  { id: "a", label: "Point A", Icon: Target },
  { id: "b", label: "Point B", Icon: Target },
  { id: "c", label: "Point C", Icon: Target },
  { id: "build", label: "Build order", Icon: ListChecks },
  { id: "econ", label: "Economics", Icon: BarChart3 },
  { id: "asset", label: "Asset position", Icon: Wallet },
];

type TierKey = "foundational" | "standard" | "comprehensive";
type Tier = {
  key: TierKey;
  name: string;
  price: string;
  tagline: string;
  includedSteps: string[];
  bullets: string[];
};
const TIERS: Tier[] = [
  {
    key: "foundational",
    name: "Foundational",
    price: "$10,000",
    tagline: "The diagnosis and the route to Point B.",
    includedSteps: ["a", "b", "build", "econ"],
    bullets: [
      "Point A audit and Point B definition",
      "24-month build order with sequencing",
      "Baseline economic model",
    ],
  },
  {
    key: "standard",
    name: "Standard",
    price: "$17,500",
    tagline: "The full map, every pillar named.",
    includedSteps: ["a", "b", "c", "build", "econ", "asset"],
    bullets: [
      "Everything in Foundational",
      "Point C horizon and asset position",
      "Quarterly review framework",
    ],
  },
  {
    key: "comprehensive",
    name: "Comprehensive",
    price: "$25,000",
    tagline: "Deep modeling for layered operations.",
    includedSteps: ["a", "b", "c", "build", "econ", "asset"],
    bullets: [
      "Everything in Standard",
      "Scenario modeling across three walk paces",
      "Executive handoff sessions with leadership",
    ],
  },
];

function MapSection() {
  const [tierKey, setTierKey] = React.useState<TierKey>("standard");
  const tier = TIERS.find((t) => t.key === tierKey)!;
  const includedSet = new Set(tier.includedSteps);

  return (
    <section id="map" className="scroll-mt-32 bg-[oklch(0.965_0.012_255)]">
      <div className={`${container} grid grid-cols-1 gap-12 py-20 sm:py-24 lg:grid-cols-12 lg:gap-16 lg:py-32`}>
        <div className="lg:col-span-4">
          <Eyebrow>The Map</Eyebrow>
          <h2 className="mt-5 text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
            It starts with the map.
          </h2>
          <div className="mt-6 space-y-4 text-[14.5px] leading-relaxed text-ink/70">
            <p>The diagnosis and the 24-month plan in one document. Point A, Point B, Point C, the build order, the economics, and the asset you already hold and have not built. You own it whether we walk together or you carry it to another partner.</p>
            <p>The fee sits inside the range by the scale of the operation. We name your number before the engagement begins, never after.</p>
          </div>
          <a href="#cta" className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-royal hover:text-royal/80">
            See what's inside the map <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="lg:col-span-8">
          <div className="rounded-xl border border-rule/70 bg-white p-6 shadow-[0_24px_60px_-40px_rgba(10,23,51,0.25)] sm:p-10 lg:p-12">
            {/* Tier selector */}
            <div
              role="tablist"
              aria-label="Operating Map plan options"
              className="mx-auto flex w-full max-w-[480px] items-center gap-1 rounded-full border border-rule/60 bg-[oklch(0.97_0.012_255)] p-1 text-[12px]"
            >
              {TIERS.map((t) => {
                const isActive = t.key === tierKey;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setTierKey(t.key)}
                    className={`flex-1 rounded-full px-3 py-2 font-medium tracking-tight transition-colors ${
                      isActive ? "bg-ink text-paper shadow-sm" : "text-ink/60 hover:text-ink"
                    }`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <p className="font-display text-[22px] text-ink sm:text-[24px]">The Operating Map</p>
              <p
                key={tier.price}
                className="mt-4 font-display text-[36px] leading-none tracking-tight text-royal sm:text-[48px] lg:text-[52px]"
                style={{ animation: "fade-in 360ms ease both" }}
              >
                {tier.price}
              </p>
              <p className="mt-4 text-[13px] text-ink/65">{tier.tagline}</p>
              <p className="mt-1.5 text-[12px] text-ink/50">Credited in full toward the build if we walk together.</p>
            </div>

            {/* Step row — included steps highlighted */}
            <div className="mt-8 grid grid-cols-3 gap-y-6 sm:mt-10 sm:grid-cols-6">
              {mapSteps.map(({ id, label, Icon }, i) => {
                const isIn = includedSet.has(id);
                return (
                  <div key={id} className="relative flex flex-col items-center text-center transition-opacity" style={{ opacity: isIn ? 1 : 0.35 }}>
                    <Icon className={`h-5 w-5 ${isIn ? "text-royal" : "text-ink/40"}`} strokeWidth={1.5} />
                    {i < mapSteps.length - 1 && (
                      <span className="absolute top-2.5 left-[58%] hidden h-px w-[84%] border-t border-dashed border-rule sm:block" />
                    )}
                    <span className="mt-4 text-[11.5px] tracking-wide text-ink/70">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Bullet list for the selected tier */}
            <ul key={tier.key} className="mt-8 space-y-2 border-t border-rule/60 pt-6 text-[13px] text-ink/75">
              {tier.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal" strokeWidth={2} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Pace ----------
type Walk = { name: string; subtitle: string; Icon: typeof Footprints; months: number; price: string; total: string };
const walks: Walk[] = [
  { name: "The Fast Walk", subtitle: "Point B in one year. The most team on the build, the earliest arrival.", Icon: Footprints, months: 12, price: "$7,500", total: "$90,000" },
  { name: "The Middle Walk", subtitle: "Point B in eighteen months.", Icon: PersonStanding, months: 18, price: "$4,500", total: "$81,000" },
  { name: "The Steady Walk", subtitle: "Point B in two years. The walk most founders fund from operations.", Icon: Snail, months: 24, price: "$2,500", total: "$60,000" },
];

function WalkRow({ walk }: { walk: Walk }) {
  const dots = 7;
  return (
    <div className="grid grid-cols-12 items-center gap-4 rounded-lg border border-rule/60 bg-white px-5 py-5 transition-colors hover:border-royal/30 sm:gap-6 sm:px-6 sm:py-6">
      <div className="col-span-12 flex items-start gap-4 sm:col-span-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-royal/8">
          <walk.Icon className="h-5 w-5 text-royal" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[20px] text-ink">{walk.name}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink/60">{walk.subtitle}</p>
        </div>
      </div>
      <div className="col-span-12 sm:col-span-5">
        <div className="relative">
          <div className="mb-2 flex items-center justify-between text-[10.5px] tracking-[0.18em] text-ink/45">
            <span>START</span><span>{walk.months} MONTHS</span><span>POINT B</span>
          </div>
          <div className="relative flex items-center">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
            <span className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full bg-white ring-1 ring-rule" />
            <div className="relative z-10 mx-auto flex w-full max-w-[80%] items-center justify-between">
              {Array.from({ length: dots }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-royal/40" />
              ))}
            </div>
            <span className="relative z-10 h-3 w-3 shrink-0 rounded-full bg-royal ring-4 ring-royal/15" />
          </div>
        </div>
      </div>
      <div className="col-span-12 sm:col-span-3 sm:text-right">
        <p className="text-[20px] font-medium text-ink">
          {walk.price} <span className="text-[11.5px] font-normal text-ink/55">per month</span>
        </p>
        <p className="text-[12px] text-ink/55">{walk.months} months</p>
        <p className="mt-1 text-[15px] text-royal">{walk.total} <span className="text-[11.5px] text-ink/55">over the walk</span></p>
      </div>
    </div>
  );
}

function Pace() {
  return (
    <section id="build" className="scroll-mt-32 bg-white">
      <div className={`${container} py-20 sm:py-24 lg:py-32`}>
        <Eyebrow>The Build</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">Then you choose the pace.</h2>
          </div>
          <div className="lg:col-span-5">
            <p className="text-[14.5px] leading-relaxed text-ink/70">
              Every walk reaches Point B. The pace sets how fast you arrive, and how much of the team is on your map each month. Priced by the month, not the milestone, so you never face a ten-thousand-dollar wall to take the next step. You progress, and the order stays yours to set.
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-4 sm:mt-12">
          {walks.map((w) => <WalkRow key={w.name} walk={w} />)}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-rule/60 bg-[oklch(0.985_0.008_85)] px-5 py-5 text-[13px] text-ink/70 sm:gap-6 sm:px-6">
          <div className="flex items-center gap-2"><Footprints className="h-4 w-4 text-royal" strokeWidth={1.5} /><span>Pace</span></div>
          <X className="h-3.5 w-3.5 text-ink/35" />
          <div className="flex items-center gap-2"><Settings className="h-4 w-4 text-royal" strokeWidth={1.5} /><span>Arrival</span></div>
          <Equal className="h-3.5 w-3.5 text-ink/35" />
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-royal" strokeWidth={1.5} /><span>Economic value</span></div>
          <p className="mt-2 w-full max-w-[44ch] text-[12.5px] text-ink/60 sm:ml-auto sm:mt-0 sm:w-auto sm:text-right">
            The walk is a decision you make with math. Your map's economics section models what arriving early is worth in your numbers.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------- Holds (dark) ----------
const holdsNodes = [
  { label: "Operations", Icon: Cog, x: 14, y: 18 },
  { label: "Team Load", Icon: Users, x: 14, y: 50 },
  { label: "Client Flow", Icon: ArrowLeftRight, x: 14, y: 82 },
  { label: "Revenue Path", Icon: LineChart, x: 86, y: 18 },
  { label: "Founder Freedom", Icon: UserCheck, x: 86, y: 50 },
  { label: "Internal Tools", Icon: Wrench, x: 86, y: 82 },
];

function HoldsDiagram() {
  return (
    <>
      {/* Mobile: centered orb with stacked label grid */}
      <div className="sm:hidden">
        <div className="mx-auto grid place-items-center">
          <div className="relative">
            <div className="absolute inset-0 -m-6 rounded-full bg-[oklch(0.62_0.18_262)] opacity-30 blur-2xl" />
            <div className="relative grid h-24 w-24 place-items-center rounded-full border border-[oklch(0.78_0.14_262)]/40 bg-[oklch(0.20_0.07_262)] text-center font-display text-[12px] leading-tight text-white shadow-[0_0_60px_-10px_oklch(0.62_0.18_262)]">
              The<br />Business<br />Holds
            </div>
          </div>
        </div>
        <ul className="mx-auto mt-8 grid max-w-[420px] grid-cols-2 gap-2">
          {holdsNodes.map((n) => (
            <li
              key={n.label}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 text-[11.5px] text-white/85 backdrop-blur-sm"
            >
              <n.Icon className="h-3.5 w-3.5 shrink-0 text-[oklch(0.78_0.14_262)]" strokeWidth={1.5} />
              <span className="truncate">{n.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tablet+: orbital diagram */}
      <div className="relative mx-auto hidden aspect-[5/4] w-full max-w-[640px] sm:block lg:max-w-none">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          {holdsNodes.map((n, i) => (
            <line key={i} x1={n.x} y1={n.y} x2="50" y2="50" stroke="oklch(0.72 0.12 262 / 0.4)" strokeWidth="0.25" />
          ))}
        </svg>
        {holdsNodes.map((n) => (
          <div
            key={n.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] text-white/85 backdrop-blur-sm lg:text-[11.5px]">
              <n.Icon className="h-3.5 w-3.5 text-[oklch(0.78_0.14_262)]" strokeWidth={1.5} />
              <span className="whitespace-nowrap">{n.label}</span>
            </div>
          </div>
        ))}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative">
            <div className="absolute inset-0 -m-6 rounded-full bg-[oklch(0.62_0.18_262)] opacity-30 blur-2xl" />
            <div className="relative grid h-24 w-24 place-items-center rounded-full border border-[oklch(0.78_0.14_262)]/40 bg-[oklch(0.20_0.07_262)] text-center font-display text-[13px] leading-tight text-white shadow-[0_0_60px_-10px_oklch(0.62_0.18_262)] lg:h-28 lg:w-28 lg:text-[14px]">
              The<br />Business<br />Holds
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Holds() {
  return (
    <section id="holds" className="scroll-mt-32 bg-[oklch(0.16_0.06_265)] text-white">
      <div className={`${container} grid grid-cols-1 gap-14 py-20 sm:py-24 lg:grid-cols-12 lg:gap-16 lg:py-32`}>
        <div className="lg:col-span-4">
          <h2 className="text-[30px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">
            What the number<br /> actually buys.
          </h2>
          <div className="mt-6 space-y-4 text-[14px] leading-relaxed text-white/70">
            <p>Not a website. Not a stack of tools. A business that holds when you are on a flight. A team that carries the load you have been carrying alone. The first leg of a position you could own for a decade, built on an asset you already hold.</p>
            <p>The systems still running at three in the morning are part of the price. The stewardship that keeps them running is part of it too.</p>
            <p>You are not buying software. You are buying back the part of the company that currently depends on you.</p>
          </div>
        </div>
        <div className="lg:col-span-8">
          <HoldsDiagram />
        </div>
      </div>
    </section>
  );
}

// ---------- Quarterly review ----------
const quarters = [
  { label: "START", sub: "Where\nwe started" },
  { label: "90 DAYS", sub: "What\nshifted" },
  { label: "180 DAYS", sub: "What now\nholds" },
  { label: "270 DAYS", sub: "What comes\nnext" },
  { label: "POINT B", sub: "Point B\nreached" },
];

function Quarterly() {
  return (
    <section id="review" className="scroll-mt-32 bg-white">
      <div className={`${container} grid grid-cols-1 gap-12 py-20 sm:py-24 lg:grid-cols-12 lg:gap-16 lg:py-28`}>
        <div className="lg:col-span-4">
          <h2 className="text-[30px] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
            Every quarter,<br /> the distance shows.
          </h2>
          <div className="mt-6 space-y-4 text-[14.5px] leading-relaxed text-ink/70">
            <p>Ninety days in, you get the first review. Where we started, where the business is now, where the next leg goes.</p>
            <p>The walk is not an invoice that repeats. It is a distance you can see growing, quarter over quarter, against the map you own.</p>
            <p>This is how a founder stops counting the monthly number and starts counting the ground covered.</p>
          </div>
        </div>
        <div className="lg:col-span-8">
          <div className="relative -mx-5 overflow-x-auto px-5 pt-2 sm:mx-0 sm:overflow-visible sm:px-0">
            <div className="relative min-w-[520px] sm:min-w-0">
              <div className="absolute left-[6%] right-[6%] top-[18px] h-px bg-rule" />
              <div className="grid grid-cols-5 gap-2">
                {quarters.map((q, i) => (
                  <div key={q.label} className="flex flex-col items-center text-center">
                    <span className="mb-2 text-[10.5px] tracking-[0.18em] text-ink/55">{q.label}</span>
                    <span
                      className={`relative z-10 mb-6 h-3.5 w-3.5 rounded-full ${
                        i === 0 ? "bg-white ring-1 ring-rule" : "bg-royal ring-4 ring-royal/15"
                      }`}
                    />
                    <div className="grid h-14 w-full place-items-center text-ink/40">
                      <svg viewBox="0 0 64 32" className="h-9 w-16 fill-none stroke-royal/45" strokeWidth="1.2">
                        {i === 0 && <path d="M4 28 L20 10 L32 22 L48 6 L60 22" />}
                        {i === 1 && <><circle cx="14" cy="16" r="3" /><circle cx="32" cy="10" r="3" /><circle cx="50" cy="20" r="3" /><path d="M14 16 L32 10 L50 20" /></>}
                        {i === 2 && <><circle cx="32" cy="16" r="8" /><path d="M32 8v16M24 16h16" /></>}
                        {i === 3 && <path d="M4 26 L18 14 L30 22 L44 6 L60 18" />}
                        {i === 4 && <><path d="M32 28 V8" /><path d="M32 8 L52 12 L32 18 Z" /></>}
                      </svg>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[11.5px] leading-snug text-ink/65">{q.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Quote divider ----------
function QuoteDivider() {
  return (
    <section className="relative overflow-hidden bg-[oklch(0.97_0.015_80)]">
      <div className={`${container} relative pt-16 pb-0 sm:pt-20`}>
        <p className="mx-auto max-w-[64ch] text-center font-display text-[20px] italic leading-snug text-ink/85 sm:text-[26px]">
          "The businesses we have walked the longest are the ones who stopped asking what it costs and started asking what is next."
        </p>
      </div>
      <div className="relative mt-8 sm:mt-10">
        <img src={landscapeImg.url} alt="" aria-hidden className="mx-auto block w-full max-w-[1400px]" />
        <span className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 text-[10.5px] tracking-[0.22em] text-royal">
          <span className="mb-1 block h-1.5 w-1.5 rounded-full bg-royal mx-auto" />
          POINT B
        </span>
      </div>
    </section>
  );
}

// ---------- Pre-footer CTA + footer ----------
function FooterCTA() {
  return (
    <section
      id="cta"
      className="relative scroll-mt-32 overflow-hidden bg-[oklch(0.14_0.05_265)] text-white"
      style={{
        backgroundImage: `linear-gradient(to right, oklch(0.14 0.05 265) 0%, oklch(0.14 0.05 265 / 0.85) 45%, oklch(0.14 0.05 265 / 0.55) 100%), url(${starscapeImg.url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className={`${container} grid grid-cols-1 gap-10 py-20 sm:py-24 lg:grid-cols-12 lg:gap-16 lg:py-28`}>
        <div className="hidden lg:col-span-5 lg:block" />
        <div className="lg:col-span-7">
          <h2 className="text-[30px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">
            Businesses without a map do not fail. They scatter.
          </h2>
          <p className="mt-6 max-w-[58ch] text-[14.5px] leading-relaxed text-white/75">
            Years go into the right work in the wrong order. The cost was never the spend. The cost is the years. The first step is a 30-minute conversation. We name your number, show you the shape of the walk, and tell you honestly whether we are the ones to build your bridge. If we are not, we will say so, and point you to who is.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-medium text-ink transition-transform hover:scale-[1.02]">
              Build My Map <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a href="#map" className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[13px] font-medium text-white/85 hover:text-white">
              Start with the map <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-8 max-w-[52ch] text-[12px] leading-relaxed text-white/55">
            A 30-minute conversation. No pitch. If the timing is right, we should talk. If it is not, the work is waiting when it is.
          </p>
        </div>
      </div>

      <footer className="border-t border-white/10">
        <div className={`${container} grid grid-cols-1 gap-8 py-10 sm:grid-cols-3`}>
          <div>
            <p className="font-display text-[18px] text-white">Trust Tai</p>
            <p className="mt-1 text-[11px] tracking-[0.2em] text-white/45">MAP. BUILD. SCALE.</p>
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-white/65">
            <li><a href="#map" className="hover:text-white">The Map</a></li>
            <li><Link to="/what-we-build" className="hover:text-white">Our Builds</Link></li>
            <li><a href="#" className="hover:text-white">Our Story</a></li>
            <li><a href="#" className="hover:text-white">Insights</a></li>
            <li><Link to="/investment" className="hover:text-white">Investment</Link></li>
          </ul>
          <div className="flex flex-col items-start gap-4 text-[12px] text-white/55 sm:items-end">
            <p>© 2025 Trust Tai. All rights reserved.</p>
            <div className="flex gap-5">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function InvestmentPage() {
  const active = useActiveSection(React.useMemo(() => SECTION_NAV.map((s) => s.id), []));
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <SectionNav active={active} />
      <main>
        <Hero />
        <Bridge />
        <MapSection />
        <Pace />
        <Holds />
        <Quarterly />
        <QuoteDivider />
        <FooterCTA />
      </main>
    </div>
  );
}
