import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Layers,
  BookOpen,
  Search,
  Users,
  MessagesSquare,
  BarChart3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Radio,
} from "lucide-react";
import { PopupModal } from "react-calendly";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import taiPortrait from "@/assets/clients/spartan/tai-portrait.png.asset.json";
import signatureTai from "@/assets/clients/spartan/signature-tai.png.asset.json";
import pttLogoAsset from "@/assets/clients/pttanywhere/ptt-logo-color.png.asset.json";
import pttTeamsAsset from "@/assets/clients/pttanywhere/ptt-teams.jpg.asset.json";
import m01Asset from "@/assets/clients/pttanywhere/ptt-m01-content-engine.png.asset.json";
import m02Asset from "@/assets/clients/pttanywhere/ptt-m02-industry-page.png.asset.json";
import m03Asset from "@/assets/clients/pttanywhere/ptt-m03-advisor.png.asset.json";
import m04Asset from "@/assets/clients/pttanywhere/ptt-m04-lead.png.asset.json";
import m05Asset from "@/assets/clients/pttanywhere/ptt-m05-dashboard.png.asset.json";
import { SectionSlider } from "@/components/clients/pttanywhere/SectionSlider";
import { SideNav } from "@/components/clients/pttanywhere/SideNav";

const pttLogo = pttLogoAsset.url;
const pttTeams = pttTeamsAsset.url;
const m01ContentEngine = m01Asset.url;
const m02IndustryPage = m02Asset.url;
const m03Advisor = m03Asset.url;
const m04Lead = m04Asset.url;
const m05Dashboard = m05Asset.url;

const NAVY = "#112337";
const CYAN = "#27B9FF";
const CYAN_DEEP = "#0F7FBF";

const CANONICAL = "https://trusttai.com/clients/pttanywhere";

