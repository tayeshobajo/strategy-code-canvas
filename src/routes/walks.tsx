import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { Reveal } from "@/hooks/use-reveal";
import heroArt from "@/assets/walks-hero-bg.png.asset.json";
import imgLeadership from "@/assets/walks/leadership-education.jpg.asset.json";
import imgPrivate from "@/assets/walks/private-milestone.jpg.asset.json";
import imgFinancial from "@/assets/walks/financial-advisory.jpg.asset.json";
import imgFounder from "@/assets/walks/founder-led.jpg.asset.json";
import imgHealth from "@/assets/walks/health-wellness.jpg.asset.json";
import imgEcom from "@/assets/walks/ecommerce-brand.jpg.asset.json";

export const Route = createFileRoute("/walks")({
  head: () => {
    const title = "The Walks | Trust Tai";
    const description =
      "Real businesses. Real routes. Real ground covered. A selection of walks we have taken with founder-led businesses - the milestones built, and where each business stands today.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://trusttai.com/walks" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "https://trusttai.com/walks" }],
      scripts: [
        {
          type: "application/ld+json",
          id: "jsonld-walks",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                name: title,
                description,
                url: "https://trusttai.com/walks",
                isPartOf: { "@type": "WebSite", name: "Trust Tai", url: "https://trusttai.com" },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://trusttai.com/" },
                  { "@type": "ListItem", position: 2, name: "Walks", item: "https://trusttai.com/walks" },
                ],
              },
            ],
          }),
        },
      ],


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
  image: { url: string };
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
    image: imgLeadership,
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
    image: imgPrivate,
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
    image: imgFinancial,
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
    image: imgFounder,
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
    image: imgHealth,
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
    image: imgEcom,
  },

];

const FILTERS = ["All", "Foundations", "Growth Engines", "Operating Systems", "Long Walks"] as const;
type Filter = (typeof FILTERS)[number];

const SORTS = ["Newest", "Oldest", "Most milestones", "Fewest milestones"] as const;
type Sort = (typeof SORTS)[number];

function walkYear(w: Walk): number {
  const m = w.walkingSince.match(/(\d{4})/);
  if (m) return Number(m[1]);
  // "Active" / "Completed in N days" - treat as current.
  return new Date().getFullYear();
}

function sortWalks(list: Walk[], sort: Sort): Walk[] {
  const arr = [...list];
  switch (sort) {
    case "Newest":
      return arr.sort((a, b) => walkYear(b) - walkYear(a));
    case "Oldest":
      return arr.sort((a, b) => walkYear(a) - walkYear(b));
    case "Most milestones":
      return arr.sort((a, b) => b.milestones.length - a.milestones.length);
    case "Fewest milestones":
      return arr.sort((a, b) => a.milestones.length - b.milestones.length);
  }
}

/* ------------------------------ HERO ------------------------------ */


function SummitFlag({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const h = 28 * scale;
  const w = 18 * scale;
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - h}
        stroke="var(--royal)"
        strokeWidth={1.8 * scale}
        strokeLinecap="round"
      />
      <path
        d={`M ${x} ${y - h} L ${x + w} ${y - h + 5 * scale} L ${x} ${y - h + 10 * scale} Z`}
        fill="var(--royal)"
      />
    </g>
  );
}


