import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowLeft,
  Quote,
  Network,
  Monitor,
  BarChart3,
  ClipboardCheck,
  Users,
  Bot,
  Map as MapIcon,
  Workflow,
  Database,
  LayoutGrid,
  Wrench,
  HeartPulse,
  ShoppingBag,
  Headphones,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/hooks/use-reveal";
import heroArt from "@/assets/mountain-1.png.asset.json";
import pointAArt from "@/assets/mountain-3.png.asset.json";
import panoramaArt from "@/assets/mountain-4.png.asset.json";

/* --------------------------- DETAIL DATA --------------------------- */

type RoutePoint = { key: string; title: string; sub?: string };
type Milestone = { title: string; body: string; icon: LucideIcon };
type Stat = { value: string; label: string; icon: LucideIcon };

type WalkDetail = {
  slug: string;
  eyebrow: string;
  headline: React.ReactNode;
  subhead: string;
  route: RoutePoint[];
  pointA: { title: string; body: string[] };
  milestones: Milestone[];
  now: { title: string; body: string[]; asOf: string; stats: Stat[] };
  quote: { text: string; attrib: string; org: string };
  continueWalking: string[]; // slugs
};

const DETAILS: Record<string, WalkDetail> = {
  "leadership-education": {
    slug: "leadership-education",
    eyebrow: "The Walks",
    headline: (
      <>
        From founder dependent to<br />
        a system that <em className="italic text-royal">carries the work.</em>
      </>
    ),
    subhead:
      "The founder had the knowledge, the trust, and the people to serve. The missing piece was a mapped system that could hold the learning journey and move without every step depending on them.",
    route: [
      { key: "A", title: "Point A", sub: "Deep IP,\nno platform" },
      { key: "01", title: "Course\narchitecture" },
      { key: "02", title: "Learning\nplatform" },
      { key: "03", title: "Progress\ntracking" },
      { key: "04", title: "Knowledge\nchecks" },
      { key: "05", title: "Facilitator\ntools" },
      { key: "NOW", title: "Current State", sub: "Live platform,\nactive learners" },
    ],
    pointA: {
      title: "The work had value\nbefore the system existed.",
      body: [
        "The founder had already built trust, knowledge, and a clear body of work. The challenge was not lack of value. The challenge was that the value still depended too much on direct delivery, repeated explanation, and founder presence.",
        "The business needed a system that could carry the experience with the same care, but with more structure, consistency, and room to scale.",
      ],
    },
    milestones: [
      {
        title: "Course Architecture",
        body: "We started by organizing the knowledge into a clear learning path. Before anything was built, the journey needed order.",
        icon: Network,
      },
      {
        title: "Learning Platform",
        body: "Once the structure was clear, we built the platform that could hold the experience, lessons, resources, and learner movement.",
        icon: Monitor,
      },
      {
        title: "Progress Tracking",
        body: "The next layer made progress visible. Learners could see where they were, and the team could understand how people were moving.",
        icon: BarChart3,
      },
      {
        title: "Knowledge Checks",
        body: "We added checkpoints to help the learning become measurable, not just consumed.",
        icon: ClipboardCheck,
      },
      {
        title: "Facilitator Tools",
        body: "The final layer helped the team support the experience without needing the founder to personally carry every moment.",
        icon: Users,
      },
    ],
    now: {
      title: "The work now has a place to live.",
      body: [
        "The business now has a live learning platform, a clearer delivery path, and a system that supports learners beyond one to one founder delivery.",
        "The walk is still active. The platform can keep improving, the content can keep expanding, and the system can keep carrying more of the work over time.",
      ],
      asOf: "Numbers are current as of April 2025.",
      stats: [
        { value: "1,250+", label: "Enrolled learners", icon: Users },
        { value: "84%", label: "Course completion rate", icon: BarChart3 },
        { value: "28", label: "Active cohorts", icon: LayoutGrid },
        { value: "18+", label: "Hours returned\nto the founder weekly", icon: ClipboardCheck },
      ],
    },
    quote: {
      text: "What changed was not just the platform. It was the order. The work finally had a path people could follow.",
      attrib: "Founder",
      org: "Leadership Education Company",
    },
    continueWalking: [
      "private-milestone-build",
      "financial-advisory-firm",
      "founder-led-business",
      "health-and-wellness",
      "e-commerce-brand",
    ],
  },

  "private-milestone-build": {
    slug: "private-milestone-build",
    eyebrow: "The Walks",
    headline: (
      <>
        From a private idea to a shipped<br />
        experience in <em className="italic text-royal">seventy-two hours.</em>
      </>
    ),
    subhead:
      "A private milestone needed to land on a fixed date. Three days on the clock, a clear scope, and no room to drift. The walk was short, but every step had to count.",
    route: [
      { key: "A", title: "Point A", sub: "Private idea,\nhard deadline" },
      { key: "01", title: "Scope\n& plan" },
      { key: "02", title: "Build" },
      { key: "03", title: "Test\n& ship" },
      { key: "NOW", title: "Delivered", sub: "Shipped in\n72 hours" },
    ],
    pointA: {
      title: "A real moment\nwith a real deadline.",
      body: [
        "The brief was private, the timeline was fixed, and the experience had to land cleanly on the day it was meant for. There was no room for a long discovery phase.",
        "What was needed was a focused build: clean scope, fast decisions, and a finished thing in someone's hands.",
      ],
    },
    milestones: [
      { title: "Scope & Plan", body: "We named the smallest version that would still feel like the real thing, and protected it.", icon: MapIcon },
      { title: "Build", body: "A tight focused build, with daily check-ins and no scope drift.", icon: Wrench },
      { title: "Test & Ship", body: "Tested in real conditions, then shipped on the date it was meant for.", icon: ClipboardCheck },
    ],
    now: {
      title: "Delivered on time, exactly as planned.",
      body: [
        "The experience landed on the day it was meant for, with the people it was meant for. Quiet, finished, on time.",
        "The work stayed private. The outcome did not.",
      ],
      asOf: "Completed 2024.",
      stats: [
        { value: "72 hr", label: "Total build time", icon: ClipboardCheck },
        { value: "1", label: "Hard deadline\nmet", icon: BarChart3 },
        { value: "0", label: "Scope changes\nmid-build", icon: LayoutGrid },
        { value: "100%", label: "Shipped on the\nintended date", icon: Users },
      ],
    },
    quote: {
      text: "Three days, one chance, and it landed. That is what we needed.",
      attrib: "Founder",
      org: "Private engagement",
    },
    continueWalking: ["leadership-education", "financial-advisory-firm", "founder-led-business", "health-and-wellness", "e-commerce-brand"],
  },

  "financial-advisory-firm": {
    slug: "financial-advisory-firm",
    eyebrow: "The Walks",
    headline: (
      <>
        From five disconnected tools to<br />
        one <em className="italic text-royal">operating system.</em>
      </>
    ),
    subhead:
      "The firm had grown in pieces. Each tool solved one problem, but no two tools talked. The team carried the gaps. The walk was about replacing five overlapping tools with one clear path.",
    route: [
      { key: "A", title: "Point A", sub: "Five tools,\nno path" },
      { key: "01", title: "Audit\n& map" },
      { key: "02", title: "Unify\ndata" },
      { key: "03", title: "Connected\nCRM" },
      { key: "04", title: "Client\nportal" },
      { key: "05", title: "Automations" },
      { key: "NOW", title: "Current State", sub: "One system,\nteam-run" },
    ],
    pointA: {
      title: "Five tools, five sources of truth.",
      body: [
        "Client data lived in one system, scheduling in another, documents in a third. The team spent hours every week reconciling instead of advising.",
        "The firm needed one path the whole team could follow, with the founder no longer the human integration layer between systems.",
      ],
    },
    milestones: [
      { title: "Audit & Map", body: "We mapped every tool, every handoff, and every place data was being copied by hand.", icon: MapIcon },
      { title: "Unify Data", body: "One source of truth for clients, accounts, and history. No more reconciling.", icon: Database },
      { title: "Connected CRM", body: "A CRM the team actually uses, wired into the rest of the stack.", icon: Network },
      { title: "Client Portal", body: "Clients now have one place to see what is happening with their work.", icon: Monitor },
      { title: "Automations", body: "The repeating work runs in the background. The team focuses on the conversation.", icon: Workflow },
    ],
    now: {
      title: "Response time, down to under an hour.",
      body: [
        "What used to take two days now happens in under an hour. The team runs the system without the founder needing to be in every loop.",
        "The firm can take on more clients without adding more chaos.",
      ],
      asOf: "Numbers are current as of early 2026.",
      stats: [
        { value: "<1 hr", label: "Average client\nresponse time", icon: BarChart3 },
        { value: "5→1", label: "Tools consolidated", icon: LayoutGrid },
        { value: "12 hr", label: "Founder time\nreturned weekly", icon: Users },
        { value: "100%", label: "Client data in\none place", icon: Database },
      ],
    },
    quote: {
      text: "The team finally runs the firm. I get to do the work I actually want to do.",
      attrib: "Founder",
      org: "Financial Advisory Firm",
    },
    continueWalking: ["leadership-education", "private-milestone-build", "founder-led-business", "health-and-wellness", "e-commerce-brand"],
  },

  "founder-led-business": {
    slug: "founder-led-business",
    eyebrow: "The Walks",
    headline: (
      <>
        From scattered tools to a path<br />
        the team can <em className="italic text-royal">actually follow.</em>
      </>
    ),
    subhead:
      "The founder was the operating system. The team did good work, but every decision still routed back through one person. The walk was about giving the work a path it could move along without the founder in the middle.",
    route: [
      { key: "A", title: "Point A", sub: "Founder is\nthe system" },
      { key: "01", title: "Map" },
      { key: "02", title: "CRM" },
      { key: "03", title: "Workflows" },
      { key: "04", title: "Knowledge\nbase" },
      { key: "NOW", title: "Current State", sub: "Team runs\nthe path" },
    ],
    pointA: {
      title: "The work all routed through one person.",
      body: [
        "Every client question, every internal decision, every new project still came back to the founder. The team was capable. The system was not.",
        "What was needed was a path the team could actually follow without permission for every step.",
      ],
    },
    milestones: [
      { title: "Map", body: "We mapped the real work — not the org chart, the actual path a project takes through the business.", icon: MapIcon },
      { title: "CRM", body: "A shared view of every client, every conversation, every commitment.", icon: Network },
      { title: "Workflows", body: "The repeating work became repeatable, without the founder being asked.", icon: Workflow },
      { title: "Knowledge Base", body: "Answers live in one place the team can reach without interrupting.", icon: Database },
    ],
    now: {
      title: "Twelve hours back, every week.",
      body: [
        "The team runs the path. The founder gets twelve hours a week back, and the business runs without the constant tap on the shoulder.",
        "The walk continues. New layers are being added as the team grows into the system.",
      ],
      asOf: "Active engagement.",
      stats: [
        { value: "12+ hr", label: "Founder hours\nreturned weekly", icon: Users },
        { value: "4", label: "Workflows\nautomated", icon: Workflow },
        { value: "1", label: "Source of truth\nfor clients", icon: Database },
        { value: "100%", label: "Team-owned\ndelivery path", icon: LayoutGrid },
      ],
    },
    quote: {
      text: "I stopped being the bottleneck. The team stopped waiting. That is the whole change.",
      attrib: "Founder",
      org: "Professional services firm",
    },
    continueWalking: ["leadership-education", "private-milestone-build", "financial-advisory-firm", "health-and-wellness", "e-commerce-brand"],
  },

  "health-and-wellness": {
    slug: "health-and-wellness",
    eyebrow: "The Walks",
    headline: (
      <>
        From founder-led delivery to<br />
        a <em className="italic text-royal">repeatable cohort system.</em>
      </>
    ),
    subhead:
      "The program worked. People got better. But every cohort still depended on the founder showing up for it. The walk was about building a system that could carry the experience across many cohorts at once.",
    route: [
      { key: "A", title: "Point A", sub: "Founder-led\ndelivery" },
      { key: "01", title: "Content\nstructure" },
      { key: "02", title: "LMS\nsetup" },
      { key: "03", title: "Cohort\nflow" },
      { key: "04", title: "Progress\ntracking" },
      { key: "05", title: "Knowledge\nchecks" },
      { key: "06", title: "Analytics" },
      { key: "NOW", title: "Current State", sub: "Multi-cohort,\nrepeatable" },
    ],
    pointA: {
      title: "A program that only worked when she was in it.",
      body: [
        "The outcomes were real. The challenge was that every cohort still needed the founder in every session, every check-in, every nudge.",
        "What was needed was a system that could hold the experience for many cohorts at once, without losing the care that made it work.",
      ],
    },
    milestones: [
      { title: "Content Structure", body: "We restructured the content into a sequence that could stand on its own.", icon: MapIcon },
      { title: "LMS Setup", body: "A platform that could carry the experience for hundreds of people at once.", icon: Monitor },
      { title: "Cohort Flow", body: "A repeatable rhythm for every cohort, with the right touch points in the right places.", icon: Workflow },
      { title: "Progress Tracking", body: "Visibility into where every learner is, without anyone having to ask.", icon: BarChart3 },
      { title: "Knowledge Checks", body: "Built-in moments to confirm the learning is landing, not just being consumed.", icon: ClipboardCheck },
      { title: "Analytics", body: "The data the team needs to keep improving each cohort.", icon: HeartPulse },
    ],
    now: {
      title: "Completion rate up from 64% to 89%.",
      body: [
        "The program now runs multiple cohorts in parallel, with stronger outcomes than when the founder ran each one herself. The system did not replace her care. It carried it.",
      ],
      asOf: "Numbers are current as of 2025.",
      stats: [
        { value: "89%", label: "Completion rate", icon: BarChart3 },
        { value: "64% → 89%", label: "Improvement since\nthe walk began", icon: HeartPulse },
        { value: "6+", label: "Cohorts running\nin parallel", icon: LayoutGrid },
        { value: "1", label: "System the team\ncan run together", icon: Users },
      ],
    },
    quote: {
      text: "I am no longer the program. The program is the program. And it is working better than ever.",
      attrib: "Founder",
      org: "Health & Wellness Company",
    },
    continueWalking: ["leadership-education", "private-milestone-build", "financial-advisory-firm", "founder-led-business", "e-commerce-brand"],
  },

  "e-commerce-brand": {
    slug: "e-commerce-brand",
    eyebrow: "The Walks",
    headline: (
      <>
        From manual operations to<br />
        infrastructure built <em className="italic text-royal">to scale.</em>
      </>
    ),
    subhead:
      "Orders were coming in. Support tickets were growing faster. The team was answering the same questions every day. The walk was about turning a busy operation into one that could grow without breaking.",
    route: [
      { key: "A", title: "Point A", sub: "Manual ops,\ngrowing volume" },
      { key: "01", title: "Ops\naudit" },
      { key: "02", title: "Help desk\nsystem" },
      { key: "03", title: "Automation\nsuite" },
      { key: "04", title: "Self-service\nhub" },
      { key: "05", title: "Reporting" },
      { key: "NOW", title: "Current State", sub: "Lower load,\nhigher CSAT" },
    ],
    pointA: {
      title: "Growth was the problem.",
      body: [
        "The brand was winning. Orders were up, reviews were up, and the team was buried. Every win added more manual work the next day.",
        "What was needed was infrastructure that could turn growth into momentum instead of overload.",
      ],
    },
    milestones: [
      { title: "Ops Audit", body: "We mapped every manual touch point and ranked them by hours spent.", icon: MapIcon },
      { title: "Help Desk System", body: "One place for every customer conversation, with the right context attached.", icon: Headphones },
      { title: "Automation Suite", body: "The repeating work runs without the team being pulled into it.", icon: Workflow },
      { title: "Self-Service Hub", body: "Customers can answer most of their own questions, instantly.", icon: ShoppingBag },
      { title: "Reporting", body: "Clear visibility into what is working, and what is breaking first.", icon: BarChart3 },
    ],
    now: {
      title: "Support volume down 38%. CSAT up.",
      body: [
        "The team handles more orders with less load, and customers are happier. The infrastructure carries the growth instead of fighting it.",
      ],
      asOf: "Numbers are current as of 2025.",
      stats: [
        { value: "-38%", label: "Support volume", icon: Headphones },
        { value: "+12 pts", label: "Customer\nsatisfaction", icon: HeartPulse },
        { value: "70%", label: "Tickets resolved\nself-service", icon: Bot },
        { value: "24/7", label: "Coverage with\nno extra team", icon: Users },
      ],
    },
    quote: {
      text: "Growth used to feel like a problem. Now it feels like a win.",
      attrib: "Founder",
      org: "E-Commerce Brand",
    },
    continueWalking: ["leadership-education", "private-milestone-build", "financial-advisory-firm", "founder-led-business", "health-and-wellness"],
  },
};

