import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Compass, Printer } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { INSIGHTS, getInsightBySlug, type Insight } from "@/lib/insights-data";
import taiPortrait from "@/assets/tai-portrait-seated.png.asset.json";

/* ----------------------- Reading progress + scroll-spy ----------------------- */

function useReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const article = document.getElementById("article-root");
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return progress;
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  useEffect(() => {
    if (!ids.length) return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Track all sections currently intersecting; choose the one closest to the top.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids.join("|")]);
  return active;
}

function ReadingProgressBar() {
  const progress = useReadingProgress();
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent print:hidden"
      aria-hidden="true"
    >
      <div
        className="h-full origin-left bg-royal transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      />
    </div>
  );
}

export const Route = createFileRoute("/insights_/$slug")({
  loader: ({ params }) => {
    const insight = getInsightBySlug(params.slug);
    if (!insight) throw notFound();
    return { insight };
  },
  head: ({ params, loaderData }) => {
    const insight = loaderData?.insight;
    if (!insight) {
      return { meta: [{ title: "Insight not found | Trust Tai" }] };
    }
    const url = `/insights/${params.slug}`;
    const title = `${insight.title} | Trust Tai`;
    const description = insight.blurb;
    const ld = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: insight.title,
      description,
      datePublished: insight.publishedAt,
      author: { "@type": "Person", name: "Tai Shobajo" },
      publisher: { "@type": "Organization", name: "Trust Tai" },
      articleSection: insight.category,
      mainEntityOfPage: url,
      url,
    };
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: insight.title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Trust Tai" },
        { property: "article:published_time", content: insight.publishedAt },
        { property: "article:section", content: insight.category },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: insight.title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", id: "jsonld-insight", children: JSON.stringify(ld) }],
    };
  },
  notFoundComponent: NotFoundInsight,
  errorComponent: ErrorInsight,
  component: InsightArticlePage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

/* ------------------------------ SVG accents ------------------------------ */

function DashedSeparator() {
  // Long dashed rule with a soft circular node in the center, sitting between
  // the metadata block and the article body. Pure SVG, scales with width.
  return (
    <div className="relative mx-auto my-12 w-full max-w-[820px] sm:my-16">
      <svg
        aria-hidden="true"
        viewBox="0 0 820 16"
        preserveAspectRatio="none"
        className="block h-4 w-full text-ink/25"
      >
        <line
          x1="0"
          y1="8"
          x2="385"
          y2="8"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        <line
          x1="435"
          y1="8"
          x2="820"
          y2="8"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        <circle
          cx="410"
          cy="8"
          r="5"
          fill="none"
          stroke="oklch(0.48 0.18 262 / 0.55)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function CategoryGlyph() {
  // Small circular marker shown next to the category in the sidebar card.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-royal">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
    </svg>
  );
}

function PullQuoteMark() {
  // Vertical stroke + bullet that anchors the pull quote on the left edge.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 96"
      className="h-full w-3 shrink-0 text-royal"
      preserveAspectRatio="none"
    >
      <line x1="6" y1="2" x2="6" y2="74" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="86" r="4" fill="currentColor" />
    </svg>
  );
}

