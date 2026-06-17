import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Reveal } from "@/hooks/use-reveal";
import heroArt from "@/assets/trust-tai-walks-hero-composed.svg.asset.json";

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

// Engraved mountain range, hand-authored inline so we control composition
// pixel-for-pixel against the approved mockup. Shares the same viewBox as
// HeroRoute so the blue dotted route climbs across the ridgeline and the
// summit flag lands on the dominant peak.

// Hand-authored engraved mountain range, inlined so the route shares the
// same coordinate system (viewBox 0 185 1440 300) and the dominant summit
// sits at (1320, 208) — the route ends there and owns the flag.
function EngravedMountains() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 185 1440 300"
      preserveAspectRatio="xMidYEnd meet"
      className="h-full w-full text-ink"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* distant range */}
        <g opacity="0.16" strokeWidth="1.1">
          <path d="M118 378 C188 334 238 318 294 323 C354 330 404 289 462 302 C531 318 575 256 644 274 C702 289 748 244 806 264 C873 293 922 220 997 234 C1062 246 1124 198 1195 220 C1270 242 1320 205 1394 230" />
          <path d="M204 353 L281 323 L336 360" />
          <path d="M387 329 L462 302 L520 345" />
          <path d="M592 302 L644 274 L694 318" />
          <path d="M757 294 L806 264 L858 312" />
          <path d="M930 274 L997 234 L1061 296" />
          <path d="M1138 260 L1195 220 L1255 284" />
          <path d="M1288 254 L1344 214 L1394 230" />
        </g>

        {/* middle ridge */}
        <g opacity="0.26" strokeWidth="1.1">
          <path d="M32 410 C128 390 182 364 254 374 C315 382 357 340 426 348 C492 356 536 296 615 318 C686 338 748 278 826 298 C900 316 948 250 1037 270 C1116 288 1171 232 1258 260 C1324 282 1366 258 1430 274" />
          <path d="M162 391 L254 374 L331 420" />
          <path d="M318 381 L426 348 L501 406" />
          <path d="M512 382 L615 318 L702 414" />
          <path d="M724 373 L826 298 L904 398" />
          <path d="M941 347 L1037 270 L1126 394" />
          <path d="M1164 347 L1258 260 L1354 396" />
        </g>

        {/* front range with main summit */}
        <g opacity="0.42" strokeWidth="1.1">
          <path d="M4 438 C86 418 155 402 236 408 C323 415 372 372 448 385 C530 400 586 326 675 347 C753 365 822 316 897 336 C982 359 1027 274 1108 296 C1178 315 1234 176 1320 208 C1376 228 1406 248 1436 262" />
          <path d="M75 431 C160 422 216 414 285 438" />
          <path d="M297 423 L448 385 L548 456" />
          <path d="M485 416 L675 347 L782 468" />
          <path d="M770 414 L897 336 L1015 468" />
          <path d="M990 420 L1108 296 L1210 462" />
          <path d="M1122 432 L1320 208 L1436 262" />
          <path d="M1184 352 L1320 208 L1392 436" />
          <path d="M1244 294 L1320 208 L1358 388" />
        </g>

        {/* etched slope hatching */}
        <g opacity="0.34" strokeWidth="0.85">
          <path d="M334 413 C372 400 405 397 439 385" />
          <path d="M356 428 C397 412 428 405 462 393" />
          <path d="M386 443 C426 426 462 416 500 401" />
          <path d="M422 455 C466 440 501 430 534 416" />
          <path d="M548 409 C590 388 623 371 675 347" />
          <path d="M591 430 C630 410 665 395 708 380" />
          <path d="M633 454 C671 434 705 419 744 398" />
          <path d="M704 455 C737 436 763 420 793 402" />
          <path d="M506 438 C557 424 608 417 662 408" />
          <path d="M472 459 C551 450 626 443 714 430" />
          <path d="M820 392 C856 374 875 356 897 336" />
          <path d="M842 421 C887 398 928 381 974 358" />
          <path d="M883 449 C928 428 974 409 1014 388" />
          <path d="M930 464 C977 441 1028 422 1080 402" />
          <path d="M1006 362 C1048 340 1082 318 1108 296" />
          <path d="M1036 390 C1074 371 1108 353 1144 336" />
          <path d="M1058 427 C1105 402 1144 382 1184 360" />
          <path d="M1094 454 C1134 435 1178 414 1222 392" />
          <path d="M796 451 C858 438 918 430 984 419" />
          <path d="M850 470 C939 456 1022 445 1114 426" />
          <path d="M1132 424 C1180 392 1236 340 1320 208" />
          <path d="M1169 438 C1221 397 1272 326 1320 208" />
          <path d="M1206 451 C1248 409 1288 314 1320 208" />
          <path d="M1242 459 C1278 414 1303 315 1320 208" />
          <path d="M1282 458 C1296 405 1311 305 1320 208" />
          <path d="M1324 233 C1353 288 1374 349 1392 436" />
          <path d="M1340 248 C1370 286 1398 334 1424 396" />
          <path d="M1185 383 C1243 361 1306 342 1378 330" />
          <path d="M1166 414 C1240 394 1322 375 1412 356" />
          <path d="M1146 444 C1234 425 1330 405 1436 386" />
          <path d="M1190 315 C1226 302 1268 292 1308 286" />
          <path d="M1220 278 C1252 270 1286 263 1318 257" />
          <path d="M1252 247 C1274 241 1296 236 1318 231" />
        </g>

        {/* faint ground contour lines */}
        <g opacity="0.14" strokeWidth="0.9">
          <path d="M0 462 C168 448 320 451 486 462 C632 472 780 476 940 462 C1082 449 1230 446 1440 458" />
          <path d="M40 482 C220 468 396 470 548 483 C696 496 836 500 1002 486 C1148 474 1290 473 1418 482" />
          <path d="M142 499 C274 491 420 493 562 502 C692 510 838 512 982 503 C1122 494 1272 493 1394 500" />
          <path d="M190 445 C272 436 358 438 442 448" />
          <path d="M632 448 C736 438 838 438 948 448" />
          <path d="M1048 444 C1154 433 1272 433 1380 444" />
        </g>
      </g>
    </svg>
  );
}