/* ----------------------- LIST FOR CONTINUE ------------------------ */

const SUMMARY: Record<string, { category: string; subcategory: string; blurb: string; milestonesCount: number; walkingSince: string }> = {
  "leadership-education": { category: "Leadership education", subcategory: "Founder led", blurb: "From deep IP and no platform to a live learning experience with enrolled learners.", milestonesCount: 6, walkingSince: "walking since 2024" },
  "private-milestone-build": { category: "Private milestone build", subcategory: "Confidential", blurb: "From a private idea and three days on the clock to a shipped anniversary experience.", milestonesCount: 4, walkingSince: "completed in 3 days" },
  "financial-advisory-firm": { category: "Financial advisory firm", subcategory: "Tennessee", blurb: "From five disconnected tools to one operating system the team can run without the founder.", milestonesCount: 6, walkingSince: "walking since 2023" },
  "founder-led-business": { category: "Founder led business", subcategory: "Professional services", blurb: "From scattered tools to a cleaner operating path the team can actually follow.", milestonesCount: 5, walkingSince: "active" },
  "health-and-wellness": { category: "Health and wellness", subcategory: "National", blurb: "From founder dependent delivery to a repeatable system across multiple cohorts.", milestonesCount: 7, walkingSince: "walking since 2023" },
  "e-commerce-brand": { category: "E-Commerce brand", subcategory: "National", blurb: "From manual operations to a business infrastructure built to scale.", milestonesCount: 6, walkingSince: "walking since 2024" },
};