function FrameworkTimeline({ steps }: { steps: string[] }) {
  // Inline SVG: dot → arrow → dot, repeating. Layout uses a grid so the
  // labels under each dot stay aligned even when text wraps to two lines.
  const cols = `repeat(${steps.length}, minmax(0, 1fr))`;
  return (
    <div className="mt-6">
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: cols }}
        aria-hidden="true"
      >
        {steps.map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <div className="flex w-full items-center">
              {/* left connector */}
              <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : "bg-royal/40"}`} />
              <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-royal">
                <circle cx="6" cy="6" r="3.2" fill="currentColor" />
              </svg>
              {i < steps.length - 1 && (
                <>
                  <span className="h-px w-3 bg-royal/40" />
                  <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0 text-royal/70">
                    <path
                      d="M0 5 H10 M7 1 L11 5 L7 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              )}
              {/* right connector */}
              <span className={`h-px flex-1 ${i === steps.length - 1 ? "opacity-0" : "bg-royal/40"}`} />
            </div>
          </div>
        ))}
      </div>
      <ul
        className="mt-3 grid gap-2"
        style={{ gridTemplateColumns: cols }}
      >
        {steps.map((s, i) => (
          <li
            key={i}
            className="text-center font-mono text-[10.5px] leading-[1.35] uppercase tracking-[0.14em] text-ink/60"
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoadmapDottedPath() {
  // Decorative S-curve that lives in the roadmap CTA strip.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 140 120"
      className="h-full w-full text-royal/70"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d="M 8 96 C 32 96, 46 70, 68 56 S 110 30, 132 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="1.5 5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="96" r="2.5" fill="currentColor" />
      <circle cx="132" cy="18" r="2.5" fill="currentColor" />
    </svg>
  );
}

function ContinueArrow() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-royal transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true">
      <path d="M3 10 H16 M11 5 L16 10 L11 15" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------------------- TOC sidebar nav ---------------------------- */

type TocSection = { id: string; title: string; paragraphs: string[] };

function TocNav({ sections, activeId }: { sections: TocSection[]; activeId: string }) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [indicator, setIndicator] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });

  // Use layout effect on the client so the bar lines up before paint.
  const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsoLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const el = itemRefs.current[activeId];
      if (!list || !el) {
        setIndicator((s) => ({ ...s, visible: false }));
        return;
      }
      const listRect = list.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({
        top: elRect.top - listRect.top,
        height: elRect.height,
        visible: true,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    Object.values(itemRefs.current).forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeId, sections.length]);

  return (
    <nav aria-label="In this article" className="print:hidden">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal">
        In this article
      </p>
      <ul
        ref={listRef}
        className="relative mt-4 space-y-1 border-l border-rule/70 pl-0"
      >
        {/* Sliding indicator bar — single element that eases between items */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 -ml-px w-[2px] rounded-full bg-royal"
          style={{
            transform: `translateY(${indicator.top}px)`,
            height: `${indicator.height}px`,
            opacity: indicator.visible ? 1 : 0,
            transition:
              "transform 450ms cubic-bezier(0.22, 1, 0.36, 1), height 450ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease-out",
          }}
        />
        {sections.map((sec) => {
          const isActive = activeId === sec.id;
          return (
            <li
              key={sec.id}
              ref={(node) => {
                itemRefs.current[sec.id] = node;
              }}
              className="relative"
            >
              <a
                href={`#${sec.id}`}
                aria-current={isActive ? "location" : undefined}
                className="block py-1.5 pl-4 text-[13.5px] leading-[1.5]"
                style={{
                  color: isActive ? "var(--tw-prose-royal, oklch(0.48 0.18 262))" : undefined,
                  transform: isActive ? "translateX(2px)" : "translateX(0)",
                  fontWeight: isActive ? 500 : 400,
                  transition:
                    "color 350ms ease-out, transform 450ms cubic-bezier(0.22, 1, 0.36, 1), font-weight 200ms ease-out",
                }}
              >
                <span
                  className={
                    isActive
                      ? "text-royal"
                      : "text-ink/65 transition-colors duration-300 hover:text-royal"
                  }
                >
                  {sec.title}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------- Print --------------------------------- */

function PrintStyles() {
  // Print-optimized stylesheet: hide chrome (header, sidebar, progress, CTAs),
  // restack content to a single column, swap to serif body text at a
  // print-friendly size, and force light backgrounds + black ink.
  return (
    <style>{`
      @media print {
        @page { margin: 18mm 16mm; size: auto; }
        html, body { background: #fff !important; color: #000 !important; }
        header[class*="SiteHeader"], nav[aria-label="In this article"],
        aside[aria-label="On the Roadmap"] { }
        /* Hide site chrome and interactive bits */
        body > header, .site-header, [data-site-header] { display: none !important; }
        /* Hide everything explicitly marked print:hidden via Tailwind */
        .print\\:hidden { display: none !important; }
        /* Sidebar + related-content footer hidden for print */
        article > div > div > aside { display: none !important; }
        article > section[aria-labelledby="continue-heading"] { display: none !important; }
        /* Collapse the body grid to a single column */
        article > div > div { display: block !important; }
        article > div > div > div { max-width: 100% !important; }
        /* Typography */
        body, article, article p, article li, article blockquote {
          font-family: Georgia, "Times New Roman", Times, serif !important;
          color: #000 !important;
        }
        article h1 { font-size: 24pt !important; line-height: 1.15 !important; }
        article h2 { font-size: 15pt !important; line-height: 1.25 !important; margin-top: 18pt !important; }
        article h3 { font-size: 13pt !important; }
        article p, article li { font-size: 11pt !important; line-height: 1.55 !important; color: #111 !important; }
        article blockquote { font-style: italic; border-left: 2pt solid #333; padding-left: 10pt; }
        /* Avoid awkward breaks */
        article h1, article h2, article h3 { break-after: avoid; page-break-after: avoid; }
        article p, article li, article blockquote, article figure { break-inside: avoid; page-break-inside: avoid; }
        /* Strip decorative cards/backgrounds */
        article [class*="rounded-xl"] {
          background: transparent !important;
          border: 1px solid #ccc !important;
          box-shadow: none !important;
        }
        /* Expand URLs after links (optional, classic print convention) */
        article a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #444; }
      }
    `}</style>
  );
}

/* --------------------------------- Page --------------------------------- */