export const Route = createFileRoute("/clients/pttanywhere")({
  head: () => ({
    meta: [
      { title: "PTT Anywhere Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A sales intelligence roadmap for PTT Anywhere: help more businesses find push-to-talk answers, identify the right radio, app, Dispatch and SafeGuard setup, and move into qualified quotes.",
      },
      { property: "og:title", content: "PTT Anywhere Roadmap: Reach Buyers Earlier, Quote With Context" },
      {
        property: "og:description",
        content:
          "Turn PTT Anywhere's product depth into buyer education, guided product decisions, better-qualified enquiries, and stronger sales follow-up.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: m01Asset.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: m01Asset.url },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PttAnywhereRoadmap,
});

function PttAnywhereRoadmap() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main
        id="main"
        className="ptt-deck relative w-full"
        style={{
          backgroundColor: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          color: NAVY,
        }}
      >
        <SectionSlider>
          <PointASection />
          <MarketGapSection />
          <HelloSection />
        </SectionSlider>
        <SideNav />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ================== POINT A ================== */

function PointASection() {
  const muted = "rgba(17,35,55,0.75)";
  const helvetica = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const stats: { value: string; label: string }[] = [
    { value: "8", label: "Authority Score" },
    { value: "92", label: "Estimated organic traffic" },
    { value: "252", label: "Organic keywords" },
    { value: "4%", label: "Traffic share" },
    { value: "118", label: "Referring domains" },
    { value: "229", label: "Backlinks" },
    { value: "14", label: "AI Visibility" },
    { value: "19", label: "AI-cited pages" },
  ];

  const assets = [
    "Motorola TLK devices",
    "WAVE PTX Mobile App",
    "WAVE PTX Dispatch",
    "WAVE PTX SafeGuard",
    "Product and pricing information",
    "Industry pages",
    "Brochures, data sheets, user guides",
    "Lead forms, contact options, and chat",
  ];

  const rankings = [
    { term: "“PTT contact number”", pos: "1" },
    { term: "“Motorola WAVE PTX”", pos: "2" },
    { term: "“Motorola PTT radio”", pos: "2" },
    { term: "“Nationwide two-way radio”", pos: "7" },
  ];

  const intent = [
    { label: "Informational", value: "63.9%" },
    { label: "Commercial", value: "26.7%" },
    { label: "Navigational", value: "5.1%" },
    { label: "Transactional", value: "4.3%" },
  ];

  const questions = [
    "Which setup fits my team?",
    "What problem will it solve?",
    "Which devices, apps, or dispatch tools do I need?",
    "What will the pricing or deployment path look like?",
    "What should I do next?",
  ];

  const opportunities = [
    "Capture more product, industry, and comparison searches",
    "Turn technical documents into useful buyer education",
    "Make industry pages more persuasive",
    "Reduce product and setup confusion",
    "Improve quote requests",
    "Give sales better buyer context",
    "Make follow-up more relevant",
    "Identify which products and industries are creating demand",
  ];

  return (
    <section id="point-a" className="relative w-full overflow-hidden" style={{ backgroundColor: "#ffffff", fontFamily: helvetica }}>
<div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-5 py-8 sm:px-8 sm:py-10 md:px-16 md:py-12 lg:px-24 lg:py-14 xl:px-28">
        {/* Top: brand logo */}
        <div className="mb-4 flex justify-center sm:mb-6">
          <a
            href="https://www.pttanywhere.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit PTT Anywhere's website"
            className="transition-opacity hover:opacity-80"
          >
            <img
              src={pttLogo}
              alt="PTT Anywhere"
              loading="eager"
              className="h-auto w-[150px] sm:w-[185px] md:w-[210px]"
            />
          </a>
        </div>

        {/* Section title */}
        <div className="mb-6 text-center sm:mb-10 md:mb-12">
          <div className="hidden items-center justify-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: CYAN_DEEP, fontFamily: helvetica }}>
              01
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(17,35,55,0.22)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "rgba(17,35,55,0.55)", fontFamily: helvetica }}
            >
              Where PTT Anywhere Stands
            </span>
          </div>
          <h2 className="mt-4 font-black leading-[0.98] tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 54px)" }}>
            <span style={{ color: CYAN_DEEP }}>Point A:</span>
            <span style={{ color: NAVY }}>&nbsp;Current position</span>
          </h2>
        </div>

        {/* Middle */}
        <div className="grid grid-cols-1 items-stretch gap-8 sm:gap-10 md:grid-cols-[3fr_2fr] md:gap-14">
          {/* Left: featured image */}
          <div className="flex">
            <div className="relative w-full min-h-[420px] sm:min-h-[560px] md:min-h-0 overflow-hidden rounded-lg">
              <img
                src={pttTeams}
                alt="Field service team using push-to-talk radios and a mobile app"
                loading="lazy"
                className="h-full w-full absolute inset-0 object-cover object-top"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(180deg, transparent 55%, rgba(17,35,55,0.6))" }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-90" style={{ fontFamily: helvetica }}>
                  Nationwide push-to-talk
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70" style={{ fontFamily: helvetica }}>
                  Radios · Apps · Dispatch · Safety
                </div>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-col gap-5 sm:gap-6">
            <p
              className="text-[20px] leading-[1.15] sm:text-[24px] md:text-[26px] lg:text-[28px]"
              style={{ color: NAVY, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}
            >
              PTT Anywhere has the product depth. The next opportunity is to make buying decisions easier.
            </p>

            <div className="space-y-3 text-[12.5px] leading-[1.6] sm:text-[13px]" style={{ color: muted, fontFamily: helvetica }}>
              <p className="font-semibold" style={{ color: NAVY }}>
                The website already includes:
              </p>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {assets.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CYAN_DEEP }} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
              <p>The business is not missing products or information.</p>
              <p>
                The opportunity is to connect these assets into a clearer system that helps buyers find PTT Anywhere, understand
                their options, compare setups, and take the right next step.
              </p>
              <p className="font-semibold" style={{ color: NAVY }}>
                The current search foundation — August 2026 SEMrush snapshot:
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-md border p-2.5"
                  style={{ borderColor: "rgba(17,35,55,0.10)", background: "rgba(39,185,255,0.07)" }}
                >
                  <div className="text-[16px] font-extrabold leading-none sm:text-[17px]" style={{ color: CYAN_DEEP, fontFamily: helvetica }}>
                    {s.value}
                  </div>
                  <div className="mt-1 text-[10px] leading-snug" style={{ color: muted, fontFamily: helvetica }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Rankings + intent */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-3" style={{ borderColor: "rgba(17,35,55,0.10)" }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: CYAN_DEEP }}>
                  Already ranking
                </div>
                <ul className="mt-2 space-y-1.5 text-[11.5px]" style={{ color: muted }}>
                  {rankings.map((r) => (
                    <li key={r.term} className="flex items-baseline justify-between gap-3">
                      <span>{r.term}</span>
                      <span className="font-bold tabular-nums" style={{ color: NAVY }}>
                        #{r.pos}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border p-3" style={{ borderColor: "rgba(17,35,55,0.10)" }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: CYAN_DEEP }}>
                  Keyword intent
                </div>
                <ul className="mt-2 space-y-1.5 text-[11.5px]" style={{ color: muted }}>
                  {intent.map((i) => (
                    <li key={i.label} className="flex items-baseline justify-between gap-3">
                      <span>{i.label}</span>
                      <span className="font-bold tabular-nums" style={{ color: NAVY }}>
                        {i.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3 text-[12.5px] leading-[1.6] sm:text-[13px]" style={{ color: muted, fontFamily: helvetica }}>
              <p>PTT Anywhere already ranks for relevant terms. The issue is scale.</p>
              <p>
                Most visible buyers are still researching and comparing, while the current search footprint does not yet reflect
                the full range of products, industries, pricing questions, comparisons, and communication problems the business
                can address.
              </p>
            </div>
          </div>
        </div>

        {/* Strategic opportunity */}
        <div
          className="mt-10 rounded-lg border p-5 sm:p-7 md:p-8"
          style={{ borderColor: "rgba(17,35,55,0.10)", background: "rgba(17,35,55,0.03)" }}
        >
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] sm:text-[14px]" style={{ color: CYAN_DEEP, fontFamily: helvetica }}>
            The strategic opportunity
          </h3>
          <div
            className="mt-4 grid gap-6 text-[13px] leading-[1.65] sm:text-[13.5px] md:grid-cols-2 md:gap-10"
            style={{ color: muted, fontFamily: helvetica }}
          >
            <div className="space-y-3">
              <p className="font-semibold" style={{ color: NAVY }}>
                A buyer should be able to answer five questions quickly:
              </p>
              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li key={q} className="flex gap-3">
                    <span className="font-black tabular-nums" style={{ color: CYAN_DEEP }}>
                      0{i + 1}
                    </span>
                    <span style={{ color: NAVY }}>{q}</span>
                  </li>
                ))}
              </ol>
              <p>
                The goal is to move qualified buyers from research to product understanding, then into a quote, demo, or sales
                conversation.
              </p>
            </div>
            <div className="space-y-3">
              <p className="font-semibold" style={{ color: NAVY }}>
                This roadmap helps PTT Anywhere:
              </p>
              <ul className="space-y-2.5">
                {opportunities.map((o) => (
                  <li key={o} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CYAN_DEEP }} />
                    <span style={{ color: NAVY }}>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== MILESTONES (5 slides) ================== */

type GapIcon = typeof Search;
type Slide = {
  num: string;
  label: string;
  subtitle: React.ReactNode;
  build: { name: string; body: React.ReactNode };
  unlock: { title: string; body: React.ReactNode };
  image: string;
  urlBar: string;
  imageCaption: string;
  Icon: GapIcon;
};

function MarketGapSection() {
  const serif = "'Cormorant Garamond', Georgia, serif";
  const sans = "Helvetica, Arial, sans-serif";

  const slides: Slide[] = [
    {
      num: "01",
      label: "Search Visibility and Content Engine",
      Icon: BookOpen,
      urlBar: "pttanywhere.com/guides",
      image: m01ContentEngine,
      imageCaption:
        "A connected content engine turns PTT Anywhere's product knowledge into searchable buyer education.",
      subtitle: (
        <>
          Buyers are already searching for setup answers. PTT should be one of the answers they find.
        </>
      ),
      build: {
        name: "Search Visibility and Content Engine",
        body: (
          <>
            <p>
              Build a content engine trained on PTT's approved resources and the questions buyers are already asking online.
            </p>
            <p>
              It should turn that knowledge into blog posts, tutorials, buyer guides, comparison pages, and social media
              articles that sound like PTT.
            </p>
            <p>
              So when someone searches for “WAVE PTX vs two-way radio,” “push-to-talk for construction teams,” or “when does a
              business need Dispatch?”, PTT has useful answers ready to be found.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Meet buyers earlier",
        body: (
          <>
            PTT Anywhere can appear while companies are still researching problems and comparing possible solutions.
          </>
        ),
      },
    },
    {
      num: "02",
      label: "Service Pages for Key Industries",
      Icon: Layers,
      urlBar: "pttanywhere.com/industries/construction",
      image: m02IndustryPage,
      imageCaption:
        "An industry service page connects each work environment with the most relevant PTT setup.",
      subtitle: (
        <>
          Buyers understand faster when the page speaks to the work they actually do.
        </>
      ),
      build: {
        name: "Service Pages for Key Industries",
        body: (
          <>
            <p>
              Turn the current industry pages into clear service pages for the main types of businesses PTT serves. A few
              examples: construction, education, transportation, security, field service, healthcare, manufacturing, towing, and
              waste management.
            </p>
            <p>
              Each page should explain the real communication problem, the likely setup, the right mix of radios, mobile app,
              Dispatch, and SafeGuard, then point the buyer toward a quote, demo, or Product Advisor.
            </p>
            <p>
              This helps buyers see, “Yes, this is for a team like ours.”
            </p>
          </>
        ),
      },
      unlock: {
        title: "Show the right setup by industry",
        body: <>Buyers see how PTT Anywhere fits their work environment, risks, team structure, and communication needs.</>,
      },
    },
    {
      num: "03",
      label: "Product Advisor and AI Assistant",
      Icon: MessagesSquare,
      urlBar: "pttanywhere.com/product-advisor",
      image: m03Advisor,
      imageCaption:
        "A Product Advisor and AI Assistant help buyers choose the right setup, even after work hours.",
      subtitle: (
        <>
          A product list shows the options. A good assistant helps the buyer choose.
        </>
      ),
      build: {
        name: "Product Advisor and AI Assistant",
        body: (
          <>
            <p>
              Build a Product Advisor and AI Assistant into the website so visitors can get help even after work hours.
            </p>
            <p>
              The buyer can answer simple setup questions, ask real product questions, compare radios and mobile app options,
              understand Dispatch or SafeGuard, and get a recommended starting setup.
            </p>
            <p>
              The assistant should be trained on PTT's approved resources, and when the question needs a human, it should point
              the visitor to the right sales route.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Turn questions into qualified opportunities",
        body: <>Buyers receive a clearer starting setup, while sales receives useful requirements before responding.</>,
      },
    },
    {
      num: "04",
      label: "Lead Qualification and Follow-Up System",
      Icon: Users,
      urlBar: "pttanywhere.com/enquiries",
      image: m04Lead,
      imageCaption:
        "A lead qualification system gives sales the context needed for faster, more relevant follow-up.",
      subtitle: (
        <>
          Sales should not start from scratch when the website already knows what the buyer wants.
        </>
      ),
      build: {
        name: "Lead Qualification and Follow-Up System",
        body: (
          <>
            <p>
              Connect forms, chat, quote requests, Product Advisor answers, and AI conversations into one clearer lead
              follow-up system.
            </p>
            <p>
              Each enquiry should show sales the buyer's industry, team size, current setup, main problem, urgency, product
              interest, and next step.
            </p>
            <p>
              The system should also help draft follow-up messages, so a Dispatch buyer gets Dispatch content and a
              construction buyer gets guidance that actually fits construction.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Follow up with better context",
        body: (
          <>
            Sales can respond faster and continue the buyer's actual conversation instead of restarting with generic questions.
          </>
        ),
      },
    },
    {
      num: "05",
      label: "Sales Intelligence Dashboard",
      Icon: BarChart3,
      urlBar: "pttanywhere.com/insights",
      image: m05Dashboard,
      imageCaption:
        "A connected dashboard turns buyer activity into clearer marketing and sales decisions.",
      subtitle: (
        <>
          The whole system should show what buyers care about and improve from it.
        </>
      ),
      build: {
        name: "Sales Intelligence Dashboard",
        body: (
          <>
            <p>
              Build one admin dashboard connected to the content engine, service pages, Product Advisor, AI Assistant, forms,
              quote requests, and follow-up activity.
            </p>
            <p>
              The dashboard should show what people search, read, ask, click, request, and respond to.
            </p>
            <p>
              It should also use those patterns to improve the next content ideas, make follow-up messages more relevant, and
              show the team what to focus on next.
            </p>
          </>
        ),
      },
      unlock: {
        title: "See what demand is saying",
        body: <>Marketing and sales can improve content, recommendations, and follow-up using real buyer behaviour.</>,
      },
    },
  ];

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  return (
    <section id="market-gap" className="relative flex min-h-screen w-full flex-col lg:[@media(min-height:860px)]:h-screen" style={{ backgroundColor: NAVY }}>
      {/* Section title (constant) */}
      <div className="market-gap-title w-full bg-white">
        <div className="flex flex-col items-center justify-center px-6 pt-8 pb-5 text-center sm:pt-14 sm:pb-8 md:pt-16 md:pb-10 lg:[@media(min-height:860px)]:pt-14 lg:[@media(min-height:860px)]:pb-8 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: CYAN_DEEP, fontFamily: sans }}>
              02
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(17,35,55,0.22)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "rgba(17,35,55,0.55)", fontFamily: sans }}
            >
              The path to the next stage
            </span>
          </div>
          <h2
            className="mt-4 font-black leading-[0.98] tracking-tight sm:mt-5"
            style={{ color: NAVY, fontFamily: sans, fontSize: "clamp(34px, 4.6vw, 66px)" }}
          >
            The <span style={{ color: CYAN_DEEP }}>milestones</span>
          </h2>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 bg-white lg:grid-cols-12 lg:min-h-0">
        {/* LEFT: text */}
        <div className="market-gap-left flex flex-col p-6 sm:p-10 md:p-14 lg:col-span-5 lg:p-16 xl:p-20 lg:[@media(min-height:860px)]:min-h-0 lg:[@media(min-height:860px)]:py-10 xl:[@media(min-height:860px)]:py-12" style={{ fontFamily: sans }}>
          <div className="flex flex-1 flex-col">
            <div key={`h-${index}`} className="market-gap-header relative animate-fade-in">
              <span
                aria-hidden
                className="absolute left-0 -top-6 text-[88px] font-black leading-none select-none sm:-top-7 sm:text-[112px] md:-top-8 md:text-[128px]"
                style={{ color: CYAN_DEEP, opacity: 0.09, fontFamily: sans }}
              >
                {slide.num}
              </span>

              <div className="relative flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: CYAN_DEEP, fontFamily: sans }}>
                  Milestone {slide.num}
                </span>
                <span style={{ color: "rgba(17,35,55,0.35)" }}>·</span>
                <span
                  className="text-[10px] font-black uppercase tracking-[0.24em]"
                  style={{ color: "rgba(17,35,55,0.55)", fontFamily: sans }}
                >
                  {String(total).padStart(2, "0")} total
                </span>
              </div>

              <h3
                className="relative mt-1 text-[30px] leading-[1.05] tracking-tight sm:text-[38px] md:text-[44px]"
                style={{ color: NAVY, fontFamily: serif, fontWeight: 600 }}
              >
                {slide.label}
              </h3>
            </div>

            <div
              key={`b-${index}`}
              className="market-gap-build mt-6 space-y-3 text-[13.5px] leading-[1.65] animate-fade-in"
              style={{ color: "rgba(17,35,55,0.8)", fontFamily: sans }}
            >
              {slide.build.body}
            </div>

            <div
              key={`u-${index}`}
              className="market-gap-unlock mt-5 flex items-start gap-3 rounded-lg p-3 animate-fade-in"
              style={{ background: "rgba(39,185,255,0.12)" }}
            >
              <Check size={16} color={CYAN_DEEP} strokeWidth={2.6} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: CYAN_DEEP, fontFamily: sans }}>
                  What It Unlocks
                </div>
                <div className="mt-1 text-[13px] font-bold" style={{ color: NAVY, fontFamily: sans }}>
                  {slide.unlock.title}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: "rgba(17,35,55,0.85)", fontFamily: sans }}>
                  {slide.unlock.body}
                </p>
              </div>
            </div>

            {/* Nav — pinned to the same spot on every slide */}
            <div className="mt-auto flex justify-center pt-8 sm:pt-10">
              <div
                className="market-gap-nav inline-flex items-center gap-3 rounded-2xl border bg-white p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] sm:gap-4"
                style={{ borderColor: "rgba(17,35,55,0.12)" }}
              >
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous milestone"
                  className="group flex h-11 w-[76px] items-center justify-center gap-2 rounded-xl border bg-white px-3 transition-all duration-200 hover:-translate-y-0.5 sm:w-[92px] sm:px-4"
                  style={{ borderColor: "rgba(17,35,55,0.15)", color: "rgba(17,35,55,0.55)", fontFamily: sans }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden text-[11px] font-black uppercase tracking-[0.22em] sm:inline">Prev</span>
                </button>

                <span
                  className="w-[56px] text-center text-[13px] font-black tabular-nums tracking-[0.18em] sm:w-[64px]"
                  style={{ color: NAVY, fontFamily: sans }}
                >
                  {slide.num}
                  <span style={{ color: "rgba(17,35,55,0.35)" }}> / {String(total).padStart(2, "0")}</span>
                </span>

                <div className="hidden w-[200px] items-center justify-center gap-0 sm:flex">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to milestone ${i + 1}`}
                      className="flex h-1.5 w-7 items-center justify-center rounded-full transition-all duration-300"
                      style={{ width: 28, backgroundColor: "transparent" }}
                    >
                      <span
                        className="block h-1.5 rounded-full transition-all duration-300"
                        style={{ width: i === index ? 28 : 16, backgroundColor: i === index ? CYAN_DEEP : "rgba(17,35,55,0.15)" }}
                      />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next milestone"
                  className="group flex h-11 w-[76px] shrink-0 animate-[button-pulse_2s_ease-in-out_infinite] items-center justify-center gap-1.5 rounded-xl px-3 transition-all duration-200 sm:w-[92px] sm:gap-2 sm:px-5"
                  style={{ backgroundColor: CYAN, color: NAVY, fontFamily: sans }}
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.22em]">Next</span>
                  <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: mockup */}
        <div
          className="market-gap-right relative flex flex-col justify-start overflow-hidden p-6 sm:p-8 md:p-10 lg:col-span-7 lg:p-10 xl:p-12 lg:[@media(min-height:860px)]:min-h-0"
          style={{ backgroundColor: NAVY }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(39,185,255,0.22)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(39,185,255,0.12)" }}
          />

          <div key={`q-${index}`} className="market-gap-quote relative mb-4 min-h-[42px] animate-fade-in sm:mb-5 sm:min-h-[50px] md:min-h-[56px] lg:min-h-[58px]">
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: CYAN, fontFamily: serif }}
            >
              &ldquo;
            </span>
            <p className="text-[15px] leading-[1.35] text-white sm:text-[18px] md:text-[20px] lg:text-[21px]" style={{ fontFamily: serif, fontWeight: 500 }}>
              {slide.subtitle}
            </p>
          </div>

          <div className="market-gap-mockup relative flex flex-1 flex-col lg:[@media(min-height:860px)]:min-h-0">
            <div
              className="flex flex-1 flex-col overflow-hidden rounded-lg bg-white ring-1 ring-white/10 lg:[@media(min-height:860px)]:min-h-0"
              style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}
            >
              <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-[#f1f3f4] px-4">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <div className="h-2 w-2 rounded-full bg-yellow-400" />
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <div
                  key={`url-${index}`}
                  className="mx-auto flex h-4 w-2/3 items-center justify-center rounded-sm bg-white px-2 text-[9px] text-gray-500 animate-fade-in sm:w-1/2"
                  style={{ fontFamily: sans }}
                >
                  {slide.urlBar}
                </div>
              </div>
              <div className="relative flex-1 lg:[@media(min-height:860px)]:min-h-0">
                <img
                  key={`img-${index}`}
                  src={slide.image}
                  alt={slide.label}
                  loading="lazy"
                  className="block h-full w-full bg-white object-contain object-center animate-fade-in lg:[@media(min-height:860px)]:absolute lg:[@media(min-height:860px)]:inset-0"
                />
              </div>
            </div>

            <div key={`cap-${index}`} className="market-gap-caption mt-4 flex min-h-[40px] items-start animate-fade-in sm:mt-5">
              <p className="w-full text-left text-[12px] leading-snug text-white/75 sm:text-[13px]" style={{ fontFamily: sans }}>
                <span className="mr-1.5 font-bold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: CYAN }}>
                  Milestone {slide.num}:
                </span>
                <span>{slide.imageCaption}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== HELLO / NOTE ================== */

function HelloSection() {
  const muted = "rgba(17,35,55,0.75)";
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const calendlyRootRef = useRef<HTMLDivElement>(null);

  return (
    <section id="note" className="relative flex w-full flex-col bg-white">
      <div className="w-full px-5 py-8 sm:px-8 sm:py-14 md:px-14 md:py-20 lg:px-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Portrait */}
          <div className="hidden lg:col-span-5 lg:block">
            <div
              className="mx-auto max-w-sm overflow-hidden rounded-2xl sm:max-w-md lg:max-w-none"
              style={{ boxShadow: "0 30px 60px -20px rgba(17,35,55,0.25)" }}
            >
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "rgba(17,35,55,0.10)" }}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: CYAN_DEEP }}>
                <Radio size={14} /> The Walkthrough
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px]" style={{ color: muted }}>
                {[
                  "Free · 30 minutes",
                  "A conversation, not a pitch",
                  "See how the pieces connect",
                  "Decide if it deserves to move into execution",
                ].map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <Check size={14} color={CYAN_DEEP} className="mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2 className="font-black leading-[0.98] tracking-tight" style={{ color: NAVY, fontSize: "clamp(30px, 3.8vw, 52px)" }}>
              A note from <span style={{ color: CYAN_DEEP }}>Tai</span>
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: CYAN }} />

            <div className="mt-6 overflow-hidden rounded-2xl lg:hidden" style={{ boxShadow: "0 20px 40px -20px rgba(17,35,55,0.25)" }}>
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 space-y-4 text-[14px] leading-[1.75] sm:mt-8 sm:space-y-5 sm:text-[15px]" style={{ color: muted }}>
              <p>Hello,</p>
              <p>PTT Anywhere is not trying to create value from scratch.</p>
              <p>
                The products, pricing, industry knowledge, documents, and contact paths already exist. The website also ranks for
                relevant PTT and Motorola searches.
              </p>
              <p>The opportunity is to make that depth easier for buyers to find, understand, compare, and act on.</p>
              <p>
                A buyer should not need to open several product pages and technical documents before understanding whether the team
                needs radios, mobile apps, Dispatch, SafeGuard, or a mixed setup.
              </p>
              <p>This roadmap creates a clearer path:</p>
              <ul className="ml-4 list-disc space-y-1.5 pl-4">
                <li>buyer education attracts companies earlier</li>
                <li>industry pages show how products fit real work environments</li>
                <li>the Product Advisor recommends a starting setup</li>
                <li>the Quote Builder captures clearer requirements</li>
                <li>lead qualification improves follow-up</li>
                <li>the dashboard shows what demand is revealing</li>
              </ul>
              <p>The recommended first move is the Search Visibility and Buyer Education Engine.</p>
              <p>
                It uses product knowledge PTT Anywhere already owns to create more entry points through search, comparison pages,
                buyer guides, and social content.
              </p>
              <p>From there, the industry pages and Product Advisor turn attention into clearer buying decisions.</p>
              <p>This is not a generic website redesign.</p>
              <p>
                It is a plan to turn the existing website into a stronger search, buyer-guidance, and sales-intelligence system.
              </p>
              <p>
                Each milestone can be implemented and measured. Together, they can help PTT Anywhere attract more qualified buyers
                and turn more website activity into quotes, demos, and sales conversations.
              </p>
            </div>

            <img
              src={signatureTai.url}
              alt="Signature"
              loading="lazy"
              className="mt-6 h-auto w-36 max-w-[28%] object-contain sm:w-40 md:w-44 lg:w-48"
            />

            <div
              className="mt-8 rounded-xl border p-5 sm:p-6"
              style={{ borderColor: "rgba(17,35,55,0.10)", background: "rgba(39,185,255,0.08)" }}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: CYAN_DEEP }}>
                Ready to See the Full Roadmap?
              </div>
              <p className="mt-2 text-[14px] leading-[1.6]" style={{ color: NAVY }}>
                In 30 minutes, I will walk you through the milestones and answer your questions.
              </p>

              <div ref={calendlyRootRef} className="mt-5">
                <button
                  type="button"
                  onClick={() => setIsCalendlyOpen(true)}
                  className="group inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-md px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(39,185,255,0.65)] sm:gap-3 sm:px-7 sm:py-4 sm:text-[12.5px] sm:tracking-[0.16em]"
                  style={{ backgroundColor: CYAN, color: NAVY }}
                >
                  <Calendar className="h-4 w-4" />
                  Book the Roadmap Walkthrough
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
                <div className="mt-2 text-[10.5px] font-medium uppercase tracking-[0.18em]" style={{ color: "rgba(17,35,55,0.55)" }}>
                  Free · 30 minutes · No pitch
                </div>

                {calendlyRootRef.current && (
                  <PopupModal
                    url="https://calendly.com/taishobajo/strategy_and_clarity_session"
                    rootElement={calendlyRootRef.current}
                    open={isCalendlyOpen}
                    onModalClose={() => setIsCalendlyOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
