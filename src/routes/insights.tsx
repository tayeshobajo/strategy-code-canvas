import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal } from "@/hooks/use-reveal";
import {
  CATEGORIES,
  INSIGHTS,
  SORTS,
  type Insight,
  type SortKey,
  type TabCategory,
} from "@/lib/insights-data";

export const Route = createFileRoute("/insights")({
  head: () => {
    const title = "Insights | Trust Tai";
    const description =
      "Positions, not trends. What we have learned mapping the journey for founder-led businesses. Read three and you will know how we think.";
    const ogDescription =
      "The same truths, argued in new stories. Field-tested positions for founder-led businesses.";
    const ld = {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Trust Tai Insights",
      description,
      url: "/insights",
      blogPost: INSIGHTS.slice(0, 6).map((i) => ({
        "@type": "BlogPosting",
        headline: i.title,
        datePublished: i.publishedAt,
        url: `/insights/${i.slug}`,
        articleSection: i.category,
      })),
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: ogDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "/insights" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: ogDescription },
      ],
      links: [{ rel: "canonical", href: "/insights" }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },
  component: InsightsPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";
const PAGE_SIZE = 8;

/* ----------------------------- HERO ----------------------------- */

function HeroPath() {
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
      <circle cx="60" cy="316" r="3" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="660" cy="280" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="1040" cy="130" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <g transform="translate(1188 64) rotate(-18)">
        <path d="M 0 0 L 28 -8 L 14 6 L 18 14 Z" fill="oklch(0.72 0.12 262 / 0.25)" stroke="oklch(0.48 0.18 262)" strokeWidth="1" strokeLinejoin="round" />
        <path d="M 0 0 L 14 6" stroke="oklch(0.48 0.18 262)" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32 lg:pt-36" aria-labelledby="insights-heading">
      <HeroPath />
      <div className={`${container} relative`}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[820px] text-center">
          <p className="eyebrow">Insights</p>
          <h1
            id="insights-heading"
            className="mt-5 font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[68px]"
          >
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
      aria-label="Journey path through Clarity, Sequence, Leverage, and Freedom, currently at Leverage."
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
              <circle cx={s.x} cy={s.y} r="14" fill="none" stroke="oklch(0.48 0.18 262 / 0.35)" strokeWidth="1" className="ring-breathe" />
              <circle cx={s.x} cy={s.y} r="9" fill="none" stroke="oklch(0.48 0.18 262 / 0.5)" strokeWidth="1" />
            </>
          )}
          <circle cx={s.x} cy={s.y} r={s.active ? 4 : 3} fill="oklch(0.48 0.18 262)" />
          <text x={s.x} y={s.y + 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill={s.active ? "oklch(0.48 0.18 262)" : "oklch(0.4 0.04 260)"} opacity={s.active ? 1 : 0.7}>
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function FeaturedArgument() {
  const featured = INSIGHTS[0];
  return (
    <section className="border-t border-rule/70" aria-labelledby="featured-heading">
      <div className={`${container} grid grid-cols-1 gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-12`}>
        <Reveal as="div" variant="fade-up" className="lg:col-span-7">
          <p className="eyebrow">The Current Argument</p>
          <p className="mt-5 text-[13px] text-ink/55">{featured.category}</p>
          <h2
            id="featured-heading"
            className="mt-3 font-display text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-ink sm:text-[38px] lg:text-[44px]"
          >
            {featured.title}
          </h2>
          <p className="mt-6 max-w-[58ch] text-[14px] leading-[1.75] text-ink/65">{featured.body[0]}</p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/45">
            {featured.read} &nbsp;·&nbsp; {featured.date}
          </p>
          <Link
            to="/insights/$slug"
            params={{ slug: featured.slug }}
            className="group mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-royal"
          >
            Read the insight
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            <span className="ml-1 block h-px w-9 bg-royal/60 transition-all group-hover:w-14" aria-hidden="true" />
          </Link>
        </Reveal>
        <Reveal as="div" variant="fade" delay={120} className="flex items-center justify-center lg:col-span-5">
          <MilestonePath />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- ARTICLE LIST --------------------------- */

function compare(a: Insight, b: Insight, sort: SortKey) {
  switch (sort) {
    case "newest":
      return b.publishedAt.localeCompare(a.publishedAt);
    case "oldest":
      return a.publishedAt.localeCompare(b.publishedAt);
    case "shortest":
      return a.readMinutes - b.readMinutes;
    case "longest":
      return b.readMinutes - a.readMinutes;
  }
}

function ArticleList() {
  const [active, setActive] = React.useState<TabCategory>("All");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const [transitioning, setTransitioning] = React.useState(false);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return INSIGHTS.filter((a) => {
      if (active !== "All" && a.category !== active) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.blurb.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    }).sort((a, b) => compare(a, b, sort));
  }, [active, query, sort]);

  // Smooth fade when filter/sort/query changes
  React.useEffect(() => {
    setTransitioning(true);
    setVisible(PAGE_SIZE);
    const t = window.setTimeout(() => setTransitioning(false), 180);
    return () => window.clearTimeout(t);
  }, [active, query, sort]);

  // Infinite scroll: load more when sentinel intersects
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [filtered.length]);

  const shown = filtered.slice(0, visible);

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const len = CATEGORIES.length;
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % len;
    if (e.key === "ArrowLeft") next = (index - 1 + len) % len;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = len - 1;
    const cat = CATEGORIES[next];
    setActive(cat);
    tabRefs.current[cat]?.focus();
  };

  return (
    <section className="border-t border-rule/70" aria-labelledby="library-heading">
      <h2 id="library-heading" className="sr-only">Article library</h2>
      <div className={container}>
        {/* Search + sort */}
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-[360px]">
            <span className="sr-only">Search insights</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search insights"
              className="w-full rounded-full border border-rule/80 bg-paper py-2.5 pl-10 pr-4 text-[13px] text-ink placeholder:text-ink/40 focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
            />
          </label>
          <div className="flex items-center gap-3">
            <label className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55" htmlFor="insights-sort">
              Sort
            </label>
            <select
              id="insights-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-full border border-rule/80 bg-paper px-3 py-2 text-[12.5px] text-ink focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Filter insights by category"
          className="-mx-1 flex min-w-0 overflow-x-auto"
        >
          <ul className="flex min-w-max items-center gap-1 py-2 sm:gap-2">
            {CATEGORIES.map((c, i) => {
              const isActive = c === active;
              return (
                <li key={c}>
                  <button
                    ref={(el) => { tabRefs.current[c] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="insights-panel"
                    id={`tab-${i}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActive(c)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className={`relative px-3 py-2 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-royal/30 ${
                      isActive ? "text-royal" : "text-ink/60 hover:text-ink"
                    }`}
                  >
                    {c}
                    {isActive && <span className="absolute inset-x-3 -bottom-px h-[2px] bg-royal" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="h-px w-full bg-rule/70" aria-hidden="true" />

        {/* Rows */}
        <div
          id="insights-panel"
          role="tabpanel"
          aria-live="polite"
          className={`transition-all duration-200 ease-out ${
            transitioning ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          {shown.length === 0 ? (
            <p className="py-16 text-center text-[13.5px] text-ink/55">
              No insights match that search yet.
            </p>
          ) : (
            <ul className="divide-y divide-rule/70">
              {shown.map((a, i) => (
                <li
                  key={a.slug}
                  className="group animate-fade-in"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <Link
                    to="/insights/$slug"
                    params={{ slug: a.slug }}
                    className="grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-3 py-7 sm:grid-cols-[220px_minmax(0,1fr)_140px_24px] sm:gap-x-10 sm:gap-y-0 sm:py-8"
                  >
                    {/* Col 1: dot + category */}
                    <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:items-start sm:pt-[10px]">
                      <span className="inline-block h-[7px] w-[7px] flex-none rounded-full bg-royal" aria-hidden="true" />
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/60">
                        {a.category}
                      </span>
                    </div>
                    {/* Col 2: title + blurb */}
                    <div className="col-span-2 sm:col-span-1">
                      <h3 className="font-display text-[20px] font-normal leading-[1.25] tracking-[-0.015em] text-ink transition-colors group-hover:text-royal sm:text-[22px]">
                        {a.title}
                      </h3>
                      <p className="mt-2 max-w-[68ch] text-[13px] leading-[1.65] text-ink/55">{a.blurb}</p>
                    </div>
                    {/* Col 3: meta */}
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/45 sm:pt-[10px] sm:text-right">
                      <p>{a.read.replace(" read", "").toUpperCase()} READ</p>
                      <p>{a.date.toUpperCase()}</p>
                    </div>
                    {/* Col 4: arrow */}
                    <span className="flex items-start justify-end pt-1 text-royal sm:pt-[10px]" aria-hidden="true">
                      <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1">
                        <path d="M3 10 H16 M11 5 L16 10 L11 15" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Sentinel + status */}
          <div
            ref={sentinelRef}
            aria-hidden="true"
            className="h-10"
          />
          <p className="pb-8 text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/40" aria-live="polite">
            {visible < filtered.length
              ? `Loading more (${shown.length} of ${filtered.length})`
              : `${filtered.length} insight${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- CTA + FOOTER ----------------------------- */

function ContourField() {
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
      <g fill="none" stroke="oklch(0.85 0.04 262 / 0.06)" strokeWidth="1">
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
      aria-labelledby="cta-heading"
    >
      <ContourField />
      <div className={`${container} relative py-20 text-center sm:py-24`}>
        <Reveal as="h2" id="cta-heading" variant="fade-up" className="mx-auto max-w-[28ch] font-display text-[28px] font-normal leading-[1.18] tracking-[-0.018em] text-white sm:text-[36px] lg:text-[42px]">
          This is how we think. The <em className="italic">Roadmap</em> is how we <em className="italic">build</em>.
        </Reveal>
        <Reveal as="p" variant="fade-up" delay={120} className="mx-auto mt-6 max-w-[62ch] text-[13.5px] leading-[1.75] text-white/65">
          Every piece here is a truth we have walked with a founder. If reading them made you want the version mapped for your business, that is where the Roadmap begins.
        </Reveal>
        <Reveal as="div" variant="fade-up" delay={220} className="mt-9 flex flex-col items-center gap-4">
          <a
            href="#"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-medium text-ink transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]"
          >
            Build My Roadmap
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
          <p className="mx-auto max-w-[52ch] text-[11.5px] leading-[1.75] text-white/45">
            A 30-minute conversation. No pitch. If the timing is right, we should talk. If it is not, the work is waiting when it is.
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
