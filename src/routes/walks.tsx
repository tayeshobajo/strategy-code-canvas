import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal, useReveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/walks")({
  head: () => {
    const title = "The Walks | Trust Tai";
    const description =
      "Real businesses. Real routes. Real ground covered. A selection of walks we have taken with founder-led businesses — the milestones built, and where each business stands today.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "/walks" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "/walks" }],
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
  },
];

const FILTERS = ["All", "Foundations", "Growth Engines", "Operating Systems", "Long Walks"] as const;
type Filter = (typeof FILTERS)[number];

/* ------------------------------ HERO ------------------------------ */

function ContourBg() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1240 520"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="walks-contour" cx="70%" cy="40%" r="55%">
          <stop offset="0%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="oklch(0.48 0.18 262)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1240" height="520" fill="url(#walks-contour)" />
      <g
        fill="none"
        stroke="oklch(0.48 0.18 262)"
        strokeOpacity="0.07"
        strokeWidth="0.75"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <ellipse
            key={i}
            cx="880"
            cy="220"
            rx={120 + i * 60}
            ry={70 + i * 38}
            transform={`rotate(-12 880 220)`}
          />
        ))}
      </g>
    </svg>
  );
}

function EngravedMountains() {
  // Hand-authored multi-layer engraved mountain range, navy ink on cream.
  // Composed entirely of stroked SVG paths/lines — no fills, no rasters.
  const navy = "oklch(0.28 0.07 262)";

  // Ridge silhouettes (back to front) — varied peak heights, organic spacing
  const farRidge1 =
    "M 0 200 L 70 188 L 135 195 L 205 168 L 270 178 L 340 152 L 405 165 L 470 138 L 540 152 L 605 122 L 660 132 L 700 124";
  const farRidge2 =
    "M 0 218 L 80 208 L 155 215 L 225 188 L 295 200 L 365 172 L 430 188 L 498 158 L 560 172 L 620 142 L 678 150 L 700 145";
  const midRidge1 =
    "M 120 215 L 168 190 L 205 205 L 248 168 L 290 188 L 335 150 L 378 175 L 425 132 L 472 158 L 518 110 L 562 138 L 608 88 L 652 105 L 700 92";
  const midRidge2 =
    "M 60 232 L 110 215 L 158 225 L 205 195 L 252 215 L 298 180 L 345 200 L 392 162 L 440 188 L 488 142 L 535 168 L 580 118 L 628 138 L 678 108 L 700 118";
  // Foreground massif: dramatic varied peaks, dominant summit at right
  const fgRidge =
    "M 220 250 L 252 232 L 282 218 L 305 228 L 332 205 L 360 222 L 388 192 L 414 215 L 442 178 L 470 198 L 498 158 L 522 180 L 548 138 L 575 160 L 600 118 L 622 102 L 642 85 L 660 72 L 678 92 L 695 80 L 700 86";

  // Per-peak hatching: each entry describes a shaded flank.
  // Strokes are placed perpendicular to (peak -> base) so they follow real slope.
  type Peak = {
    peak: [number, number];
    base: [number, number];
    count: number;
    length: number;
    opacity: number;
    width: number;
    crossHatch?: boolean;
  };
  const peaks: Peak[] = [
    // dominant summit cluster (behind the flag)
    { peak: [660, 72], base: [700, 130], count: 22, length: 16, opacity: 0.7, width: 0.9, crossHatch: true },
    { peak: [642, 85], base: [620, 160], count: 20, length: 14, opacity: 0.62, width: 0.85 },
    { peak: [622, 102], base: [600, 175], count: 18, length: 13, opacity: 0.56, width: 0.8 },
    { peak: [600, 118], base: [578, 188], count: 16, length: 12, opacity: 0.5, width: 0.75, crossHatch: true },
    { peak: [575, 160], base: [555, 215], count: 12, length: 9, opacity: 0.4, width: 0.65 },
    { peak: [548, 138], base: [528, 198], count: 14, length: 11, opacity: 0.46, width: 0.7 },
    { peak: [498, 158], base: [478, 218], count: 12, length: 10, opacity: 0.4, width: 0.65 },
    { peak: [470, 198], base: [455, 240], count: 9, length: 7, opacity: 0.32, width: 0.6 },
    { peak: [442, 178], base: [424, 225], count: 10, length: 8, opacity: 0.36, width: 0.6 },
    { peak: [388, 192], base: [372, 232], count: 8, length: 7, opacity: 0.3, width: 0.55 },
    { peak: [332, 205], base: [318, 240], count: 7, length: 6, opacity: 0.26, width: 0.5 },
    // mid-ridge accent peaks
    { peak: [608, 88], base: [585, 145], count: 12, length: 9, opacity: 0.34, width: 0.55 },
    { peak: [518, 110], base: [498, 162], count: 10, length: 8, opacity: 0.3, width: 0.5 },
    { peak: [425, 132], base: [405, 178], count: 8, length: 7, opacity: 0.26, width: 0.48 },
    { peak: [335, 150], base: [318, 192], count: 7, length: 6, opacity: 0.22, width: 0.45 },
  ];

  function hatch(p: Peak): React.ReactElement[] {
    const [px0, py0] = p.peak;
    const [bx, by] = p.base;
    const dx = bx - px0;
    const dy = by - py0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const out: React.ReactElement[] = [];
    for (let i = 0; i < p.count; i++) {
      const t = 0.08 + (i / Math.max(1, p.count - 1)) * 0.92;
      const cx = px0 + dx * t;
      const cy = py0 + dy * t;
      const falloff = 0.38 + 0.62 * t;
      const jitter = (((i * 53) % 7) / 7 - 0.5) * 0.8;
      const l = p.length * falloff + jitter;
      out.push(
        <line
          key={`h-${i}`}
          x1={cx}
          y1={cy}
          x2={cx + nx * l}
          y2={cy + ny * l}
        />,
      );
    }
    return out;
  }

  function cross(p: Peak): React.ReactElement[] {
    const [px0, py0] = p.peak;
    const [bx, by] = p.base;
    const dx = bx - px0;
    const dy = by - py0;
    const len = Math.hypot(dx, dy) || 1;
    // opposite perpendicular for the cross stroke
    const nx = dy / len;
    const ny = -dx / len;
    const n = Math.max(3, Math.floor(p.count * 0.45));
    const out: React.ReactElement[] = [];
    for (let i = 0; i < n; i++) {
      const t = 0.35 + (i / Math.max(1, n - 1)) * 0.55;
      const cx = px0 + dx * t;
      const cy = py0 + dy * t;
      const l = p.length * 0.55;
      out.push(
        <line
          key={`x-${i}`}
          x1={cx}
          y1={cy}
          x2={cx + nx * l}
          y2={cy + ny * l}
        />,
      );
    }
    return out;
  }

  return (
    <g
      aria-hidden="true"
      fill="none"
      stroke={navy}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Atmospheric haze — distant ridges */}
      <g strokeOpacity="0.22" strokeWidth="0.9">
        <path d={farRidge1} />
        <path d={farRidge2} />
      </g>

      {/* Mid ridges */}
      <path d={midRidge1} strokeOpacity="0.34" strokeWidth="1.0" />
      <path d={midRidge2} strokeOpacity="0.42" strokeWidth="1.1" />

      {/* Foreground massif silhouette */}
      <path d={fgRidge} strokeOpacity="0.62" strokeWidth="1.35" />

      {/* Engraved hatching — bespoke per peak */}
      {peaks.map((p, i) => (
        <g key={i} strokeOpacity={p.opacity} strokeWidth={p.width}>
          {hatch(p)}
          {p.crossHatch && cross(p)}
        </g>
      ))}

      {/* Snow-line contour hairlines wrapping the summit peak */}
      <g strokeOpacity="0.28" strokeWidth="0.55">
        <path d="M 648 84 Q 664 78 682 90" />
        <path d="M 638 98 Q 662 92 690 104" />
        <path d="M 624 116 Q 656 108 694 120" />
        <path d="M 606 138 Q 644 128 696 140" />
      </g>

      {/* Secondary snow-line accents on the mid-right peaks */}
      <g strokeOpacity="0.22" strokeWidth="0.5">
        <path d="M 558 144 Q 574 140 592 152" />
        <path d="M 548 160 Q 572 154 596 168" />
        <path d="M 504 166 Q 520 162 538 172" />
      </g>
    </g>
  );
}

