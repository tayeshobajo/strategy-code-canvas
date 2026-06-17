import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal, useReveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/walks")({
  head: () => {
    const title = "The Walks | Trust Tai";
    const description =
      "Real businesses. Real routes. Real ground covered. A selection of walks we have taken with founder-led businesses — the milestones built, and where each business stands today.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "/walks" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "/walks" }],
    };
  },
  component: WalksPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

/* ----------------------------- TYPES ----------------------------- */

type Walk = {
  slug: string;
  bucket: "Foundations" | "Growth Engines" | "Operating Systems" | "Long Walks";
  category: string;
  subcategory: string;
  headline: string[]; // 2 lines of display
  blurb: string;
  milestones: string[]; // including the implicit "Point A" first node
  /** index of the final/active milestone (where the ripple sits). */
  activeIndex?: number;
  stat: string;
  walkingSince: string;
};

const WALKS: Walk[] = [
  {
    slug: "leadership-education",
    bucket: "Foundations",
    category: "Leadership Education",
    subcategory: "Founder led",
    headline: ["1,250+ learners now move through", "cohorts the founder never touches."],
    blurb:
      "From deep IP and no platform to a live learning experience with enrolled learners.",
    milestones: [
      "Point A",
      "Converting\nWebsite",
      "Connected\nCRM",
      "Learning\nPlatform",
      "Cohort &\nProgress\nSystem",
      "AI Support\nAssistant",
      "Live platform,\nactive\nlearners",
    ],
    stat: "06 Milestones",
    walkingSince: "Walking since 2024",
  },
  {
    slug: "private-milestone-build",
    bucket: "Growth Engines",
    category: "Private Milestone Build",
    subcategory: "Confidential",
    headline: ["Shipped in 72 hours for a milestone", "that could not wait."],
    blurb:
      "From a private idea and three days on the clock to a shipped anniversary experience.",
    milestones: ["Point A", "Scope &\nPlan", "Build", "Test & Ship"],
    stat: "04 Milestones",
    walkingSince: "Completed in 3 days",
  },
  {
    slug: "financial-advisory-firm",
    bucket: "Operating Systems",
    category: "Financial Advisory Firm",
    subcategory: "Tennessee",
    headline: ["Two-day response time,", "down to under an hour."],
    blurb:
      "From five disconnected tools to one operating system the team can run without the founder.",
    milestones: [
      "Point A",
      "Audit &\nMap",
      "Unify Data",
      "Connected\nCRM",
      "Client\nPortal",
      "Automations",
    ],
    stat: "06 Milestones",
    walkingSince: "Walking since 2023",
  },
  {
    slug: "founder-led-business",
    bucket: "Operating Systems",
    category: "Founder Led Business",
    subcategory: "Professional services",
    headline: ["Founder time returned:", "12+ hours every week."],
    blurb:
      "From scattered tools to a cleaner operating path the team can actually follow.",
    milestones: ["Point A", "Map", "CRM", "Workflows", "Knowledge\nBase"],
    stat: "05 Milestones",
    walkingSince: "Active",
  },
  {
    slug: "health-and-wellness",
    bucket: "Long Walks",
    category: "Health and Wellness",
    subcategory: "National",
    headline: ["Completion rate increased", "from 64% to 89%."],
    blurb:
      "From founder dependent delivery to a repeatable system across multiple cohorts.",
    milestones: [
      "Point A",
      "Content\nStructure",
      "LMS\nSetup",
      "Cohort\nFlow",
      "Progress\nTracking",
      "Knowledge\nChecks",
      "Analytics",
    ],
    stat: "07 Milestones",
    walkingSince: "Walking since 2023",
  },
  {
    slug: "e-commerce-brand",
    bucket: "Growth Engines",
    category: "E-Commerce Brand",
    subcategory: "National",
    headline: ["Support volume down 38%", "while customer satisfaction climbed."],
    blurb:
      "From manual operations to a business infrastructure built to scale.",
    milestones: [
      "Point A",
      "Ops Audit",
      "Help Desk\nSystem",
      "Automation\nSuite",
      "Self-Service\nHub",
      "Reporting",
    ],
    stat: "06 Milestones",
    walkingSince: "Walking since 2024",
  },
];

const FILTERS = ["All", "Foundations", "Growth Engines", "Operating Systems", "Long Walks"] as const;
type Filter = (typeof FILTERS)[number];

/* ------------------------------ HERO ------------------------------ */