function SummitFlag({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const h = 28 * scale;
  const w = 18 * scale;
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - h}
        stroke="var(--royal)"
        strokeWidth={1.8 * scale}
        strokeLinecap="round"
      />
      <path
        d={`M ${x} ${y - h} L ${x + w} ${y - h + 5 * scale} L ${x} ${y - h + 10 * scale} Z`}
        fill="var(--royal)"
      />
    </g>
  );
}

function HeroRoute({ inView }: { inView: boolean }) {
  // Dotted royal-blue route climbing lower-left -> upper-right across the
  // engraved range. Ends at the dominant summit (1320, 208) where it owns
  // the flag. Shares the mountain SVG's viewBox so points align exactly.
  const points: [number, number][] = [
    [80, 445],
    [275, 418],
    [475, 392],
    [700, 360],
    [915, 325],
    [1130, 278],
    [1320, 208],
  ];
  const d =
    "M80 445 C200 432, 350 425, 475 392 C620 355, 820 360, 915 325 C1040 280, 1200 265, 1320 208";
  const last = points[points.length - 1];
  const milestoneCount = points.length - 1;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 185 1440 300"
      preserveAspectRatio="xMidYEnd meet"
      className="h-full w-full"
    >
      <defs>
        <mask id="walks-hero-reveal" maskUnits="userSpaceOnUse">
          <rect x="0" y="185" width="1440" height="300" fill="black" />
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth="36"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={inView ? 0 : 1}
            style={{
              transition: "stroke-dashoffset 2400ms cubic-bezier(0.42, 0, 0.2, 1)",
            }}
          />
        </mask>
      </defs>

      <g mask="url(#walks-hero-reveal)">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="7 9"
          strokeLinecap="round"
        />
      </g>

      {points.slice(1, -1).map(([x, y], i) => {
        const t = (i + 1) / milestoneCount;
        const delay = 200 + t * 2000;
        const filled = i % 2 === 1;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={filled ? 7 : 6.5}
            fill={filled ? "var(--royal)" : "var(--paper)"}
            stroke="var(--royal)"
            strokeWidth="1.8"
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
          transition: "opacity 420ms ease-out 2300ms",
        }}
      >
        <circle cx={last[0]} cy={last[1]} r={7} fill="var(--royal)" />
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
      <div className={`${container} relative`}>
        <div className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-16">
          <div className="relative z-10 flex flex-col">
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

          <div
            ref={routeRef}
            className="relative min-h-[460px] w-full overflow-hidden"
          >
            {/* Engraved mountain layer — inline SVG */}
            <div className="pointer-events-none absolute inset-0 z-[1]">
              <EngravedMountains />
            </div>
            {/* Blue route layer — climbs across the ridgeline */}
            <div className="pointer-events-none absolute inset-0 z-[2] text-royal">
              <HeroRoute inView={routeInView} />
            </div>
            {/* Thesis line — sits beneath the route, above the mountain base */}
            <Reveal
              as="div"
              variant="fade-up"
              delay={420}
              className="absolute bottom-[82px] left-[42%] z-[3] hidden flex-col items-center text-center lg:flex"
            >
              <p className="font-display text-[20px] italic text-ink">
                No two walks are the same.
              </p>
              <span className="mt-3 inline-block h-px w-10 bg-ink/40" />
            </Reveal>
          </div>
        </div>


        {/* Mobile thesis line — stacked under the simplified landscape */}
        <Reveal
          as="div"
          variant="fade-up"
          delay={420}
          className="mb-10 flex flex-col items-center text-center lg:hidden"
        >
          <p className="font-display text-[20px] italic text-ink/80">
            No two walks are the same.
          </p>
          <span className="mt-3 inline-block h-px w-10 bg-ink/40" />
        </Reveal>
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