/* ----------------------------- ROUTE ------------------------------ */

export const Route = createFileRoute("/walks_/$slug")({
  loader: ({ params }) => {
    if (!DETAILS[params.slug]) throw notFound();
    return { slug: params.slug };
  },
  head: ({ loaderData }) => {
    const slug = loaderData?.slug;
    const walk = slug ? DETAILS[slug] : undefined;
    const title = walk ? `${SUMMARY[walk.slug]?.category ?? "Walk"} | The Walks | Trust Tai` : "Walk | Trust Tai";
    const description = walk?.subhead ?? "A walk we have taken with a founder-led business.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: `/walks/${walk?.slug ?? ""}` }],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-6 py-32 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-6 font-display text-[3rem] text-ink">This walk has not been written.</h1>
        <p className="mt-4 text-ink/65">The walk you are looking for is not on the map.</p>
        <Link to="/walks" className="mt-10 inline-flex items-center gap-2 text-royal underline underline-offset-4">
          <ArrowLeft className="h-4 w-4" /> Back to The Walks
        </Link>
      </main>
    </div>
  ),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-[1240px] px-6 py-32 text-center">
          <p className="eyebrow">Something broke</p>
          <h1 className="mt-6 font-display text-[2.5rem] text-ink">We could not load this walk.</h1>
          <p className="mt-4 text-ink/65">{String(error?.message ?? error)}</p>
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-paper"
          >
            Try again
          </button>
        </main>
      </div>
    );
  },
  component: WalkDetailPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