function ContourBg() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1240 520"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="walks-contour" cx="70%" cy="40%" r="55%">
          <stop offset="0%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1240" height="520" fill="url(#walks-contour)" />
      <g
        fill="none"
        stroke="oklch(0.48 0.18 262)"
        strokeOpacity="0.07"
        strokeWidth="0.75"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <ellipse
            key={i}
            cx="880"
            cy="220"
            rx={120 + i * 60}
            ry={70 + i * 38}
            transform={`rotate(-12 880 220)`}
          />
        ))}
      </g>
    </svg>
  );
}

function HeroRoute({ inView }: { inView: boolean }) {
  // Ascending dotted route with milestone open-circles and an arrow head.
  // Coordinates chosen against viewBox 700x260.
  const points: [number, number][] = [
    [40, 220],
    [200, 200],
    [340, 158],
    [440, 138],
    [560, 88],
    [660, 48],
  ];
  const d = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  const last = points[points.length - 1];
  // Total stagger time for milestone reveals
  const milestoneCount = points.length - 1; // excluding start (point A is implicit at index 0)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 700 260"
      className="h-full w-full"
    >
      <defs>
        <mask id="walks-hero-reveal" maskUnits="userSpaceOnUse">
          <rect width="700" height="260" fill="black" />
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={inView ? 0 : 1}
            style={{
              transition: "stroke-dashoffset 2200ms cubic-bezier(0.42, 0, 0.2, 1)",
            }}
          />
        </mask>
      </defs>

      {/* Dotted ascending route, revealed via mask as it draws */}
      <g mask="url(#walks-hero-reveal)">
        <path
          d={d}
          fill="none"
          stroke="var(--royal)"
          strokeWidth="1.4"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      </g>

      {/* Milestone circles — fade in staggered along the draw */}
      {points.slice(1, -1).map(([x, y], i) => {
        const t = (i + 1) / milestoneCount; // approx progress along path
        const delay = 200 + t * 1800;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={5}
            fill="white"
            stroke="var(--royal)"
            strokeWidth="1.5"
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 380ms ease-out ${delay}ms`,
            }}
          />
        );
      })}

      {/* Final filled node + arrow — appear at end of draw */}
      <g
        style={{
          opacity: inView ? 1 : 0,
          transition: "opacity 420ms ease-out 2100ms",
        }}
      >
        <circle cx={last[0]} cy={last[1]} r={6} fill="var(--royal)" />
        <path
          d={`M ${last[0] - 2} ${last[1] - 14} L ${last[0] + 14} ${last[1] - 26} L ${last[0] + 4} ${last[1] - 8} Z`}
          fill="var(--royal)"
        />
        <path
          d={`M ${last[0]} ${last[1]} L ${last[0] + 14} ${last[1] - 26}`}
          stroke="var(--royal)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function Hero() {
  const { ref: routeRef, inView: routeInView } = useReveal<HTMLDivElement>({
    threshold: 0.35,
    once: true,
    rootMargin: "0px 0px -5% 0px",
  });
  return (
    <section className="relative overflow-hidden bg-paper pt-28 sm:pt-32">
      <ContourBg />
      <div className={`${container} relative`}>
        <div className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-16">
          <div className="flex flex-col">
            <Reveal as="p" variant="fade-up" className="eyebrow">
              The Walks
            </Reveal>
            <Reveal
              as="h1"
              variant="fade-up"
              delay={80}
              className="mt-6 font-display text-[44px] leading-[1.05] tracking-[-0.022em] text-ink sm:text-[56px] lg:text-[64px]"
            >
              Real businesses.<br />
              Real routes.<br />
              Real <em className="italic text-royal">ground</em> covered.
            </Reveal>
            <Reveal
              as="p"
              variant="fade-up"
              delay={160}
              className="mt-7 max-w-[44ch] text-[14px] leading-[1.75] text-ink/65"
            >
              Every walk here started where your business is now: a founder
              carrying weight, a map waiting to be drawn. These are the journeys,
              the milestones we built along them, and where each business
              stands today.
            </Reveal>
            <Reveal
              as="p"
              variant="fade-up"
              delay={220}
              className="mt-5 text-[13px] italic leading-[1.7] text-ink/55"
            >
              A selection. Most of our work stays private.
            </Reveal>
            <Reveal as="div" variant="fade-up" delay={300} className="mt-9">
              <a
                href="#cta"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[13px] font-medium text-paper transition-all duration-300 hover:-translate-y-[1px]"
              >
                Build My Roadmap
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Reveal>
          </div>

          <div className="relative">
            <div ref={routeRef} className="relative aspect-[700/260] w-full">
              <HeroRoute inView={routeInView} />
            </div>
            <Reveal
              as="div"
              variant="fade-up"
              delay={420}
              className="mt-10 flex flex-col items-center text-center"
            >
              <p className="font-display text-[20px] italic text-ink/80 sm:text-[22px]">
                No two walks are the same.
              </p>
              <span className="mt-3 inline-block h-px w-10 bg-ink/40" />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- FILTER ----------------------------- */

function FilterRow({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
}) {
  return (
    <div className={`${container} mt-8`}>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3 border-b border-rule pb-3 text-[13px]">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onChange(f)}
              className={`relative pb-2 transition-colors ${
                isActive ? "text-royal" : "text-ink/60 hover:text-ink"
              }`}
            >
              {f}
              {isActive && (
                <span className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-royal" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- WALK ROW SVG --------------------------- */

function WalkRoute({ labels, rowIndex = 0 }: { labels: string[]; rowIndex?: number }) {
  // Stagger the breathing ring across rows so they don't pulse in unison.
  // Negative delays start each row mid-cycle for an immediate, varied feel.
  const ringDelay = `${-(rowIndex * 480) % 3800}ms`;
  // Render an upward-trending line with N nodes; last node has ripple rings.
  const n = labels.length;
  const W = 560;
  const H = 170;
  const padX = 30;
  const usable = W - padX * 2;
  const xs = Array.from({ length: n }, (_, i) =>
    padX + (i * usable) / (n - 1),
  );
  // y trends upward (lower number) with small variance — last point is highest.
  const baseTop = 40;
  const baseBottom = 95;
  const ys = xs.map((_, i) => {
    const t = i / (n - 1); // 0..1
    // exponential-ish climb
    const eased = Math.pow(t, 1.3);
    const jitter = (i % 2 === 0 ? 0 : -3) + (i === 1 ? 4 : 0);
    return baseBottom - eased * (baseBottom - baseTop) + jitter;
  });
  const d = xs
    .map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `L ${x} ${ys[i]}`))
    .join(" ");
  const lastX = xs[n - 1];
  const lastY = ys[n - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      aria-hidden="true"
    >
      {/* connecting line */}
      <path
        d={d}
        fill="none"
        stroke="var(--royal)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* milestone dots */}
      {xs.map((x, i) => {
        const isLast = i === n - 1;
        return (
          <g key={i}>
            {isLast && (
              <>
                <circle
                  cx={x}
                  cy={ys[i]}
                  r="12"
                  fill="var(--royal)"
                  fillOpacity="0.10"
                  className="ring-breathe"
                />
                <circle
                  cx={x}
                  cy={ys[i]}
                  r="9"
                  fill="var(--royal)"
                  fillOpacity="0.18"
                />
              </>
            )}
            <circle
              cx={x}
              cy={ys[i]}
              r={isLast ? 4.5 : 3.5}
              fill="var(--royal)"
            />
          </g>
        );
      })}
      {/* labels */}
      {xs.map((x, i) => {
        const lines = labels[i].split("\n");
        return (
          <text
            key={`l-${i}`}
            x={x}
            y={125}
            textAnchor="middle"
            fontSize="9"
            fill="oklch(0.32 0.04 260)"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {lines.map((ln, li) => (
              <tspan key={li} x={x} dy={li === 0 ? 0 : 11}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
      {/* highlight ring for last (mimics outline circle around endpoint) */}
      <circle
        cx={lastX}
        cy={lastY}
        r="9"
        fill="none"
        stroke="var(--royal)"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
    </svg>
  );
}

/* ----------------------------- WALK ROW ----------------------------- */

function WalkRow({ walk, index }: { walk: Walk; index: number }) {
  return (
    <Reveal
      as="article"
      variant="fade-up"
      delay={index * 60}
      className="border-t border-rule"
    >
      <div
        className={`${container} grid grid-cols-1 gap-6 py-10 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.1fr)_170px] md:gap-8`}
      >
        {/* Left: category */}
        <div>
          <p className="eyebrow leading-tight">{walk.category}</p>
          <p className="mt-1 text-[12.5px] text-ink/55">{walk.subcategory}</p>
        </div>

        {/* Headline + blurb */}
        <div>
          <h3 className="font-display text-[22px] leading-[1.18] tracking-[-0.015em] text-ink sm:text-[24px]">
            {walk.headline.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h3>
          <p className="mt-4 max-w-[40ch] text-[12.5px] leading-[1.7] text-ink/60">
            {walk.blurb}
          </p>
        </div>

        {/* SVG route */}
        <div className="relative h-[170px] w-full">
          <WalkRoute labels={walk.milestones} />
        </div>

        {/* Right: stats + link */}
        <div className="flex flex-col justify-between gap-6 md:items-end md:text-right">
          <div className="font-mono text-[11px] leading-[1.8] tracking-[0.16em] text-ink/65">
            <p className="uppercase">{walk.stat}</p>
            <p className="mt-1 uppercase text-ink/50">{walk.walkingSince}</p>
          </div>
          <a
            href="#"
            className="group inline-flex items-center gap-1.5 text-[13px] text-ink underline decoration-ink/30 underline-offset-[6px] transition-colors hover:text-royal hover:decoration-royal"
          >
            View walk
          </a>
        </div>
      </div>
    </Reveal>
  );
}

/* --------------------------- DARK CTA --------------------------- */

function CtaContour() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1240 280"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="0.7">
        {Array.from({ length: 7 }).map((_, i) => (
          <ellipse
            key={i}
            cx="980"
            cy="140"
            rx={140 + i * 70}
            ry={60 + i * 30}
            transform="rotate(-8 980 140)"
          />
        ))}
      </g>
    </svg>
  );
}

function DarkCta() {
  return (
    <section
      id="cta"
      className="relative mt-16 overflow-hidden bg-[oklch(0.13_0.05_265)] text-white"
    >
      <CtaContour />
      <div className={`${container} relative grid grid-cols-1 items-center gap-8 py-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:py-16`}>
        <div>
          <h2 className="font-display text-[26px] leading-[1.18] tracking-[-0.018em] text-white sm:text-[32px]">
            Your walk starts the same way<br />
            every one of these did.
          </h2>
          <p className="mt-5 max-w-[54ch] text-[12.5px] leading-[1.75] text-white/65">
            With a map. Point A named honestly, the destination defined, the
            route drawn before the first milestone gets built.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 md:items-end md:text-right">
          <a
            href="#"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-medium text-ink transition-all duration-300 hover:-translate-y-[1px]"
          >
            Build My Roadmap
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
          <p className="max-w-[42ch] text-[11.5px] leading-[1.75] text-white/55">
            A 30-minute conversation. No pitch.<br />
            If the timing is right, we should talk.<br />
            If it is not, the work is waiting when it is.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- FOOTER ----------------------------- */

function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className={`${container} grid grid-cols-1 gap-8 py-10 text-[12.5px] text-ink/65 sm:grid-cols-4`}>
        <div>
          <p className="font-display text-[18px] text-ink">Trust Tai</p>
        </div>
        <ul className="space-y-1.5">
          <li><Link to="/" className="hover:text-ink">The Roadmap</Link></li>
          <li><Link to="/what-we-build" className="hover:text-ink">What We Build</Link></li>
          <li><Link to="/investment" className="hover:text-ink">Investment</Link></li>
          <li><Link to="/about" className="hover:text-ink">About</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link to="/insights" className="hover:text-ink">Insights</Link></li>
          <li><Link to="/walks" className="hover:text-ink">The Walks</Link></li>
        </ul>
        <div className="flex flex-col gap-4 sm:items-end sm:text-right">
          <p>© 2026 Trust Tai. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-ink">Privacy Policy</a>
            <a href="#" className="hover:text-ink">Terms of Service</a>
          </div>
          <p className="text-ink/55">
            We build the map.<br />
            You build what matters.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------ PAGE ------------------------------ */

function WalksPage() {
  const [filter, setFilter] = React.useState<Filter>("All");
  const filtered = React.useMemo(
    () => (filter === "All" ? WALKS : WALKS.filter((w) => w.bucket === filter)),
    [filter],
  );

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <FilterRow active={filter} onChange={setFilter} />
        <section className="mt-2">
          {filtered.map((w, i) => (
            <WalkRow key={w.slug} walk={w} index={i} />
          ))}
          {filtered.length > 0 && <div className="border-t border-rule" />}
        </section>
        <DarkCta />
        <SiteFooter />
      </main>
    </div>
  );
}
