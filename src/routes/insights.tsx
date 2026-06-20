import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import * as React from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { Reveal, useReveal } from "@/hooks/use-reveal";
import {
  CATEGORIES,
  INSIGHTS,
  SORTS,
  type Insight,
  type SortKey,
  type TabCategory,
} from "@/lib/insights-data";
import {
  VIRTUALIZE_THRESHOLD,
  shouldVirtualize,
  logVirtualizationTransition,
} from "@/lib/insights-virtualization";

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
  const { ref, inView } = useReveal<HTMLDivElement>({ threshold: 0.25, once: true });
  // Continuous flight path. The airplane traces this from off-screen left
  // up to its resting spot. The dashed trail is the SAME path, revealed
  // via an animated mask so the trail "draws" as the plane flies through it.
  const flightD =
    "M -50 320 C 60 290, 130 270, 240 282 C 420 295, 560 318, 700 305 C 850 325, 1010 325, 1120 270 C 1220 220, 1230 160, 1130 145 C 1040 132, 1030 88, 1110 82 C 1155 78, 1185 76, 1196 64";
  const DUR = "5.5s";
  const BEGIN = "0.2s";
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      <svg
        aria-hidden="true"
        viewBox="0 0 1240 360"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="hero-path" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="oklch(0.72 0.12 262)" stopOpacity="0.18" />
            <stop offset="50%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.85" />
          </linearGradient>
          {/* Reveal mask: a thick white stroke is drawn along the flight
              path from start to end, exposing the dashed trail beneath it
              in sync with the airplane's motion. */}
          <mask id="hero-trail-reveal" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="1240" height="360" fill="black" />
            <path
              d={flightD}
              fill="none"
              stroke="white"
              strokeWidth="40"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={inView ? 1 : 1}
            >
              {inView && (
                <animate
                  attributeName="stroke-dashoffset"
                  from="1"
                  to="0"
                  dur={DUR}
                  begin={BEGIN}
                  fill="freeze"
                  calcMode="spline"
                  keyTimes="0;1"
                  values="1;0"
                  keySplines="0.42 0 0.2 1"
                />
              )}
            </path>
          </mask>
        </defs>

        {/* Dashed trail — masked so only the portion the plane has already
            passed is visible. */}
        <path
          id="hero-flight-path"
          d={flightD}
          fill="none"
          stroke="url(#hero-path)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="1.75 8"
          mask="url(#hero-trail-reveal)"
        />

        {/* Open-circle waypoints — fade in once the plane has passed each. */}
        <circle
          cx="60"
          cy="290"
          r="3"
          fill="none"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="0.9"
          opacity={inView ? 1 : 0}
          style={{ transition: "opacity 600ms ease-out", transitionDelay: "700ms" }}
        />
        <circle
          cx="1175"
          cy="205"
          r="2.5"
          fill="none"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="0.9"
          opacity={inView ? 1 : 0}
          style={{ transition: "opacity 600ms ease-out", transitionDelay: "3800ms" }}
        />

        {/* Paper airplane glyph — animates along the flight path when the
            hero scrolls into view, then freezes at the resting position. */}
        <g style={{ visibility: inView ? "visible" : "hidden" }}>
          <path
            d="M 0 0 L 28 -8 L 10 6 Z"
            fill="oklch(0.72 0.12 262 / 0.16)"
            stroke="oklch(0.48 0.18 262)"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path
            d="M 10 6 L 14 14 L 18 3 Z"
            fill="oklch(0.72 0.12 262 / 0.28)"
            stroke="oklch(0.48 0.18 262)"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          {inView && (
            <animateMotion
              dur={DUR}
              begin={BEGIN}
              fill="freeze"
              rotate="auto"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.42 0 0.2 1"
            >
              <mpath href="#hero-flight-path" />
            </animateMotion>
          )}
        </g>
      </svg>
    </div>
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
        <div className="mt-20 sm:mt-28 lg:mt-32" />
      </div>
    </section>
  );
}

/* ----------------------- FEATURED ARGUMENT ----------------------- */

