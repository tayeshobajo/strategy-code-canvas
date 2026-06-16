import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import * as React from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
          <stop offset="40%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Main sweeping path: rises over a hill on the left, dips beneath the
          subhead, then climbs off the top-right toward the paper airplane. */}
      <path
        d="M -20 300 C 80 210, 160 175, 260 200 S 460 320, 640 300 S 900 220, 1060 150 S 1200 90, 1230 60"
        fill="none"
        stroke="url(#hero-path)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeDasharray="2 7"
      />
      {/* Small curling trail right behind the airplane */}
      <path
        d="M 1110 110 C 1140 92, 1170 78, 1190 70"
        fill="none"
        stroke="oklch(0.48 0.18 262 / 0.65)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeDasharray="1.5 5"
      />
      <circle cx="60" cy="282" r="3" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="640" cy="300" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      <circle cx="1060" cy="150" r="2.5" fill="none" stroke="oklch(0.48 0.18 262)" strokeWidth="1" />
      {/* Paper airplane glyph */}
      <g transform="translate(1196 64) rotate(-15)">
        <path
          d="M 0 0 L 34 -10 L 12 8 Z"
          fill="oklch(0.72 0.12 262 / 0.18)"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M 12 8 L 18 18 L 22 4"
          fill="oklch(0.72 0.12 262 / 0.28)"
          stroke="oklch(0.48 0.18 262)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
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
    { x: 40, y: 230, label: "Clarity" },
    { x: 210, y: 165, label: "Sequence" },
    { x: 360, y: 140, label: "Leverage", active: true },
    { x: 510, y: 55, label: "Freedom", labelRight: true },
  ] as const;
  return (
    <svg
      viewBox="0 0 580 280"
      className="h-auto w-full max-w-[560px]"
      role="img"
      aria-label="Journey path through Clarity, Sequence, Leverage, and Freedom, currently at Leverage."
    >
      <path
        d="M 40 230 C 110 200, 160 180, 210 165 S 320 145, 360 140 S 470 95, 510 55"
        fill="none"
        stroke="oklch(0.48 0.18 262 / 0.45)"
        strokeWidth="1"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {stops.map((s) => (
        <g key={s.label}>
          {"active" in s && s.active && (
            <>
              <circle cx={s.x} cy={s.y} r="13" fill="none" stroke="oklch(0.48 0.18 262 / 0.35)" strokeWidth="1" className="ring-breathe" />
              <circle cx={s.x} cy={s.y} r="8" fill="none" stroke="oklch(0.48 0.18 262 / 0.55)" strokeWidth="1" />
            </>
          )}
          <circle cx={s.x} cy={s.y} r={"active" in s && s.active ? 4 : 3} fill="oklch(0.48 0.18 262)" />
          {"labelRight" in s && s.labelRight ? (
            <text
              x={s.x + 12}
              y={s.y + 4}
              textAnchor="start"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill="oklch(0.4 0.04 260)"
              opacity={0.75}
            >
              {s.label}
            </text>
          ) : (
            <text
              x={s.x}
              y={s.y + 22}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill={"active" in s && s.active ? "oklch(0.48 0.18 262)" : "oklch(0.4 0.04 260)"}
              opacity={"active" in s && s.active ? 1 : 0.75}
            >
              {s.label}
            </text>
          )}
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
                          className={`group animate-fade-in ${
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
