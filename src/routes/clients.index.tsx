import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { listedRoadmaps } from "@/lib/client-roadmaps/registry";
import { trackCta } from "@/lib/website-intake/track";

const CANONICAL = "https://trusttai.com/clients";
const TITLE = "Client Roadmaps | Trust Tai";
const DESCRIPTION =
  "Real roadmaps we have built for founder-led businesses. See the route each client is walking, milestone by milestone.";

export const Route = createFileRoute("/clients/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Client Roadmaps" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { property: "og:site_name", content: "Trust Tai" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Client Roadmaps" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        id: "jsonld-client-roadmaps",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Trust Tai client roadmaps",
          itemListElement: listedRoadmaps().map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${r.client} ${r.headline}`,
            url: `https://trusttai.com/clients/${r.slug}`,
          })),
        }),
      },
    ],
  }),
  component: ClientRoadmapsGallery,
});

function ClientRoadmapsGallery() {
  const roadmaps = listedRoadmaps();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Client roadmaps
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight tracking-tight sm:text-5xl">
          The routes we have mapped
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Every roadmap below was built for a specific business: where they are
          now, where they are going, and the order of the work between. Read one
          and you will see how we think.
        </p>

        <ul className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {roadmaps.map((r) => (
            <li key={r.slug}>
              <Link
                to="/clients/$slug"
                params={{ slug: r.slug }}
                onClick={() => trackCta("roadmap_gallery_card", r.slug)}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-paper-soft">
                  <img
                    src={r.cover}
                    alt={r.coverAlt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {r.headline}
                  </p>
                  <h2 className="text-xl leading-snug tracking-tight">{r.client}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {r.summary}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-3 text-sm text-royal">
                    View the roadmap
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-20 rounded-2xl border border-border bg-card p-8 sm:p-10">
          <h2 className="text-2xl tracking-tight sm:text-3xl">
            Want a roadmap like these?
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Tell us where your business is now. We will map the route and send it
            back to you.
          </p>
          <Link
            to="/build-my-roadmap"
            onClick={() => trackCta("gallery_build_your_roadmap", "/build-my-roadmap")}
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm text-paper"
          >
            Build Your Roadmap
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