function MilestonePath() {
  const stops = [
    { x: 40, y: 230, label: "Clarity" },
    { x: 210, y: 165, label: "Sequence" },
    { x: 360, y: 140, label: "Leverage" },
    { x: 510, y: 55, label: "Freedom", labelRight: true },
  ] as const;
  const pathD =
    "M 40 230 C 110 200, 160 180, 210 165 S 320 145, 360 140 S 470 95, 510 55";

  const DUR = 7; // seconds per full loop
  // Tuned for a deep-navy band: electric blue marks, muted cream labels.
  const ACTIVE_COLOR = "oklch(0.62 0.2 262)";
  const INACTIVE_COLOR = "oklch(0.92 0.02 85 / 0.55)";

  // Each stop gets a 1/4 slot in the loop. Stop i is "active" during
  // [i/4, (i+1)/4). The ripple/ring/label fill all key off the same offset.
  // Per-stop animations use begin="<offset>s" with dur=DUR/4 so the active
  // burst lines up exactly with the traveler dial-in.
  const slot = DUR / 4;

  return (
    <svg
      viewBox="0 0 580 280"
      className="h-auto w-full"
      role="img"
      aria-label="Journey path through Clarity, Sequence, Leverage, and Freedom."
    >
      <path
        id="milestone-track"
        d={pathD}
        fill="none"
        stroke="oklch(0.92 0.02 85 / 0.28)"
        strokeWidth="1"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {stops.map((s, i) => {
        const begin = `${(i * slot).toFixed(3)}s`;
        return (
          <g key={s.label}>
            {/* Ripple: expanding ring that fades, fires when this stop dials in */}
            <circle cx={s.x} cy={s.y} r="4" fill="none" stroke={ACTIVE_COLOR} strokeWidth="1" opacity="0">
              <animate
                attributeName="r"
                values="4;18"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.6;0"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
            {/* Active inner ring (steady while this stop is active) */}
            <circle cx={s.x} cy={s.y} r="12" fill="none" stroke="oklch(0.48 0.18 262 / 0.3)" strokeWidth="1" opacity="0">
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.05;0.95;1"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
            <circle cx={s.x} cy={s.y} r="7" fill="none" stroke="oklch(0.48 0.18 262 / 0.5)" strokeWidth="1" opacity="0">
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.05;0.95;1"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
            {/* Stop dot — radius grows slightly when active */}
            <circle cx={s.x} cy={s.y} r="3" fill={ACTIVE_COLOR}>
              <animate
                attributeName="r"
                values="3;4;4;3"
                keyTimes="0;0.05;0.95;1"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </circle>
            {/* Label — fill flips to active color, opacity lifts to 1 in sync */}
            <text
              x={"labelRight" in s && s.labelRight ? s.x - 4 : s.x}
              y={s.y + 22}
              textAnchor={"labelRight" in s && s.labelRight ? "end" : "middle"}
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill={INACTIVE_COLOR}
              opacity="0.75"
            >
              {s.label}
              <animate
                attributeName="fill"
                values={`${INACTIVE_COLOR};${ACTIVE_COLOR};${ACTIVE_COLOR};${INACTIVE_COLOR}`}
                keyTimes="0;0.05;0.95;1"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.75;1;1;0.75"
                keyTimes="0;0.05;0.95;1"
                dur={`${slot}s`}
                begin={begin}
                repeatCount="indefinite"
              />
            </text>
          </g>
        );
      })}
      {/* Dial-in traveler: jumps from milestone to milestone (no slide). */}
      <circle r="5" fill={ACTIVE_COLOR}>
        <animate
          attributeName="cx"
          dur={`${DUR}s`}
          repeatCount="indefinite"
          calcMode="discrete"
          keyTimes="0;0.25;0.5;0.75;1"
          values="40;210;360;510;40"
        />
        <animate
          attributeName="cy"
          dur={`${DUR}s`}
          repeatCount="indefinite"
          calcMode="discrete"
          keyTimes="0;0.25;0.5;0.75;1"
          values="230;165;140;55;230"
        />
      </circle>
    </svg>
  );
}