/* ----------------------------- HERO ------------------------------ */

function DetailHero({ walk }: { walk: WalkDetail }) {
  return (
    <section className="relative w-full overflow-hidden bg-paper" style={{ minHeight: "440px" }}>
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: `url(${heroArt.url})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "58% auto",
          backgroundPosition: "right 0% center",
          opacity: 1,
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "linear-gradient(to right, #fbf8f2 0%, #fbf8f2 32%, rgba(251,248,242,0.92) 46%, rgba(251,248,242,0.45) 62%, rgba(251,248,242,0.1) 82%, rgba(251,248,242,0) 100%)",
        }}
        aria-hidden="true"
      />

      <div className={`relative z-[3] ${container}`}>
        <div style={{ maxWidth: "640px", paddingTop: "120px", paddingBottom: "70px" }}>
          <Link
            to="/walks"
            className="eyebrow inline-flex items-center gap-2 text-royal/80 hover:text-royal"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>{walk.eyebrow}</span>
          </Link>
          <Reveal
            as="h1"
            variant="rise"
            delay={120}
            className="mt-5 font-display text-[2.6rem] leading-[1.06] tracking-tight text-ink sm:text-[3.1rem]"
          >
            {walk.headline}
          </Reveal>
          <Reveal
            as="p"
            variant="fade-up"
            delay={240}
            className="mt-5 max-w-[36rem] text-[14.5px] leading-relaxed text-ink/70"
          >
            {walk.subhead}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- THE ROUTE ----------------------------- */

function TheRoute({ points }: { points: RoutePoint[] }) {
  return (
    <section className="border-t border-rule bg-paper">
      <div className={`${container} py-10`}>
        <p className="eyebrow text-royal/80">The Route</p>

        <div className="relative mt-10 overflow-x-auto pb-2">
          <div
            className="grid items-start gap-x-6"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(110px, 1fr))` }}
          >
            {/* Header labels */}
            {points.map((p, i) => {
              const isFirst = i === 0;
              const isLast = i === points.length - 1;
              return (
                <div key={`h-${i}`} className="text-left">
                  <p className={`font-mono text-[10.5px] uppercase tracking-[0.18em] ${isFirst || isLast ? "text-royal" : "text-ink/55"}`}>
                    {p.title.includes("\n") || (!isFirst && !isLast) ? p.key : p.title}
                  </p>
                </div>
              );
            })}

            {/* Connecting line + dots row */}
            <div className="col-span-full mt-3 relative h-6">
              <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-royal/30" />
              <div
                className="absolute inset-0 grid"
                style={{ gridTemplateColumns: `repeat(${points.length}, minmax(110px, 1fr))` }}
              >
                {points.map((_, i) => {
                  const isLast = i === points.length - 1;
                  return (
                    <div key={`d-${i}`} className="relative flex items-center">
                      {isLast ? (
                        <span className="relative flex h-5 w-5 items-center justify-center">
                          <span className="absolute h-5 w-5 rounded-full bg-royal/15" />
                          <span className="h-2.5 w-2.5 rounded-full bg-royal" />
                        </span>
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-royal" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sub labels */}
            {points.map((p, i) => {
              const isMiddle = i !== 0 && i !== points.length - 1;
              return (
                <div key={`s-${i}`} className="mt-4">
                  {isMiddle ? (
                    <p className="text-[12.5px] leading-snug text-ink/70 whitespace-pre-line">
                      {p.title}
                    </p>
                  ) : (
                    <p className="text-[12.5px] leading-snug text-ink/70 whitespace-pre-line">
                      {p.sub}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------- POINT A + MILESTONES --------------------- */

function MountainSketch({ className }: { className?: string }) {
  return (
    <img
      src={pointAArt.url}
      alt=""
      aria-hidden="true"
      className={`pointer-events-none select-none ${className ?? ""}`}
      style={{ objectFit: "contain", objectPosition: "left center" }}
    />
  );
}

function PointAndMilestones({ walk }: { walk: WalkDetail }) {
  return (
    <section className="border-t border-rule bg-paper">
      <div className={`${container} grid grid-cols-1 gap-12 py-16 lg:grid-cols-2 lg:gap-16`}>
        {/* Point A */}
        <div className="relative">
          <p className="eyebrow text-royal/80">Point A</p>
          <h2 className="mt-6 whitespace-pre-line font-display text-[2rem] leading-[1.1] tracking-tight text-ink sm:text-[2.25rem]">
            {walk.pointA.title}
          </h2>
          {walk.pointA.body.map((p, i) => (
            <p key={i} className="mt-5 max-w-[44ch] text-[13.5px] leading-[1.8] text-ink/70">
              {p}
            </p>
          ))}
          <div className="relative mt-10 h-[200px] w-full overflow-hidden sm:h-[240px] lg:h-[300px] lg:w-[125%] lg:-ml-[5%] lg:overflow-visible">
            <MountainSketch className="absolute inset-0 h-full w-full" />
          </div>
        </div>

        {/* Milestones */}
        <div>
          <p className="eyebrow text-royal/80">The Milestones</p>
          <ol className="relative mt-6 space-y-7">
            {/* vertical line */}
            <span aria-hidden className="pointer-events-none absolute left-[18px] top-3 bottom-3 w-px border-l border-dashed border-royal/30" />
            {walk.milestones.map((m, i) => {
              const Icon = m.icon;
              const num = String(i + 1).padStart(2, "0");
              return (
                <li key={i} className="relative grid grid-cols-[40px_44px_minmax(0,1fr)] items-start gap-4">
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-royal/40 bg-paper">
                    <span className="font-mono text-[10.5px] tracking-[0.16em] text-royal">{num}</span>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center text-royal">
                    <Icon className="h-6 w-6" strokeWidth={1.4} />
                  </div>
                  <div>
                    <p className="font-display text-[20px] leading-snug text-ink">{m.title}</p>
                    <p className="mt-1.5 max-w-[42ch] text-[12.5px] leading-[1.75] text-ink/65">
                      {m.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ----------------------- WHERE THEY STAND NOW ----------------------- */

function WhereTheyStandNow({ walk }: { walk: WalkDetail }) {
  return (
    <section className="border-t border-rule bg-paper">
      <div className={`${container} grid grid-cols-1 gap-12 py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16`}>
        <div>
          <p className="eyebrow text-royal/80">Where they stand now</p>
          <h2 className="mt-6 font-display text-[2rem] leading-[1.1] tracking-tight text-ink sm:text-[2.25rem]">
            {walk.now.title}
          </h2>
          {walk.now.body.map((p, i) => (
            <p key={i} className="mt-5 max-w-[40ch] text-[13.5px] leading-[1.8] text-ink/70">
              {p}
            </p>
          ))}
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {walk.now.stats.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-md border border-rule bg-paper px-4 py-5 text-center"
                >
                  <Icon className="mx-auto h-5 w-5 text-royal" strokeWidth={1.4} />
                  <p className="font-display text-[26px] leading-none text-ink">{s.value}</p>
                  <p className="whitespace-pre-line text-[11.5px] leading-snug text-ink/60">{s.label}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-[11.5px] italic text-ink/45">{walk.now.asOf}</p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- QUOTE ----------------------------- */

function QuoteBlock({ walk }: { walk: WalkDetail }) {
  return (
    <section className={`${container} border-t border-rule pb-14 pt-14`}>
      <div className="relative overflow-hidden rounded-md border border-rule bg-paper">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-[60%]"
          style={{
            backgroundImage: `url(${panoramaArt.url})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "right center",
            opacity: 0.85,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(to right, #fbf8f2 0%, #fbf8f2 45%, rgba(251,248,242,0.6) 65%, rgba(251,248,242,0) 100%)",
          }}
        />
        <div className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-5 px-8 py-10 sm:px-12 sm:py-12">
          <Quote className="h-7 w-7 text-royal/60" strokeWidth={1.4} />
          <div className="max-w-[58ch]">
            <p className="font-display text-[22px] italic leading-[1.45] text-ink sm:text-[24px]">
              {walk.quote.text}
            </p>
            <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/65">
              {walk.quote.attrib}
            </p>
            <p className="mt-1 text-[12.5px] text-ink/55">{walk.quote.org}</p>
          </div>
        </div>
      </div>
    </section>
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
    <section id="cta" className="relative mt-16 overflow-hidden bg-[oklch(0.13_0.05_265)] text-white">
      <CtaContour />
      <div className={`${container} relative grid grid-cols-1 items-center gap-8 py-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:py-16`}>
        <div>
          <h2 className="font-display text-[26px] leading-[1.18] tracking-[-0.018em] text-white sm:text-[32px]">
            Your business is at its own Point A right now.
          </h2>
          <p className="mt-5 max-w-[54ch] text-[12.5px] leading-[1.75] text-white/65">
            The walk starts with the map. We name where you are, define where the business needs to go, and build the route in the right order.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 md:items-end md:text-right">
          <a
            href="#cta"
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

/* ------------------------ CONTINUE WALKING ------------------------ */

function ContinueWalking({ slugs }: { slugs: string[] }) {
  return (
    <section className="border-t border-rule bg-paper">
      <div className={`${container} py-14`}>
        <p className="eyebrow text-royal/80">Continue Walking</p>
        <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {slugs.map((s) => {
            const sum = SUMMARY[s];
            if (!sum) return null;
            return (
              <article key={s} className="flex flex-col gap-3">
                <p className="eyebrow leading-tight">{sum.category}</p>
                <p className="text-[11.5px] text-ink/55">{sum.subcategory}</p>
                <MiniRoute count={sum.milestonesCount} />
                <p className="mt-2 text-[12.5px] leading-[1.6] text-ink/75">{sum.blurb}</p>
                <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink/50">
                  {sum.milestonesCount} milestones · {sum.walkingSince}
                </p>
                <Link
                  to="/walks/$slug"
                  params={{ slug: s }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink underline decoration-ink/30 underline-offset-[6px] transition-colors hover:text-royal hover:decoration-royal"
                >
                  View walk <ArrowRight className="h-3 w-3" />
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MiniRoute({ count }: { count: number }) {
  const W = 220;
  const H = 50;
  const padX = 8;
  const usable = W - padX * 2;
  const n = Math.max(3, count);
  const xs = Array.from({ length: n }, (_, i) => padX + (i * usable) / (n - 1));
  const ys = xs.map((_, i) => {
    const t = i / (n - 1);
    const eased = Math.pow(t, 1.3);
    return 38 - eased * 24 + (i % 2 === 0 ? 0 : -2);
  });
  const d = xs.map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `L ${x} ${ys[i]}`)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[50px] w-full" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--royal)" strokeWidth="1" strokeLinecap="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === n - 1 ? 3 : 2.5} fill="var(--royal)" />
      ))}
    </svg>
  );
}


/* ------------------------------ PAGE ------------------------------ */

function WalkDetailPage() {
  const { slug } = Route.useLoaderData();
  const walk = DETAILS[slug];
  if (!walk) return null;
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <DetailHero walk={walk} />
        <TheRoute points={walk.route} />
        <PointAndMilestones walk={walk} />
        <WhereTheyStandNow walk={walk} />
        <QuoteBlock walk={walk} />
        <DarkCta />
        {/* <ContinueWalking slugs={walk.continueWalking} /> */}
        <SiteFooter />
      </main>
    </div>
  );
}
