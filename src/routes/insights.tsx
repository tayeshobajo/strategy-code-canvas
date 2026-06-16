import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights | Trust Tai" },
      {
        name: "description",
        content:
          "Positions, not trends. What we have learned mapping the journey for founder-led businesses. Read three and you will know how we think.",
      },
      { property: "og:title", content: "Insights | Trust Tai" },
      {
        property: "og:description",
        content: "The same truths, argued in new stories. Field-tested positions for founder-led businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/insights" }],
  }),
  component: InsightsPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

type Category =
  | "All"
  | "Systems"
  | "The Founder Trap"
  | "The Intelligence Layer"
  | "Operational Debt"
  | "Spirit First"
  | "Field Notes";

const CATEGORIES: Category[] = [
  "All",
  "Systems",
  "The Founder Trap",
  "The Intelligence Layer",
  "Operational Debt",
  "Spirit First",
  "Field Notes",
];

type Article = {
  category: Exclude<Category, "All">;
  title: string;
  blurb: string;
  read: string;
  date: string;
  href: string;
};

const ARTICLES: Article[] = [
  {
    category: "The Founder Trap",
    title:
      "The day your business stopped scaling was the day it started depending on you.",
    blurb:
      "Founder dependency is not always loud. Sometimes it looks like being helpful until the whole business starts waiting on you.",
    read: "6 min read",
    date: "January 2026",
    href: "#",
  },
  {
    category: "Systems",
    title:
      "Most businesses do not have a growth problem. They have a sequence problem.",
    blurb:
      "The right work done in the wrong order still creates drag.",
    read: "5 min read",
    date: "January 2026",
    href: "#",
  },
  {
    category: "The Intelligence Layer",
    title: "AI will not save a business that has not built the system underneath it.",
    blurb:
      "Automation only compounds what already exists. If the system is unclear, AI makes the confusion faster.",
    read: "7 min read",
    date: "January 2026",
    href: "#",
  },
  {
    category: "Operational Debt",
    title:
      "Busy season does not break businesses. It exposes the debt they were already carrying.",
    blurb:
      "Pressure reveals the hidden cost of unclear roles, missing systems, and decisions that were never named.",
    read: "6 min read",
    date: "January 2026",
    href: "#",
  },
  {
    category: "Spirit First",
    title: "We measure a build by whether you could run it without us.",
    blurb:
      "The real standard is not whether the work looks good when we touch it. It is whether it still works when we step away.",
    read: "4 min read",
    date: "January 2026",
    href: "#",
  },
  {
    category: "Field Notes",
    title: "What every founder-led practice needs in its digital footprint before 2027.",
    blurb:
      "The businesses that will compete well next year are already making their systems visible this year.",
    read: "8 min read",
    date: "January 2026",
    href: "#",
  },
];

/* ----------------------------- HERO ----------------------------- */

function HeroPath() {
  // A thin dotted path that wanders from lower-left through the headline
  // and lifts to a small paper-plane arrow at upper-right.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1240 360"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="hero-path" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.72 0.12 262)" stopOpacity="0.15" />
          <stop offset="40%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path
        d="M -20 320 C 120 300, 200 280, 300 296 S 520 332, 660 280 S 880 160, 1040 130 S 1180 96, 1220 70"
        fill="none"
        stroke="url(#hero-path)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeDasharray="2 7"
      />
      {/* Small waypoint dots */}
      <circle cx="60" cy="316" r="3" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="660" cy="280" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="1040" cy="130" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      {/* Paper plane (forward facing, pointing up-right) */}
      <g transform="translate(1188 64) rotate(-18)">
        <path
          d="M 0 0 L 28 -8 L 14 6 L 18 14 Z"
          fill="oklch(0.72 0.12 262 / 0.25)"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M 0 0 L 14 6"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="1"
          fill="none"
        />
      </g>
    </svg>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32 lg:pt-36">
      <HeroPath />
      <div className={`${container} relative`}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[820px] text-center">
          <span className="eyebrow">Insights</span>
          <h1 className="mt-5 font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[68px]">
            The same truths,<br className="hidden sm:block" />{" "}
            argued in new stories.
          </h1>
          <p className="mx-auto mt-7 max-w-[58ch] text-[14px] leading-[1.7] text-ink/65 sm:text-[15px]">
            What we have learned mapping the journey for founder-led businesses.
            Not trends. Positions. Read three and you will know how we think.
          </p>
        </Reveal>
        <div className="mt-16 sm:mt-20 lg:mt-24" />
      </div>
    </section>
  );
}