function FeaturedArgument() {
  const featured = INSIGHTS[0];
  const NAVY = "#0A0F1F";
  const CREAM = "#FBF9F4";
  const ELECTRIC = "oklch(0.62 0.2 262)";
  return (
    <section
      className="relative overflow-hidden"
      style={{ backgroundColor: NAVY, color: CREAM }}
      aria-labelledby="featured-heading"
    >
      <ContourField />
      <div className={`${container} relative grid grid-cols-1 gap-10 py-24 sm:py-32 lg:grid-cols-12 lg:gap-12 lg:py-40`}>
        <Reveal as="div" variant="fade-up" className="lg:col-span-6">
          <p
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: ELECTRIC }}
          >
            The Current Argument
          </p>
          <p className="mt-5 text-[13px]" style={{ color: "rgba(251,249,244,0.6)" }}>
            {featured.category}
          </p>
          <h2
            id="featured-heading"
            className="mt-3 font-display text-[30px] font-normal leading-[1.15] tracking-[-0.02em] sm:text-[38px] lg:text-[44px]"
            style={{ color: CREAM }}
          >
            {featured.title}
          </h2>
          <p
            className="mt-6 max-w-[58ch] text-[14px] leading-[1.75]"
            style={{ color: "rgba(251,249,244,0.78)" }}
          >
            {featured.body[0]}
          </p>
          <p
            className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "rgba(251,249,244,0.5)" }}
          >
            {featured.read} &nbsp;·&nbsp; {featured.date}
          </p>
          <Link
            to="/insights/$slug"
            params={{ slug: featured.slug }}
            className="group mt-6 inline-flex items-center gap-2 text-[13px] font-medium"
            style={{ color: ELECTRIC }}
          >
            Read the insight
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            <span
              className="ml-1 block h-px w-9 transition-all group-hover:w-14"
              style={{ backgroundColor: ELECTRIC, opacity: 0.6 }}
              aria-hidden="true"
            />
          </Link>
        </Reveal>
        <Reveal as="div" variant="fade" delay={120} className="flex items-stretch justify-center lg:col-span-6">
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
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [loopDetected, setLoopDetected] = React.useState(false);
  const [transitioning, setTransitioning] = React.useState(false);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const listParentRef = React.useRef<HTMLDivElement | null>(null);

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

  // Deterministic guards ---------------------------------------------------
  // Token bumps every time the filter set changes; any in-flight page load
  // started against an older token is discarded.
  const loadTokenRef = React.useRef(0);
  // Maximum number of pages possible for the current filter — a hard ceiling
  // the sentinel can never exceed regardless of how often it fires.
  const maxPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagesLoadedRef = React.useRef(1);

  // Loop detection: count sentinel fires within a rolling window.
  const fireTimestampsRef = React.useRef<number[]>([]);
  const LOOP_WINDOW_MS = 1500;
  const LOOP_THRESHOLD = 6;

  // Reset on filter/sort/query change.
  React.useEffect(() => {
    loadTokenRef.current += 1;
    pagesLoadedRef.current = 1;
    fireTimestampsRef.current = [];
    setLoopDetected(false);
    setStatus("idle");
    setErrorMsg(null);
    setTransitioning(true);
    setVisible(PAGE_SIZE);
    const t = window.setTimeout(() => setTransitioning(false), 180);
    return () => window.clearTimeout(t);
  }, [active, query, sort]);

  const filteredLen = filtered.length;
  const hasMore = visible < filteredLen && !loopDetected;

  // Page loader — async wrapper so we can surface loading + error states even
  // though the source is in-memory. Honors the load token so stale loads from
  // a previous filter cannot land.
  const loadNextPage = React.useCallback(async () => {
    if (pagesLoadedRef.current >= maxPages) return;
    const token = loadTokenRef.current;
    setStatus("loading");
    setErrorMsg(null);
    try {
      // Yield to the browser so the loading state can paint.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (token !== loadTokenRef.current) return; // filter changed mid-flight
      pagesLoadedRef.current = Math.min(pagesLoadedRef.current + 1, maxPages);
      setVisible((v) => Math.min(v + PAGE_SIZE, filteredLen));
      setStatus("idle");
    } catch (err) {
      if (token !== loadTokenRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : "Failed to load more insights.");
      setStatus("error");
    }
  }, [maxPages, filteredLen]);

  // Infinite scroll observer. Disconnects the moment we hit the end-of-list
  // ceiling, an error, or a detected fetch loop.
  React.useEffect(() => {
    if (!hasMore || status === "loading" || status === "error") return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const now = performance.now();
        const fires = fireTimestampsRef.current.filter((t) => now - t < LOOP_WINDOW_MS);
        fires.push(now);
        fireTimestampsRef.current = fires;
        if (fires.length >= LOOP_THRESHOLD) {
          // eslint-disable-next-line no-console
          console.warn(
            `[insights] sentinel fired ${fires.length}× in ${LOOP_WINDOW_MS}ms — pausing infinite scroll`,
          );
          setLoopDetected(true);
          io.disconnect();
          return;
        }
        if (pagesLoadedRef.current >= maxPages) {
          io.disconnect();
          return;
        }
        void loadNextPage();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, status, loadNextPage, maxPages]);

  const shown = React.useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  // Log once when virtualization toggles on/off so the threshold can be tuned.
  const virtPrevRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    virtPrevRef.current = logVirtualizationTransition(
      virtPrevRef.current,
      shown.length,
      VIRTUALIZE_THRESHOLD,
    );
  }, [shown.length]);

  // Virtualization: window-scrolling list with measured row heights.
  // Track the parent's offsetTop in state so the virtualizer's scrollMargin
  // and the per-item transform offset always use the SAME value (a ref read
  // during render can lag behind what the virtualizer captured, which
  // collapses every row to translateY(0)).
  const [parentOffset, setParentOffset] = React.useState(0);
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = listParentRef.current;
      if (!el) return;
      const next = el.getBoundingClientRect().top + window.scrollY;
      setParentOffset((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [shown.length]);

  const virtualizer = useWindowVirtualizer({
    count: shown.length,
    // Realistic estimate for an editorial row (category + 2-line title + blurb).
    estimateSize: () => 260,
    overscan: 4,
    scrollMargin: parentOffset,
    getItemKey: (i) => shown[i]?.slug ?? i,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();


  const resumeAfterLoop = () => {
    fireTimestampsRef.current = [];
    setLoopDetected(false);
  };


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
            <div ref={listParentRef} className="relative">
              {(() => {
                // Virtualize only when the list is large enough to matter.
                // Threshold is configurable via VITE_INSIGHTS_VIRTUALIZE_THRESHOLD.
                const useVirtual = shouldVirtualize(shown.length, VIRTUALIZE_THRESHOLD);
                const items = useVirtual
                  ? virtualItems.map((vi) => ({
                      key: String(vi.key),
                      index: vi.index,
                      article: shown[vi.index],
                      transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
                      measureRef: virtualizer.measureElement,
                    }))
                  : shown.map((a, i) => ({
                      key: a.slug,
                      index: i,
                      article: a,
                      transform: undefined as string | undefined,
                      measureRef: undefined,
                    }));

                return (
                  <ul
                    className={useVirtual ? "relative w-full" : "divide-y divide-rule/70"}
                    style={useVirtual ? { height: `${totalSize}px` } : undefined}
                  >
                    {items.map(({ key, index, article: a, transform, measureRef }) => {
                      if (!a) return null;
                      const isLast = index === shown.length - 1;
                      return (
                        <li
                          key={key}
                          data-index={index}
                          ref={measureRef}
                          className={`animate-fade-in ${
                            useVirtual
                              ? `absolute left-0 top-0 w-full ${isLast ? "" : "border-b border-rule/70"}`
                              : ""
                          }`}
                          style={{
                            ...(transform ? { transform } : null),
                            animationDelay: `${Math.min(index, 6) * 40}ms`,
                          }}
                        >
                          <Link
                            to="/insights/$slug"
                            params={{ slug: a.slug }}
                            className="group -mx-4 grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-3 rounded-sm px-4 py-7 transition-colors duration-200 hover:bg-royal/[0.04] sm:grid-cols-[220px_minmax(0,1fr)_140px_24px] sm:gap-x-10 sm:gap-y-0 sm:py-8"
                          >
                            {/* Col 1: dot + category */}
                            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
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
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          )}

          {/* Sentinel + status */}
          {hasMore && status !== "error" && !loopDetected && (
            <div ref={sentinelRef} aria-hidden="true" className="h-10" />
          )}

          <div
            className="pb-8 pt-2 text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/50"
            aria-live="polite"
            role="status"
          >
            {status === "loading" && (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 animate-spin rounded-full border border-royal/30 border-t-royal"
                />
                Loading more ({shown.length} of {filteredLen})
              </span>
            )}
            {status === "error" && (
              <span className="inline-flex flex-col items-center gap-2 text-ink/70 sm:flex-row">
                <span className="text-rose-600">
                  {errorMsg ?? "Something went wrong loading more insights."}
                </span>
                <button
                  type="button"
                  onClick={() => void loadNextPage()}
                  className="rounded-full border border-royal/40 px-3 py-1 text-royal transition-colors hover:bg-royal hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
                >
                  Retry
                </button>
              </span>
            )}
            {status === "idle" && !loopDetected && (
              <span>
                {hasMore
                  ? `Scroll for more (${shown.length} of ${filteredLen})`
                  : `${filteredLen} insight${filteredLen === 1 ? "" : "s"}`}
              </span>
            )}
            {loopDetected && (
              <span className="inline-flex flex-col items-center gap-2 text-amber-700 sm:flex-row">
                <span>Infinite scroll paused: possible fetch loop detected.</span>
                <button
                  type="button"
                  onClick={resumeAfterLoop}
                  className="rounded-full border border-amber-700/40 px-3 py-1 transition-colors hover:bg-amber-700 hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/40"
                >
                  Resume
                </button>
              </span>
            )}
          </div>
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
      </main>
      <SiteClosing
        headline={<>Every piece here is <Accent>a truth we have walked with a founder</Accent>.</>}
        supporting={<>If reading them made you want the version mapped for your business, that is where the Roadmap begins.</>}
      />
    </div>
  );
}
