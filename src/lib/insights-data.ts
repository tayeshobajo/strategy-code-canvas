export type InsightCategory =
  | "Systems"
  | "The Founder Trap"
  | "The Intelligence Layer"
  | "Operational Debt"
  | "Spirit First"
  | "Field Notes";

export const CATEGORIES = [
  "All",
  "Systems",
  "The Founder Trap",
  "The Intelligence Layer",
  "Operational Debt",
  "Spirit First",
  "Field Notes",
] as const;

export type TabCategory = (typeof CATEGORIES)[number];

export type Insight = {
  slug: string;
  category: InsightCategory;
  title: string;
  blurb: string;
  read: string;
  readMinutes: number;
  date: string;
  publishedAt: string; // ISO
  body: string[]; // paragraphs
};

const BASE: Insight[] = [
  {
    slug: "founder-trap-day-your-business-stopped-scaling",
    category: "The Founder Trap",
    title:
      "The day your business stopped scaling was the day it started depending on you.",
    blurb:
      "Founder dependency is not always loud. Sometimes it looks like being helpful until the whole business starts waiting on you.",
    read: "6 min read",
    readMinutes: 6,
    date: "January 2026",
    publishedAt: "2026-01-12",
    body: [
      "Growth does not slow down because the founder cares too much. It slows down when the business cannot move without the founder touching every decision.",
      "The first sign is rarely a number on a dashboard. It is a quiet pause. A team that has the skill to act, the context to choose, and still waits. They wait because the system has taught them that the safest decision is your decision.",
      "The fix is not to step back faster. The fix is to name the decisions the business has been making through you, write them down, and give them somewhere to live that is not your inbox.",
      "Leverage is not the opposite of care. It is the proof of it.",
    ],
  },
  {
    slug: "sequence-problem-not-growth-problem",
    category: "Systems",
    title:
      "Most businesses do not have a growth problem. They have a sequence problem.",
    blurb: "The right work done in the wrong order still creates drag.",
    read: "5 min read",
    readMinutes: 5,
    date: "January 2026",
    publishedAt: "2026-01-08",
    body: [
      "When a business stalls, the instinct is to add. Add a hire, add a tool, add a channel. The problem is rarely the absence of work. It is the order of it.",
      "Sequence is the difference between a build that compounds and a build that drags. The same five moves, played in two orders, produce two different businesses.",
      "Before you add, name the next correct move. Then the one after. Then ask whether you are doing them in that order.",
    ],
  },
  {
    slug: "ai-will-not-save-an-unbuilt-system",
    category: "The Intelligence Layer",
    title:
      "AI will not save a business that has not built the system underneath it.",
    blurb:
      "Automation only compounds what already exists. If the system is unclear, AI makes the confusion faster.",
    read: "7 min read",
    readMinutes: 7,
    date: "January 2026",
    publishedAt: "2026-01-05",
    body: [
      "A model is a multiplier. Multiply clarity and you get leverage. Multiply confusion and you get the same confusion at a higher rate.",
      "The businesses winning with AI are not the ones with the best prompts. They are the ones who already had crisp inputs, named decisions, and a place for the output to land.",
      "Build the system first. Then let the intelligence layer do what it does well.",
    ],
  },
  {
    slug: "busy-season-exposes-operational-debt",
    category: "Operational Debt",
    title:
      "Busy season does not break businesses. It exposes the debt they were already carrying.",
    blurb:
      "Pressure reveals the hidden cost of unclear roles, missing systems, and decisions that were never named.",
    read: "6 min read",
    readMinutes: 6,
    date: "January 2026",
    publishedAt: "2026-01-02",
    body: [
      "The cracks are not new. They were already there, kept quiet by slack in the calendar. Volume removes the slack.",
      "The work is not to survive the season. The work is to keep notes during it. Every fire is a map of a system that was never built.",
    ],
  },
  {
    slug: "spirit-first-run-it-without-us",
    category: "Spirit First",
    title: "We measure a build by whether you could run it without us.",
    blurb:
      "The real standard is not whether the work looks good when we touch it. It is whether it still works when we step away.",
    read: "4 min read",
    readMinutes: 4,
    date: "January 2026",
    publishedAt: "2025-12-28",
    body: [
      "A build that needs us to keep running is not a build. It is a dependency dressed as a deliverable.",
      "We design every system to outlive our involvement. If it cannot, we have not finished.",
    ],
  },
  {
    slug: "digital-footprint-before-2027",
    category: "Field Notes",
    title:
      "What every founder-led practice needs in its digital footprint before 2027.",
    blurb:
      "The businesses that will compete well next year are already making their systems visible this year.",
    read: "8 min read",
    readMinutes: 8,
    date: "January 2026",
    publishedAt: "2025-12-22",
    body: [
      "A digital footprint is not a website. It is the part of your system that the world can see, search, and trust without speaking to you first.",
      "Before 2027, three things will separate the practices that grow from the ones that plateau: visible point of view, searchable proof of work, and a path that lets a stranger become a client without a meeting.",
    ],
  },
];

// Pad the list out so infinite scroll has something to chew on while keeping
// content honest. Variants reuse the same canonical writing with a fresh slug.
const VARIANTS = [
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
];

export const INSIGHTS: Insight[] = [
  ...BASE,
  ...VARIANTS.flatMap((suffix, vi) =>
    BASE.map((b, bi) => ({
      ...b,
      slug: `${b.slug}-${suffix}`,
      publishedAt: shiftDate(b.publishedAt, -(vi + 1) * 14 - bi),
      date: monthYear(shiftDate(b.publishedAt, -(vi + 1) * 14 - bi)),
    })),
  ),
];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthYear(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function getInsightBySlug(slug: string): Insight | undefined {
  return INSIGHTS.find((i) => i.slug === slug);
}

export type SortKey = "newest" | "oldest" | "shortest" | "longest";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "shortest", label: "Shortest read" },
  { key: "longest", label: "Longest read" },
];