/* ----------------------- FEATURED ARGUMENT ----------------------- */

function MilestonePath() {
  // Four-stop milestone arc: Clarity, Sequence, Leverage (active), Freedom.
  const stops = [
    { x: 40, y: 220, label: "Clarity" },
    { x: 200, y: 150, label: "Sequence" },
    { x: 360, y: 130, label: "Leverage", active: true },
    { x: 500, y: 50, label: "Freedom" },
  ];

  return (
    <svg
      viewBox="0 0 540 280"
      className="h-auto w-full max-w-[540px]"
      role="img"
      aria-label="Journey path: Clarity, Sequence, Leverage, Freedom"
    >
      <path
        d="M 40 220 C 110 200, 150 165, 200 150 S 310 130, 360 130 S 460 90, 500 50"
        fill="none"
        stroke="oklch(0.48 0.18 262 / 0.45)"
        strokeWidth="1"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {stops.map((s) => (
        <g key={s.label}>
          {s.active && (
            <>
              <circle
                cx={s.x}
                cy={s.y}
                r="14"
                fill="none"
                stroke="oklch(0.48 0.18 262 / 0.35)"
                strokeWidth="1"
                className="ring-breathe"
              />
              <circle
                cx={s.x}
                cy={s.y}
                r="9"
                fill="none"
                stroke="oklch(0.48 0.18 262 / 0.5)"
                strokeWidth="1"
              />
            </>
          )}
          <circle
            cx={s.x}
            cy={s.y}
            r={s.active ? 4 : 3}
            fill="oklch(0.48 0.18 262)"
          />
          <text
            x={s.x}
            y={s.y + 26}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill={s.active ? "oklch(0.48 0.18 262)" : "oklch(0.4 0.04 260)"}
            opacity={s.active ? 1 : 0.7}
          >
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function FeaturedArgument() {
  return (
    <section className="border-t border-rule/70">
      <div className={`${container} grid grid-cols-1 gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-12`}>
        <Reveal as="div" variant="fade-up" className="lg:col-span-7">
          <span className="eyebrow">The Current Argument</span>
          <p className="mt-5 text-[13px] text-ink/55">The Founder Trap</p>
          <h2 className="mt-3 font-display text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-ink sm:text-[38px] lg:text-[44px]">
            The day your business stopped scaling was the day it started
            depending on you.
          </h2>
          <p className="mt-6 max-w-[58ch] text-[14px] leading-[1.75] text-ink/65">
            Growth does not slow down because the founder cares too much. It
            slows down when the business cannot move without the founder
            touching every decision.
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/45">
            6 minute read &nbsp;·&nbsp; January 2026
          </p>
          <a
            href="#"
            className="group mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-royal"
          >
            Read the insight
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            <span className="ml-1 block h-px w-9 bg-royal/60 transition-all group-hover:w-14" />
          </a>
        </Reveal>
        <Reveal
          as="div"
          variant="fade"
          delay={120}
          className="flex items-center justify-center lg:col-span-5"
        >
          <MilestonePath />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- ARTICLE LIST --------------------------- */

function ArticleList() {
  const [active, setActive] = React.useState<Category>("All");
  const filtered = React.useMemo(
    () => (active === "All" ? ARTICLES : ARTICLES.filter((a) => a.category === active)),
    [active],
  );

  return (
    <section className="border-t border-rule/70">
      <div className={container}>
        {/* Tabs */}
        <div className="relative -mx-1 overflow-x-auto">
          <ul className="flex min-w-max items-center gap-1 py-5 sm:gap-2">
            {CATEGORIES.map((c) => {
              const isActive = c === active;
              return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setActive(c)}
                    className={`relative px-3 py-2 text-[13px] transition-colors ${
                      isActive ? "text-royal" : "text-ink/60 hover:text-ink"
                    }`}
                  >
                    {c}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-px h-[2px] bg-royal" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="h-px w-full bg-rule/70" />
        </div>

        {/* Rows */}
        <ul className="divide-y divide-rule/70">
          {filtered.map((a, i) => (
            <Reveal
              as="li"
              key={a.title}
              variant="fade-up"
              delay={i * 60}
              className="group"
            >
              <a
                href={a.href}
                className="grid grid-cols-[18px_1fr_auto_20px] items-start gap-4 py-7 sm:grid-cols-[200px_1fr_140px_24px] sm:gap-8 sm:py-8"
              >
                {/* Dot + category */}
                <div className="flex items-center gap-3 sm:contents">
                  <span
                    className="mt-2 inline-block h-[7px] w-[7px] flex-none rounded-full bg-royal sm:mt-[10px]"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink/55 sm:mt-2 sm:block">
                    {a.category}
                  </span>
                </div>

                {/* Title + blurb */}
                <div className="col-span-3 sm:col-span-1">
                  <h3 className="font-display text-[20px] font-normal leading-[1.25] tracking-[-0.015em] text-ink transition-colors group-hover:text-royal sm:text-[22px]">
                    {a.title}
                  </h3>
                  <p className="mt-2 max-w-[68ch] text-[13px] leading-[1.65] text-ink/60">
                    {a.blurb}
                  </p>
                </div>

                {/* Meta */}
                <div className="col-start-1 col-end-4 mt-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/45 sm:col-auto sm:mt-2 sm:text-right">
                  <p>{a.read}</p>
                  <p>{a.date}</p>
                </div>

                {/* Arrow */}
                <span
                  className="hidden items-start justify-end pt-2 text-royal sm:flex"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  >
                    <path
                      d="M3 10 H16 M11 5 L16 10 L11 15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ----------------------------- CTA + FOOTER ----------------------------- */

function ContourField() {
  // Layered concentric ellipses, very subtle, painted with low-opacity strokes.
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1240 520"
    >
      <defs>
        <radialGradient id="cta-glow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="oklch(0.32 0.1 262)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="oklch(0.13 0.05 265)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1240" height="520" fill="url(#cta-glow)" />
      <g
        fill="none"
        stroke="oklch(0.85 0.04 262 / 0.06)"
        strokeWidth="1"
      >
        {[40, 80, 130, 190, 260, 340].map((r) => (
          <ellipse key={`l-${r}`} cx="200" cy="540" rx={r * 1.6} ry={r} />
        ))}
        {[40, 80, 130, 190, 260, 340].map((r) => (
          <ellipse key={`r-${r}`} cx="1080" cy="-20" rx={r * 1.6} ry={r} />
        ))}
      </g>
    </svg>
  );
}

function FooterCTA() {
  return (
    <section
      id="cta"
      className="relative scroll-mt-32 overflow-hidden bg-[oklch(0.13_0.05_265)] text-white"
    >
      <ContourField />
      <div className={`${container} relative py-20 text-center sm:py-24`}>
        <Reveal as="h2" variant="fade-up" className="mx-auto max-w-[28ch] font-display text-[28px] font-normal leading-[1.18] tracking-[-0.018em] text-white sm:text-[36px] lg:text-[42px]">
          This is how we think. The <em className="italic">Roadmap</em> is how we{" "}
          <em className="italic">build</em>.
        </Reveal>
        <Reveal as="p" variant="fade-up" delay={120} className="mx-auto mt-6 max-w-[62ch] text-[13.5px] leading-[1.75] text-white/65">
          Every piece here is a truth we have walked with a founder. If reading
          them made you want the version mapped for your business, that is where
          the Roadmap begins.
        </Reveal>
        <Reveal as="div" variant="fade-up" delay={220} className="mt-9 flex flex-col items-center gap-4">
          <a
            href="#"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-medium text-ink transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]"
          >
            Build My Roadmap
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>
          <p className="mx-auto max-w-[52ch] text-[11.5px] leading-[1.75] text-white/45">
            A 30-minute conversation. No pitch. If the timing is right, we
            should talk. If it is not, the work is waiting when it is.
          </p>
        </Reveal>
      </div>

      <footer className="relative border-t border-white/10">
        <div className={`${container} grid grid-cols-1 gap-8 py-10 sm:grid-cols-3`}>
          <div>
            <p className="font-display text-[18px] text-white">Trust Tai</p>
            <p className="mt-1 text-[11px] tracking-[0.2em] text-white/45">MAP. BUILD. SCALE.</p>
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-white/65">
            <li><Link to="/" className="hover:text-white">The Roadmap</Link></li>
            <li><Link to="/what-we-build" className="hover:text-white">Our Builds</Link></li>
            <li><Link to="/about" className="hover:text-white">Our Story</Link></li>
            <li><Link to="/insights" className="hover:text-white">Insights</Link></li>
            <li><Link to="/investment" className="hover:text-white">Investment</Link></li>
          </ul>
          <div className="flex flex-col items-start gap-4 text-[12px] text-white/55 sm:items-end">
            <p>© 2026 Trust Tai. All rights reserved.</p>
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

/* ------------------------------- PAGE ------------------------------- */

function InsightsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <FeaturedArgument />
        <ArticleList />
        <FooterCTA />
      </main>
    </div>
  );
}
