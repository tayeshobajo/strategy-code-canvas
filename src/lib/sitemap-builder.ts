import { INSIGHTS } from "@/lib/insights-data";
import { getPublicSiteUrl } from "@/lib/site-url";

export interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const WALK_SLUGS = [
  "leadership-education",
  "private-milestone-build",
  "financial-advisory-firm",
  "founder-led-business",
  "health-and-wellness",
  "e-commerce-brand",
];

export const SITE_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/what-we-build", changefreq: "monthly", priority: "0.8" },
  { path: "/investment", changefreq: "monthly", priority: "0.8" },
  { path: "/walks", changefreq: "monthly", priority: "0.8" },
  { path: "/insights", changefreq: "weekly", priority: "0.8" },
  { path: "/build-my-roadmap", changefreq: "monthly", priority: "0.9" },
  ...INSIGHTS.map((i) => ({
    path: `/insights/${i.slug}`,
    changefreq: "monthly" as const,
    priority: "0.6",
  })),
  ...WALK_SLUGS.map((slug) => ({
    path: `/walks/${slug}`,
    changefreq: "monthly" as const,
    priority: "0.6",
  })),
];

export function buildSitemapXml(
  entries: SitemapEntry[] = SITE_ENTRIES,
  baseUrl: string = getPublicSiteUrl(),
): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${baseUrl}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}