function InsightArticlePage() {
  const { insight } = Route.useLoaderData();

  const related: Insight[] = [...INSIGHTS]
    .filter((i) => i.slug !== insight.slug)
    .sort((a, b) => {
      const sameA = a.category === insight.category ? 0 : 1;
      const sameB = b.category === insight.category ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      return b.publishedAt.localeCompare(a.publishedAt);
    })
    .slice(0, 3);

  const sections =
    insight.sections ??
    insight.body.map((p: string, i: number) => ({
      id: `section-${i + 1}`,
      title: `Section ${i + 1}`,
      paragraphs: [p],
    }));

  const sectionIds = sections.map((s: { id: string }) => s.id);
  const activeId = useActiveSection(sectionIds);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="min-h-screen bg-paper" id="article-root">
      <PrintStyles />
      <ReadingProgressBar />
      <SiteHeader />
      <main>
        <article aria-labelledby="article-title">
          {/* -------- Back link + title block -------- */}
          <header className="pt-24 sm:pt-28 lg:pt-32 print:pt-0">
            <div className={container}>
              <div className="flex items-center justify-between gap-4">
                <Link
                  to="/insights"
                  className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-royal hover:text-royal/80 print:hidden"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  All insights
                </Link>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/70 transition-colors hover:border-royal/40 hover:text-royal print:hidden"
                  aria-label="Print this article"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  Print
                </button>
              </div>

              <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-9 lg:col-start-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-royal">
                    {insight.category}
                  </p>
                  <h1
                    id="article-title"
                    className="mt-5 font-display text-[34px] font-normal leading-[1.08] tracking-[-0.02em] text-ink sm:text-[48px] lg:text-[56px]"
                  >
                    {insight.title}
                  </h1>
                  <p className="mt-7 max-w-[58ch] text-[16px] leading-[1.7] text-ink/65">
                    {insight.blurb}
                  </p>

                  {/* Author + meta row */}
                  <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/5 ring-1 ring-ink/10">
                      <img
                        src={taiPortrait.url}
                        alt="Tai Shobajo"
                        className="h-full w-full object-cover"
                        loading="eager"
                      />
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/60">
                      By Tai Shobajo
                    </span>
                    <span className="text-ink/30" aria-hidden="true">·</span>
                    <time
                      dateTime={insight.publishedAt}
                      className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/55"
                    >
                      {insight.date}
                    </time>
                    <span className="text-ink/30" aria-hidden="true">·</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/55">
                      {insight.read}
                    </span>
                  </div>
                </div>
              </div>

              <DashedSeparator />
            </div>
          </header>

          {/* -------- Two-column body + sidebar -------- */}
          <div className={`${container} pb-16 sm:pb-20`}>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
              {/* Body */}
              <div className="lg:col-span-7 lg:col-start-2">
                {sections.map((sec: { id: string; title: string; paragraphs: string[] }, idx: number) => (
                  <section
                    key={sec.id}
                    id={sec.id}
                    aria-labelledby={`${sec.id}-h`}
                    className={idx === 0 ? "" : "mt-12"}
                  >
                    <h2
                      id={`${sec.id}-h`}
                      className="font-display text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-ink sm:text-[26px]"
                    >
                      {sec.title}
                    </h2>
                    {sec.paragraphs.map((p: string, i: number) => (
                      <p
                        key={i}
                        className="mt-4 text-[15.5px] leading-[1.75] text-ink/75"
                      >
                        {p}
                      </p>
                    ))}

                    {/* Pull quote after "The reframe" */}
                    {sec.id === "the-reframe" && insight.pullQuote && (
                      <figure className="mt-10 flex gap-5">
                        <PullQuoteMark />
                        <blockquote className="font-display text-[22px] font-normal leading-[1.35] tracking-[-0.01em] text-ink sm:text-[26px]">
                          {insight.pullQuote!.map((line: string, i: number) => (
                            <p key={i}>{line}</p>
                          ))}
                        </blockquote>
                      </figure>
                    )}

                    {/* Framework card under "The framework" */}
                    {sec.id === "the-framework" && insight.framework && (
                      <div className="mt-6 rounded-xl border border-ink/12 bg-paper/60 p-6 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-7">
                        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal">
                          {insight.framework.eyebrow}
                        </p>
                        <h3 className="mt-3 font-display text-[22px] font-normal leading-[1.2] tracking-[-0.01em] text-ink">
                          {insight.framework.title}
                        </h3>
                        {insight.framework!.description.map((p: string, i: number) => (
                          <p key={i} className="mt-3 text-[14px] leading-[1.7] text-ink/65">
                            {p}
                          </p>
                        ))}
                        <FrameworkTimeline steps={insight.framework.steps} />
                      </div>
                    )}

                    {/* Roadmap CTA strip under "On the Roadmap" */}
                    {sec.id === "on-the-roadmap" && insight.onRoadmap && (
                      <aside
                        aria-label="On the Roadmap"
                        className="mt-6 overflow-hidden rounded-xl border border-royal/15 bg-[oklch(0.97_0.02_262)] p-6 sm:p-7"
                      >
                        <div className="grid grid-cols-[80px_1fr] gap-5 sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-7">
                          <div className="h-[88px] w-full sm:h-[110px]">
                            <RoadmapDottedPath />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal">
                              On the Roadmap
                            </p>
                            {insight.onRoadmap!.map((p: string, i: number) => (
                              <p key={i} className="mt-2 text-[14px] leading-[1.7] text-ink/70">
                                {p}
                              </p>
                            ))}
                          </div>
                          <Link
                            to="/"
                            hash="cta"
                            className="col-span-2 inline-flex items-center gap-2 text-[13px] font-medium text-royal sm:col-span-1 sm:justify-self-end"
                          >
                            Map this for your business
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </aside>
                    )}
                  </section>
                ))}
              </div>

              {/* Sidebar */}
              <aside className="lg:col-span-4 lg:col-start-9">
                <div className="lg:sticky lg:top-28">
                  <TocNav
                    sections={sections}
                    activeId={activeId}
                  />

                  <hr className="my-8 border-rule/70" />

                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal">
                      Category
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2">
                      <CategoryGlyph />
                      <span className="text-[13.5px] text-ink/80">{insight.category}</span>
                    </div>
                  </div>

                  <div className="mt-10 rounded-xl border border-ink/10 bg-[oklch(0.97_0.012_70)] p-6">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal">
                      About the Author
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/5 ring-1 ring-ink/10">
                        <img
                          src={taiPortrait.url}
                          alt="Tai Shobajo"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </span>
                      <p className="text-[14px] font-medium text-ink">Tai Shobajo, Trust Tai</p>
                    </div>
                    <p className="mt-4 text-[13px] leading-[1.7] text-ink/65">
                      Tai helps founder-led businesses turn scattered digital work into clear
                      operating systems.
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.7] text-ink/65">
                      The system behind the system.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          {/* -------- Footer: CTA + Continue reading -------- */}
          <section
            className="border-t border-rule/70"
            aria-labelledby="continue-heading"
          >
            <div className={`${container} grid grid-cols-1 gap-12 py-16 sm:py-20 lg:grid-cols-12 lg:gap-14`}>
              <div className="lg:col-span-5 lg:col-start-1">
                <div className="rounded-xl bg-[oklch(0.96_0.012_70)] px-8 py-10 text-center">
                  <p className="mx-auto max-w-[34ch] font-display text-[19px] leading-[1.35] text-ink">
                    If this named something you have been carrying, the Roadmap is where we map it.
                  </p>
                  <Link
                    to="/build-my-roadmap"
                    className="group mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-medium text-paper transition-all duration-300 ease-out hover:-translate-y-[1px]"
                  >
                    Build My Roadmap
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7 lg:col-start-6">
                <h2
                  id="continue-heading"
                  className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-royal"
                >
                  Continue reading
                </h2>
                <ul className="mt-6 divide-y divide-rule/70 border-l border-rule/70">
                  {related.map((r) => (
                    <li key={r.slug} className="group relative">
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-7 -ml-[5px] block h-2 w-2 rounded-full bg-royal"
                      />
                      <Link
                        to="/insights/$slug"
                        params={{ slug: r.slug }}
                        className="flex items-start gap-5 py-5 pl-6 pr-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/55">
                            {r.category}
                          </p>
                          <p className="mt-2 font-display text-[17px] leading-[1.35] tracking-[-0.005em] text-ink transition-colors group-hover:text-royal">
                            {r.title}
                          </p>
                        </div>
                        <span className="mt-2 shrink-0">
                          <ContinueArrow />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </article>
      </main>
      <SiteClosing
        headline={<>Every piece here is <Accent>a truth we have walked with a founder</Accent>.</>}
        supporting={<>If reading them made you want the version mapped for your business, that is where the Roadmap begins.</>}
      />
    </div>
  );
}

function NotFoundInsight() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className={`${container} pt-40 pb-24 text-center`}>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-royal">404</p>
        <h1 className="mt-4 font-display text-[36px] leading-tight text-ink">That insight is not here.</h1>
        <p className="mt-4 text-ink/60">The piece you were looking for has moved or never existed.</p>
        <Link to="/insights" className="mt-8 inline-flex items-center gap-2 text-royal">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to all insights
        </Link>
      </main>
    </div>
  );
}

function ErrorInsight({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className={`${container} pt-40 pb-24 text-center`}>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-royal">
          <Compass className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Something went wrong
        </p>
        <h1 className="mt-4 font-display text-[32px] text-ink">We could not load that insight.</h1>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-medium text-paper"
        >
          Try again
        </button>
      </main>
    </div>
  );
}