function Hero() {
  return (
    <section
      className="walks-hero relative w-full overflow-hidden bg-paper"
      style={{ minHeight: '660px' }}
    >
      {/* Mountain background layer - nudged right so it stays clear of copy */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: `url(${heroArt.url})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '70% auto',
          backgroundPosition: 'right -5% top 32%',
          opacity: 0.92,
        }}
        aria-hidden="true"
      />

      {/* Cream gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            'linear-gradient(to right, #fbf8f2 0%, #fbf8f2 32%, rgba(251, 248, 242, 0.9) 46%, rgba(251, 248, 242, 0.4) 60%, rgba(251, 248, 242, 0.1) 80%, rgba(251, 248, 242, 0) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-[3] mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12">
        <div style={{ maxWidth: '560px', paddingTop: '110px', paddingBottom: '90px' }}>

          <Reveal as="p" variant="fade-up" className="eyebrow mb-6">
            The Walks
          </Reveal>
          <Reveal
            as="h1"
            variant="rise"
            delay={120}
            className="font-display text-[3rem] leading-[1.04] tracking-tight text-ink sm:text-[3.5rem]"
          >
            Real businesses.<br />
            Real routes.<br />
            Real <em className="italic text-royal">ground</em> covered.
          </Reveal>
          <Reveal
            as="p"
            variant="fade-up"
            delay={260}
            className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-ink/70"
          >
            Every walk here started where your business is now: a founder
            carrying weight, a map waiting to be drawn. These are the journeys,
            the milestones we built along them, and where each business
            stands today.
          </Reveal>
          <Reveal
            as="p"
            variant="fade-up"
            delay={340}
            className="mt-5 text-[13px] italic leading-[1.7] text-ink/55"
          >
            A selection. Most of our work stays private.
          </Reveal>
          <Reveal as="div" variant="fade-up" delay={400} className="mt-8">
            <a
              href="/build-my-roadmap"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90"
            >
              Build My Roadmap
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </Reveal>
        </div>
      </div>

      {/* Thesis line - beneath the route in the mountain area */}
      <p
        className="absolute z-[3] hidden font-display italic lg:block"
        style={{ right: '22%', bottom: '170px', fontSize: '20px', color: '#071a3d', opacity: 0.82 }}
      >
        No two walks are the same.
      </p>

    </section>
  );
}

/* ----------------------------- FILTER ----------------------------- */

function FilterRow({
  active,
  onChange,
  sort,
  onSortChange,
  resultCount,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
  sort: Sort;
  onSortChange: (s: Sort) => void;
  resultCount: number;
}) {
  return (
    <div className={`${container} mt-8`}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b border-rule pb-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
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
        <div className="flex items-center gap-3 pb-1">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
            {resultCount} {resultCount === 1 ? "walk" : "walks"}
          </span>
          <label className="flex items-center gap-2 text-[12px] text-ink/65">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
              Sort
            </span>
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as Sort)}
              className="rounded-full border border-rule bg-paper px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:border-royal/50 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
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
  // y trends upward (lower number) with small variance - last point is highest.
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
        if (isLast) {
          // The summit gets a flag instead of a plain dot; rings sit beneath.
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={ys[i]}
                r="11"
                fill="var(--royal)"
                fillOpacity="0.10"
                className="ring-breathe"
                style={{ ["--ring-delay" as never]: ringDelay }}
               
              />
              <circle cx={x} cy={ys[i]} r="3.5" fill="var(--royal)" />
              <SummitFlag x={x} y={ys[i] - 1} scale={0.9} />
            </g>
          );
        }
        return (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r={3.5}
            fill="var(--royal)"
          />
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
            fontSize="10.5"
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
    </svg>
  );
}

/* ----------------------------- WALK ROW ----------------------------- */

function WalkRow({
  walk,
  index,
  selected,
  onSelect,
}: {
  walk: Walk;
  index: number;
  selected: boolean;
  onSelect: (slug: string) => void;
}) {
  const handleActivate = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Don't hijack the link click - let it navigate.
    const target = e.target as HTMLElement;
    if (target.closest("a")) return;
    onSelect(walk.slug);
  };
  return (
    <Reveal
      as="article"
      variant="fade-up"
      delay={index * 60}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-selected={selected}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate(e);
        }
      }}
      className="group row-interactive border-t border-rule focus:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
    >
      <div
        className={`${container} grid grid-cols-1 gap-6 py-8 md:grid-cols-[260px_minmax(0,1.1fr)_minmax(0,1.1fr)_150px] md:items-center md:gap-8`}
      >
        {/* Featured image */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink/5 md:aspect-[5/4]">
          <img
            src={walk.image.url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        </div>

        {/* Category + headline + blurb */}
        <div className="min-w-0">
          <p className="eyebrow leading-tight">{walk.category}</p>
          <p className="mt-1 text-[12.5px] text-ink/55">{walk.subcategory}</p>
          <p className="mt-5 font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-ink transition-colors group-hover:text-royal group-data-[selected=true]:text-royal sm:text-[38px]">
            {walk.headline.join(" ")}
          </p>
          <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
            Verified outcome
          </p>
          <p className="mt-4 max-w-[40ch] text-[12.5px] leading-[1.7] text-ink/65">
            {walk.blurb}
          </p>
        </div>

        {/* SVG route */}
        <div className="relative h-[170px] w-full">
          <WalkRoute labels={walk.milestones} rowIndex={index} />
        </div>


        {/* Right: stats + link */}
        <div className="flex flex-col justify-between gap-6 md:items-end md:text-right">
          <div className="font-mono text-[11px] leading-[1.8] tracking-[0.16em] text-ink/65">
            <p className="uppercase">{walk.stat}</p>
            <p className="mt-1 uppercase text-ink/50">{walk.walkingSince}</p>
          </div>
          <Link
            to="/walks/$slug"
            params={{ slug: walk.slug }}
            onClick={(e) => e.stopPropagation()}
            className="link-royal inline-flex items-center gap-1.5 text-[13px] font-medium transition-transform group-hover:translate-x-0.5"
          >
            View walk
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
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
            href="/build-my-roadmap"
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


/* ------------------------------ PAGE ------------------------------ */

function WalksPage() {
  const [filter, setFilter] = React.useState<Filter>("All");
  const filterAnchorRef = React.useRef<HTMLDivElement>(null);
  // Track viewport offset of the filter row across renders so we can
  // restore scroll position after a filter change shrinks/grows the list.
  const pendingAnchorTopRef = React.useRef<number | null>(null);

  const [sort, setSort] = React.useState<Sort>("Newest");
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const base = filter === "All" ? WALKS : WALKS.filter((w) => w.bucket === filter);
    return sortWalks(base, sort);
  }, [filter, sort]);

  const handleFilterChange = React.useCallback((next: Filter) => {
    if (next === filter) return;
    const node = filterAnchorRef.current;
    pendingAnchorTopRef.current = node ? node.getBoundingClientRect().top : null;
    setFilter(next);
  }, [filter]);

  const handleSelect = React.useCallback((slug: string) => {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  }, []);

  React.useLayoutEffect(() => {
    const prevTop = pendingAnchorTopRef.current;
    if (prevTop == null) return;
    const node = filterAnchorRef.current;
    if (!node) return;
    const nextTop = node.getBoundingClientRect().top;
    const delta = nextTop - prevTop;
    if (delta !== 0) {
      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    }
    pendingAnchorTopRef.current = null;
  }, [filter]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <div ref={filterAnchorRef}>
          <FilterRow
            active={filter}
            onChange={handleFilterChange}
            sort={sort}
            onSortChange={setSort}
            resultCount={filtered.length}
          />
        </div>
        <section className="mt-2">
          {filtered.map((w, i) => (
            <WalkRow
              key={w.slug}
              walk={w}
              index={i}
              selected={selectedSlug === w.slug}
              onSelect={handleSelect}
            />
          ))}
          {filtered.length > 0 && <div className="border-t border-rule" />}
        </section>
      </main>
      <SiteClosing
        headline={<>Every walk here started <Accent>where you are now</Accent>.</>}
        supporting={<>A first conversation. A map. Then the first milestone. Your walk begins the same way.</>}
      />
    </div>
  );
}
