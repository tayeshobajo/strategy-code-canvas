import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal } from "@/hooks/use-reveal";
import { INSIGHTS, getInsightBySlug } from "@/lib/insights-data";

export const Route = createFileRoute("/insights_/$slug")({
  loader: ({ params }) => {
    const insight = getInsightBySlug(params.slug);
    if (!insight) throw notFound();
    return { insight };
  },
  head: ({ params, loaderData }) => {
    const insight = loaderData?.insight;
    if (!insight) {
      return {
        meta: [{ title: "Insight not found | Trust Tai" }],
      };
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
      author: { "@type": "Organization", name: "Trust Tai" },
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
      scripts: [{ type: "application/ld+json", children: JSON.stringify(ld) }],
    };
  },
  notFoundComponent: NotFoundInsight,
  errorComponent: ErrorInsight,
  component: InsightArticlePage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

function AccentRule() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 16"
      className="h-3 w-[260px]"
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        y1="8"
        x2="280"
        y2="8"
        stroke="oklch(0.48 0.18 262 / 0.55)"
        strokeWidth="1"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <circle cx="290" cy="8" r="3" fill="oklch(0.48 0.18 262)" />
      <path
        d="M 296 8 L 312 4 L 305 8 L 312 12 Z"
        fill="oklch(0.48 0.18 262)"
      />
    </svg>
  );
}

function ChapterMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 80 20" className="mt-10 h-4 w-20 text-royal/60">
      <circle cx="10" cy="10" r="2" fill="currentColor" />
      <line x1="18" y1="10" x2="70" y2="10" stroke="currentColor" strokeWidth="1" strokeDasharray="2 5" />
    </svg>
  );
}

function InsightArticlePage() {
  const { insight } = Route.useLoaderData();

  // Related: same category first, then by recency, excluding current.
  const related = [...INSIGHTS]
    .filter((i) => i.slug !== insight.slug)
    .sort((a, b) => {
      const sameA = a.category === insight.category ? 0 : 1;
      const sameB = b.category === insight.category ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      return b.publishedAt.localeCompare(a.publishedAt);
    })
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <article aria-labelledby="article-title">
          <header className="relative overflow-hidden pt-28 sm:pt-32 lg:pt-36">
            <div className={`${container} relative`}>
              <Reveal as="div" variant="fade-up" className="mx-auto max-w-[780px]">
                <Link
                  to="/insights"
                  className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink/55 hover:text-royal"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  All insights
                </Link>
                <p className="eyebrow mt-8">{insight.category}</p>
                <h1
                  id="article-title"
                  className="mt-5 font-display text-[34px] font-normal leading-[1.08] tracking-[-0.02em] text-ink sm:text-[48px] lg:text-[58px]"
                >
                  {insight.title}
                </h1>
                <p className="mt-6 max-w-[60ch] text-[15px] leading-[1.7] text-ink/65">
                  {insight.blurb}
                </p>
                <div className="mt-8 flex items-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/45">
                  <time dateTime={insight.publishedAt}>{insight.date}</time>
                  <span aria-hidden="true">·</span>
                  <span>{insight.read}</span>
                </div>
                <div className="mt-8"><AccentRule /></div>
              </Reveal>
            </div>
          </header>

          <div className={`${container} pb-20 pt-12 sm:pt-16`}>
            <Reveal as="div" variant="fade-up" delay={80} className="mx-auto max-w-[680px]">
              {insight.body.map((p: string, i: number) => (
                <p
                  key={i}
                  className={`text-[16px] leading-[1.75] text-ink/80 ${
                    i === 0 ? "first-letter:font-display first-letter:text-[44px] first-letter:font-medium first-letter:leading-none first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:text-royal" : "mt-6"
                  }`}
                >
                  {p}
                </p>
              ))}
              <ChapterMark />
              <p className="mt-6 font-display text-[20px] italic leading-[1.45] text-ink/75">
                If this position matches a question you have been carrying, the Roadmap is the version mapped for your business.
              </p>
              <div className="mt-10">
                <Link
                  to="/"
                  hash="cta"
                  className="group inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-medium text-paper transition-all duration-300 ease-out hover:-translate-y-[1px]"
                >
                  Build My Roadmap
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>

          {related.length > 0 && (
            <section className="border-t border-rule/70" aria-labelledby="related-heading">
              <div className={`${container} py-16 sm:py-20`}>
                <h2 id="related-heading" className="eyebrow">More insights</h2>
                <ul className="mt-8 divide-y divide-rule/70">
                  {related.map((r) => (
                    <li key={r.slug} className="group">
                      <Link
                        to="/insights/$slug"
                        params={{ slug: r.slug }}
                        className="grid grid-cols-[1fr_24px] items-start gap-4 py-6 sm:grid-cols-[180px_1fr_24px] sm:gap-8"
                      >
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink/55 sm:mt-2">
                          {r.category}
                        </span>
                        <div>
                          <h3 className="font-display text-[20px] font-normal leading-[1.25] tracking-[-0.015em] text-ink transition-colors group-hover:text-royal">
                            {r.title}
                          </h3>
                          <p className="mt-2 text-[13px] leading-[1.6] text-ink/60">{r.blurb}</p>
                        </div>
                        <span className="hidden items-start justify-end pt-2 text-royal sm:flex" aria-hidden="true">
                          <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1">
                            <path d="M3 10 H16 M11 5 L16 10 L11 15" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </article>
      </main>
    </div>
  );
}

function NotFoundInsight() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className={`${container} pt-40 pb-24 text-center`}>
        <p className="eyebrow">404</p>
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
        <p className="eyebrow">Something went wrong</p>
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
