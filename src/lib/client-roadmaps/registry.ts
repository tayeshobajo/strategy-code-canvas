/**
 * Single source of truth for every Trust Tai client roadmap deck.
 *
 * Public fields only. Who may see a roadmap inside the portal lives in the
 * database (`client_roadmap_access`) and is never read from the browser.
 */

import heroSpartan from "@/assets/clients/spartan/hero-spartan-officer.png.asset.json";
import rollickDealership from "@/assets/clients/rollick/rollick-dealership.jpg.asset.json";
import epayTeam from "@/assets/clients/epay/epay-team-booth-2.png.asset.json";
import pttTeams from "@/assets/clients/pttanywhere/ptt-teams.jpg.asset.json";
import shugarHero from "@/assets/clients/shugashack/shugar-hero.jpg.asset.json";

export type ClientRoadmap = {
  /** URL segment under /clients. */
  slug: string;
  client: string;
  headline: string;
  summary: string;
  cover: string;
  coverAlt: string;
  publishedAt: string;
  /** Unlisted roadmaps stay out of the gallery and the sitemap. */
  listed: boolean;
};

export const CLIENT_ROADMAPS: ClientRoadmap[] = [
  {
    slug: "spartan",
    client: "Spartan Security Services",
    headline: "Growth roadmap",
    summary:
      "Be found first, earn the trust, win the work. A sequenced route from search visibility to recurring contracts.",
    cover: heroSpartan.url,
    coverAlt: "Spartan Security Services roadmap cover",
    publishedAt: "2026-06-01",
    listed: true,
  },
  {
    slug: "rollick",
    client: "Rollick",
    headline: "Revenue intelligence roadmap",
    summary:
      "Help OEMs and dealers find Rollick earlier, see where revenue slips, and arrive at demos already informed.",
    cover: rollickDealership.url,
    coverAlt: "Rollick roadmap cover",
    publishedAt: "2026-09-01",
    listed: true,
  },
  {
    slug: "epay",
    client: "ePayPolicy",
    headline: "Payments growth roadmap",
    summary:
      "Turn payment expertise into visible authority, then convert that authority into qualified pipeline.",
    cover: epayTeam.url,
    coverAlt: "ePayPolicy roadmap cover",
    publishedAt: "2026-09-01",
    listed: true,
  },
  {
    slug: "pttanywhere",
    client: "PTT Anywhere",
    headline: "Demand and discovery roadmap",
    summary:
      "A content and discovery engine that puts PTT Anywhere in front of the teams already looking for it.",
    cover: pttTeams.url,
    coverAlt: "PTT Anywhere roadmap cover",
    publishedAt: "2026-09-01",
    listed: true,
  },
  {
    slug: "shugarshack",
    client: "Shugar Shack",
    headline: "Brand and commerce roadmap",
    summary:
      "From brand clarity to a website and checkout that carry the order without the founder in the middle.",
    cover: shugarHero.url,
    coverAlt: "Shugar Shack roadmap cover",
    publishedAt: "2026-09-02",
    listed: true,
  },
];

export function listedRoadmaps(): ClientRoadmap[] {
  return CLIENT_ROADMAPS.filter((r) => r.listed);
}

export function findRoadmap(slug: string): ClientRoadmap | undefined {
  return CLIENT_ROADMAPS.find((r) => r.slug === slug);
}