function SummitFlag({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const h = 16 * scale;
  const w = 9 * scale;
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - h}
        stroke="var(--royal)"
        strokeWidth={1.4 * scale}
        strokeLinecap="round"
      />
      <path
        d={`M ${x} ${y - h} L ${x + w} ${y - h + 3 * scale} L ${x} ${y - h + 6 * scale} Z`}
        fill="var(--royal)"
      />
    </g>
  );
}

function HeroRoute({ inView }: { inView: boolean }) {
  // Ascending dotted route with milestone open-circles ending at a summit flag.
  const points: [number, number][] = [
    [40, 220],
    [200, 200],
    [340, 158],
    [440, 138],
    [560, 88],
    [660, 48],
  ];
  const d = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(" ");
  const last = points[points.length - 1];
  const milestoneCount = points.length - 1;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 700 260"
      className="h-full w-full"
    >
      <EngravedMountains />

      <defs>
        <mask id="walks-hero-reveal" maskUnits="userSpaceOnUse">
          <rect width="700" height="260" fill="black" />
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={inView ? 0 : 1}
            style={{
              transition: "stroke-dashoffset 2200ms cubic-bezier(0.42, 0, 0.2, 1)",
            }}
          />
        </mask>
      </defs>

      <g mask="url(#walks-hero-reveal)">
        <path
          d={d}
          fill="none"
          stroke="var(--royal)"
          strokeWidth="1.4"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      </g>

      {points.slice(1, -1).map(([x, y], i) => {
        const t = (i + 1) / milestoneCount;
        const delay = 200 + t * 1800;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={5}
            fill="white"
            stroke="var(--royal)"
            strokeWidth="1.5"
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 380ms ease-out ${delay}ms`,
            }}
          />
        );
      })}

      <g
        style={{
          opacity: inView ? 1 : 0,
          transition: "opacity 420ms ease-out 2100ms",
        }}
      >
        <circle cx={last[0]} cy={last[1]} r={5} fill="var(--royal)" />
        <SummitFlag x={last[0]} y={last[1] - 2} scale={1.1} />
      </g>
    </svg>
  );
}

function Hero() {
  const { ref: routeRef, inView: routeInView } = useReveal<HTMLDivElement>({
    threshold: 0.35,
    once: true,
    rootMargin: "0px 0px -5% 0px",
  });
  return (
    <section className="relative overflow-hidden bg-paper pt-28 sm:pt-32">
      <ContourBg />
      <div className={`${container} relative`}>
        <div className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-16">
          <div className="flex flex-col">
            <Reveal as="p" variant="fade-up" className="eyebrow">
              The Walks
            </Reveal>
            <Reveal
              as="h1"
              variant="fade-up"
              delay={80}
              className="mt-6 font-display text-[44px] leading-[1.05] tracking-[-0.022em] text-ink sm:text-[56px] lg:text-[64px]"
            >
              Real businesses.<br />
              Real routes.<br />
              Real <em className="italic text-royal">ground</em> covered.
            </Reveal>
            <Reveal
              as="p"
              variant="fade-up"
              delay={160}
              className="mt-7 max-w-[44ch] text-[14px] leading-[1.75] text-ink/65"
            >
              Every walk here started where your business is now: a founder
              carrying weight, a map waiting to be drawn. These are the journeys,
              the milestones we built along them, and where each business
              stands today.
            </Reveal>
            <Reveal
              as="p"
              variant="fade-up"
              delay={220}
              className="mt-5 text-[13px] italic leading-[1.7] text-ink/55"
            >
              A selection. Most of our work stays private.
            </Reveal>
            <Reveal as="div" variant="fade-up" delay={300} className="mt-9">
              <a
                href="#cta"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[13px] font-medium text-paper transition-all duration-300 hover:-translate-y-[1px]"
              >
                Build My Roadmap
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Reveal>
          </div>

          <div className="relative">
            <div ref={routeRef} className="relative aspect-[700/260] w-full">
              <HeroRoute inView={routeInView} />
            </div>
            <Reveal
              as="div"
              variant="fade-up"
              delay={420}
              className="mt-10 flex flex-col items-center text-center"
            >
              <p className="font-display text-[20px] italic text-ink/80 sm:text-[22px]">
                No two walks are the same.
              </p>
              <span className="mt-3 inline-block h-px w-10 bg-ink/40" />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- FILTER ----------------------------- */

function FilterRow({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
}) {
  return (
    <div className={`${container} mt-8`}>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-3 border-b border-rule pb-3 text-[13px]">
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
  // y trends upward (lower number) with small variance — last point is highest.
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
            fontSize="9"
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

function WalkRow({ walk, index }: { walk: Walk; index: number }) {
  return (
    <Reveal
      as="article"
      variant="fade-up"
      delay={index * 60}
      className="border-t border-rule"
    >
      <div
        className={`${container} grid grid-cols-1 gap-6 py-10 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.1fr)_170px] md:gap-8`}
      >
        {/* Left: category */}
        <div>
          <p className="eyebrow leading-tight">{walk.category}</p>
          <p className="mt-1 text-[12.5px] text-ink/55">{walk.subcategory}</p>
        </div>

        {/* Lead stat + journey context */}
        <div>
          <p className="font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[42px]">
            {"{{OUTCOME}}"}
          </p>
          <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
            Verified outcome
          </p>
          <p className="mt-5 max-w-[40ch] text-[12.5px] leading-[1.7] text-ink/65">
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
          <a
            href="#"
            className="group inline-flex items-center gap-1.5 text-[13px] text-ink underline decoration-ink/30 underline-offset-[6px] transition-colors hover:text-royal hover:decoration-royal"
          >
            View walk
          </a>
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
            href="#"
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

/* ----------------------------- FOOTER ----------------------------- */

function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper">
      <div className={`${container} grid grid-cols-1 gap-8 py-10 text-[12.5px] text-ink/65 sm:grid-cols-4`}>
        <div>
          <p className="font-display text-[18px] text-ink">Trust Tai</p>
        </div>
        <ul className="space-y-1.5">
          <li><Link to="/" className="hover:text-ink">The Roadmap</Link></li>
          <li><Link to="/what-we-build" className="hover:text-ink">What We Build</Link></li>
          <li><Link to="/investment" className="hover:text-ink">Investment</Link></li>
          <li><Link to="/about" className="hover:text-ink">About</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link to="/insights" className="hover:text-ink">Insights</Link></li>
          <li><Link to="/walks" className="hover:text-ink">The Walks</Link></li>
        </ul>
        <div className="flex flex-col gap-4 sm:items-end sm:text-right">
          <p>© 2026 Trust Tai. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-ink">Privacy Policy</a>
            <a href="#" className="hover:text-ink">Terms of Service</a>
          </div>
          <p className="text-ink/55">
            We build the map.<br />
            You build what matters.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------ PAGE ------------------------------ */

function WalksPage() {
  const [filter, setFilter] = React.useState<Filter>("All");
  const filterAnchorRef = React.useRef<HTMLDivElement>(null);
  // Track viewport offset of the filter row across renders so we can
  // restore scroll position after a filter change shrinks/grows the list.
  const pendingAnchorTopRef = React.useRef<number | null>(null);

  const filtered = React.useMemo(
    () => (filter === "All" ? WALKS : WALKS.filter((w) => w.bucket === filter)),
    [filter],
  );

  const handleFilterChange = React.useCallback((next: Filter) => {
    if (next === filter) return;
    const node = filterAnchorRef.current;
    pendingAnchorTopRef.current = node ? node.getBoundingClientRect().top : null;
    setFilter(next);
  }, [filter]);

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
          <FilterRow active={filter} onChange={handleFilterChange} />
        </div>
        <section className="mt-2">
          {filtered.map((w, i) => (
            <WalkRow key={w.slug} walk={w} index={i} />
          ))}
          {filtered.length > 0 && <div className="border-t border-rule" />}
        </section>
        <DarkCta />
        <SiteFooter />
      </main>
    </div>
  );
}
