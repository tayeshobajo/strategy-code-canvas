import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Layers,
  Search,
  Gauge,
  BookOpen,
  Plug,
  BarChart3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Compass,
} from "lucide-react";
import { PopupModal } from "react-calendly";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { RoadmapDeckTracking } from "@/components/clients/RoadmapDeckTracking";
import taiPortraitAsset from "@/assets/clients/spartan/tai-portrait.png.asset.json";
import signatureTaiAsset from "@/assets/clients/spartan/signature-tai.png.asset.json";
import rollickLogoAsset from "@/assets/clients/rollick/rollick-logo.png.asset.json";
import rollickLogoLightAsset from "@/assets/clients/rollick/rollick-logo-light.png.asset.json";
import rollickDealershipAsset from "@/assets/clients/rollick/rollick-dealership.jpg.asset.json";
import m1DiagnosticAsset from "@/assets/clients/rollick/rollick-m1-diagnostic.png.asset.json";
import m2SearchAsset from "@/assets/clients/rollick/rollick-m2-search.png.asset.json";
import m3DemoAsset from "@/assets/clients/rollick/rollick-m3-demo.png.asset.json";
import m4ContentAsset from "@/assets/clients/rollick/rollick-m4-content.png.asset.json";
import m5DashboardAsset from "@/assets/clients/rollick/rollick-m5-dashboard.png.asset.json";
import rollickLogoHeader from "@/assets/clients/rollick/rollick-logo-header.png.asset.json";
import { SectionSlider } from "@/components/clients/rollick/SectionSlider";
import { SideNav } from "@/components/clients/rollick/SideNav";

const taiPortrait = taiPortraitAsset;
const signatureTai = signatureTaiAsset;
const rollickLogo = rollickLogoAsset.url;
const rollickLogoLight = rollickLogoLightAsset.url;
const rollickDealership = rollickDealershipAsset.url;
const m1Diagnostic = m1DiagnosticAsset.url;
const m2Search = m2SearchAsset.url;
const m3Demo = m3DemoAsset.url;
const m4Content = m4ContentAsset.url;
const m5Dashboard = m5DashboardAsset.url;

const NAVY = "#132A4C";
const ORANGE = "#F26522";
const ORANGE_DEEP = "#D24E12";

const CANONICAL = "https://trusttai.com/clients/rollick";

export const Route = createFileRoute("/clients/rollick")({
  head: () => ({
    meta: [
      { title: "Rollick Revenue Intelligence Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A revenue intelligence roadmap for Rollick: help OEMs and dealers discover Rollick earlier, understand where revenue is slipping, and enter demos with better context.",
      },
      { property: "og:title", content: "Rollick Revenue Intelligence Roadmap" },
      {
        property: "og:description",
        content:
          "A revenue intelligence roadmap for Rollick: stronger discovery, better-qualified demos, and clearer revenue opportunities across 150+ OEMs and thousands of dealers.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: m1DiagnosticAsset.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: m1DiagnosticAsset.url },
    ],
    links: [
      { rel: "canonical", href: CANONICAL },
      { rel: "preload", as: "image", href: rollickLogoHeader.url },
    ],
  }),
  component: RollickRoadmap,
});

function RollickRoadmap() {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RoadmapDeckTracking slug="rollick" />
      <main
        id="main"
        className="rollick-deck relative w-full"
        style={{
          backgroundColor: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          color: NAVY,
        }}
      >
        <SectionSlider>
          <PointASection />
          <MilestonesSection />
          <HelloSection isCalendlyOpen={isCalendlyOpen} setIsCalendlyOpen={setIsCalendlyOpen} />
        </SectionSlider>
        <SideNav />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ================== BRAND MARK ================== */

function RollickLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center" aria-label="Rollick">
      <img src={light ? rollickLogoLight : rollickLogo} alt="Rollick" className="h-7 w-auto sm:h-8" />
    </div>
  );
}

/* ================== POINT A ================== */

function PointASection() {
  const muted = "rgba(19,42,76,0.75)";
  const helvetica = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  const stats: { value: string; label: string }[] = [
    { value: "25", label: "Authority Score" },
    { value: "180", label: "Estimated organic traffic" },
    { value: "239", label: "Organic keywords" },
    { value: "36%", label: "Traffic share" },
    { value: "675", label: "Referring domains" },
    { value: "3.1K", label: "Backlinks" },
    { value: "31", label: "AI Visibility" },
    { value: "51", label: "AI mentions" },
    { value: "27", label: "AI-cited pages" },
  ];

  const capabilities = [
    "lead management",
    "marketing automation",
    "customer engagement",
    "business intelligence",
    "digital retailing",
    "inventory marketing",
    "marketplace visibility",
    "integrations",
  ];

  const foundation = [
    "GoRollick Marketplace and AdDriver",
    "customer and partner proof",
    "an established Insights library",
    "articles, case studies, webinars, and white papers",
    "a product Knowledge Base",
    "a simple demo path",
  ];

  const intentMix = [
    { label: "Informational", value: "56%" },
    { label: "Navigational", value: "25.9%" },
    { label: "Transactional", value: "14.4%" },
    { label: "Commercial", value: "3.7%" },
  ];

  const journeyGaps = [
    "the Google Business Profile is incomplete",
    "the Knowledge Base has no clear path back to the main website",
    "the demo form is simple, but its information could support smarter routing and follow-up",
  ];

  const opportunities = [
    "attract more non-branded, problem-aware searches",
    "show dealers where revenue opportunities may be slipping",
    "turn existing proof into stronger buyer-decision content",
    "preserve the simple demo experience",
    "give sales better context before follow-up",
    "reconnect the Knowledge Base with the wider product journey",
    "connect Rollick and GoRollick more effectively",
    "measure what creates buyer interest and demo demand",
  ];

  return (
    <section id="point-a" className="relative w-full overflow-hidden" style={{ backgroundColor: "#ffffff", fontFamily: helvetica }}>
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-5 py-8 sm:px-8 sm:py-10 md:px-16 md:py-12 lg:px-24 lg:py-14 xl:px-28">
        {/* Section title */}
        <div className="mb-6 text-center sm:mb-10 md:mb-12">
          <div className="mb-5 flex justify-center md:mb-6">
            <img
              src={rollickLogoHeader.url}
              alt="Rollick"
              className="h-7 w-auto sm:h-8 md:h-9"
              loading="eager"
            />
          </div>
          <div className="hidden items-center justify-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: ORANGE_DEEP }}>
              01
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(19,42,76,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(19,42,76,0.55)" }}>
              Where Rollick Stands
            </span>
          </div>
          <h2 className="mt-4 font-black leading-[0.98] tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 54px)" }}>
            <span style={{ color: ORANGE_DEEP }}>Point A:</span>
            <span style={{ color: NAVY }}>&nbsp;Current position</span>
          </h2>
          <p className="mx-auto mt-4 max-w-[720px] text-[13px] leading-[1.65]" style={{ color: muted }}>
            Rollick already has the reach and product depth. The opportunity is to make those assets work together more
            effectively.
          </p>
        </div>

        {/* Image + body */}
        <div className="grid grid-cols-1 items-stretch gap-8 sm:gap-10 md:grid-cols-[3fr_2fr] md:gap-14">
          <div className="flex">
            <div className="relative min-h-[420px] w-full overflow-hidden rounded-lg sm:min-h-[560px] md:min-h-0">
              <img
                src={rollickDealership}
                alt="Dealer and customer reviewing options in a powersports and marine showroom"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(180deg, transparent 55%, rgba(12,29,54,0.72))" }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-90">
                  150+ OEMs · Thousands of dealers
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">
                  Marketplace · Engagement · Retailing
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:gap-6">
            <p
              className="text-[20px] leading-[1.15] sm:text-[24px] md:text-[26px] lg:text-[28px]"
              style={{ color: NAVY, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}
            >
              Rollick has built a connected customer-engagement ecosystem for the recreation and equipment industry.
            </p>

            <div className="space-y-3 text-[12.5px] leading-[1.6] sm:text-[13px]" style={{ color: muted }}>
              <p className="font-semibold" style={{ color: NAVY }}>
                Rollick supports 150+ OEMs and thousands of dealers across:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "rgba(242,101,34,0.09)", color: NAVY, border: "1px solid rgba(242,101,34,0.22)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="pt-1 font-semibold" style={{ color: NAVY }}>
                The wider foundation includes:
              </p>
              <ul className="space-y-1.5">
                {foundation.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: ORANGE }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <p>
                Rollick is not only selling software. It helps customers improve lead quality, dealer follow-up, inventory
                promotion, customer engagement, marketplace demand, and OEM-to-dealer visibility.
              </p>
            </div>
          </div>
        </div>

        {/* Search position */}
        <div className="mt-10 rounded-lg border p-5 sm:p-7 md:p-8" style={{ borderColor: "rgba(19,42,76,0.10)", background: "rgba(19,42,76,0.03)" }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] sm:text-[14px]" style={{ color: ORANGE_DEEP }}>
            Current search and authority position
          </h3>
          <p className="mt-2 text-[12.5px]" style={{ color: muted }}>
            The August 6, 2026 SEMrush snapshot shows:
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-md border bg-white p-2.5" style={{ borderColor: "rgba(19,42,76,0.10)" }}>
                <div className="text-[16px] font-extrabold leading-none sm:text-[17px]" style={{ color: ORANGE_DEEP }}>
                  {s.value}
                </div>
                <div className="mt-1 text-[10px] leading-snug" style={{ color: muted }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2 md:gap-10">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: NAVY }}>
                Keyword mix
              </p>
              <div className="mt-3 space-y-2">
                {intentMix.map((m) => (
                  <div key={m.label} className="flex items-center gap-3 text-[12.5px]" style={{ color: muted }}>
                    <span className="w-[110px] shrink-0">{m.label}</span>
                    <div className="h-1.5 flex-1 rounded-full" style={{ background: "rgba(19,42,76,0.10)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: m.value, backgroundColor: ORANGE }} />
                    </div>
                    <span className="w-[46px] text-right font-semibold" style={{ color: NAVY }}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12.5px] leading-[1.6]" style={{ color: muted }}>
                Rollick already has search authority and growing AI visibility. The opportunity is to expand the small
                commercial keyword footprint, improve pages ranking outside the leading results, and connect more search
                activity to diagnostics and demos.
              </p>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: NAVY }}>
                Three practical journey gaps
              </p>
              <ul className="mt-3 space-y-2.5 text-[12.5px] leading-[1.6]" style={{ color: muted }}>
                {journeyGaps.map((g) => (
                  <li key={g} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: ORANGE_DEEP }} />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Strategic opportunity */}
        <div className="mt-8 rounded-lg border p-5 sm:p-7 md:p-8" style={{ borderColor: "rgba(242,101,34,0.25)", background: "rgba(242,101,34,0.05)" }}>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] sm:text-[14px]" style={{ color: ORANGE_DEEP }}>
            The strategic opportunity
          </h3>
          <div className="mt-4 grid gap-6 text-[13px] leading-[1.65] sm:text-[13.5px] md:grid-cols-2 md:gap-10" style={{ color: muted }}>
            <div className="space-y-3">
              <p className="font-semibold" style={{ color: NAVY }}>
                This roadmap helps Rollick:
              </p>
              <p>
                This is not a redesign. It is a plan to make Rollick’s existing digital assets work as one Revenue
                Intelligence Growth System.
              </p>
            </div>
            <ul className="space-y-2.5">
              {opportunities.map((o) => (
                <li key={o} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: ORANGE_DEEP }} />
                  <span style={{ color: NAVY }}>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== MILESTONES ================== */

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

function MilestonesSection() {
  const serif = "'Cormorant Garamond', Georgia, serif";
  const sans = "Inter, Helvetica, Arial, sans-serif";

  const slides: Slide[] = [
    {
      num: "01",
      label: "Dealer Revenue Leakage Diagnostic",
      Icon: Gauge,
      urlBar: "rollick.io/revenue-diagnostic",
      image: m1Diagnostic,
      imageCaption:
        "Dealer diagnostic: identifies the largest revenue gaps and connects them with a practical Rollick next step.",
      subtitle: (
        <>Help dealers see where revenue may be leaking before asking them to sit through a product demo.</>
      ),
      build: {
        name: "Dealer Revenue Leakage Diagnostic",
        body: (
          <>
            <p>
              Build a short interactive diagnostic around lead response, follow-up, CRM use, inventory promotion, digital
              retailing, marketplace visibility, and customer re-engagement. A dealer answers a few questions and gets a
              simple scorecard showing where they are strong, where the biggest gap sits, and what deserves attention
              first.
            </p>
            <p>
              The result points them toward the most relevant Rollick solution and gives sales the same context before the
              call. Across thousands of dealers, approved and aggregated results could also reveal which revenue gaps keep
              showing up across the network.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Turn Problems Into Pipeline",
        body: (
          <>
            Dealers arrive with a clearer need, giving sales stronger opportunities to qualify, recommend the right
            solution, and move the conversation forward.
          </>
        ),
      },
    },
    {
      num: "02",
      label: "Revenue Intelligence Content Engine",
      Icon: BookOpen,
      urlBar: "rollick.io/insights/improve-dealer-lead-quality",
      image: m4Content,
      imageCaption:
        "Content engine: Rollick’s approved knowledge turns into useful articles and social content around real buyer demand.",
      subtitle: (
        <>Meet buyers with useful answers while they are already searching for the problems Rollick solves.</>
      ),
      build: {
        name: "Revenue Intelligence Content Engine",
        body: (
          <>
            <p>
              Build a content engine trained on Rollick’s approved product knowledge, case studies, webinars, articles,
              sales questions, and industry resources. It would also use current search demand and the questions OEMs and
              dealers are asking online to draft useful blog posts and social content around topics such as dealer
              follow-up, lead quality, inventory visibility, digital retailing, marketplace demand, and customer
              re-engagement.
            </p>
            <p>
              Rollick’s team reviews and approves what gets published, so the engine learns from trusted company knowledge
              rather than producing generic content. Over time, Rollick can consistently publish around real buyer demand
              instead of guessing what the market wants to hear.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Capture Demand Earlier",
        body: (
          <>
            More visibility around high-intent buyer questions gives Rollick more chances to attract qualified OEMs,
            dealers, and partners before competitors enter the conversation.
          </>
        ),
      },
    },
    {
      num: "03",
      label: "Search & Branded Trust Foundation",
      Icon: Search,
      urlBar: "rollick.io/solutions/dealer-lead-management",
      image: m2Search,
      imageCaption:
        "Search and branded trust: a stronger foundation helps buyers discover Rollick and confirm its credibility.",
      subtitle: (
        <>Creating the right content matters less if search engines cannot confidently find, rank, and connect it to Rollick.</>
      ),
      build: {
        name: "Search & Branded Trust Foundation",
        body: (
          <>
            <p>
              Strengthen the search foundation behind Rollick and GoRollick so the right pages have a better chance of
              appearing for dealer lead management, digital retailing, inventory marketing, marketplace demand, customer
              engagement, and OEM dealer performance. That means improving priority pages, titles, internal links,
              technical search signals, and the relationship between Rollick and GoRollick in search.
            </p>
            <p>
              Then strengthen what prospects see when they search Rollick directly, including the Google Business Profile
              and other key branded results. The aim is simple: help more buyers discover Rollick through the problem,
              then find enough proof to keep considering the company.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Get Found and Trusted",
        body: (
          <>Better search coverage creates more qualified discovery, while stronger branded results give interested buyers more confidence to take the next step.</>
        ),
      },
    },
    {
      num: "04",
      label: "Intelligent Demo & Knowledge Journey",
      Icon: Plug,
      urlBar: "rollick.io/schedule-demo",
      image: m3Demo,
      imageCaption:
        "Connected journey: a demo and Knowledge Base path that keeps conversion simple while improving sales context.",
      subtitle: (
        <>Buyers should not have to repeat what they have already told Rollick just because they clicked “Book a Demo.”</>
      ),
      build: {
        name: "Intelligent Demo & Knowledge Journey",
        body: (
          <>
            <p>
              Keep the current demo form simple, but build a smarter system behind it that carries the buyer’s interest,
              source, content viewed, and diagnostic results into sales. The rep receives a short summary before following
              up, while the buyer sees a relevant case study, product page, or next step based on what brought them
              there.
            </p>
            <p>
              Extend the same thinking to the Knowledge Base by creating clear paths back to relevant Rollick products,
              resources, and demos. Support stays useful for existing customers without becoming a dead end for prospects
              exploring the wider offering.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Turn Interest Into Better Conversations",
        body: <>Sales spends less time rediscovering the buyer’s problem and more time discussing the right Rollick solution.</>,
      },
    },
    {
      num: "05",
      label: "Revenue Opportunity Dashboard",
      Icon: BarChart3,
      urlBar: "rollick.io/revenue-dashboard",
      image: m5Dashboard,
      imageCaption:
        "Revenue dashboard: search, diagnostic, marketplace, content, and demo activity become clearer growth decisions.",
      subtitle: (
        <>
          Rollick is already generating useful signals across search, content, GoRollick, diagnostics, and demos. The
          missing piece is seeing where the signals lead to.
        </>
      ),
      build: {
        name: "Revenue Opportunity Dashboard",
        body: (
          <>
            <p>
              Build one leadership dashboard that connects the most useful data from search, AI visibility, content,
              marketplace activity, diagnostics, demos, and available sales outcomes. It should make questions such as
              “What are buyers asking about?”, “Which content creates demos?”, “Which products are gaining interest?” and
              “Where are people dropping out?” easy to answer.
            </p>
            <p>
              The dashboard would also surface recurring dealer gaps and the topics gaining momentum across the market.
              Instead of reviewing separate reports, leadership gets one place to decide what deserves more investment,
              what needs fixing, and what the team should test next.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Invest Behind Real Demand",
        body: <>Rollick can put more time and budget behind the topics, channels, and buyer needs that are actually producing sales interest.</>,
      },
    },
  ];

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  return (
    <section id="market-gap" className="relative flex w-full flex-col" style={{ backgroundColor: NAVY }}>
      {/* Section title */}
      <div className="market-gap-title w-full bg-white">
        <div className="flex flex-col items-center justify-center px-6 pt-8 pb-5 text-center sm:pt-14 sm:pb-8 md:pt-16 md:pb-10 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: ORANGE_DEEP, fontFamily: sans }}>
              02
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(19,42,76,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(19,42,76,0.55)", fontFamily: sans }}>
              The path to the next stage
            </span>
          </div>
          <h2
            className="mt-4 font-black leading-[0.98] tracking-tight sm:mt-5"
            style={{ color: NAVY, fontFamily: sans, fontSize: "clamp(34px, 4.6vw, 66px)" }}
          >
            The <span style={{ color: ORANGE_DEEP }}>milestones</span>
          </h2>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 items-start bg-white lg:grid-cols-12">
        {/* LEFT: text */}
        <div className="market-gap-left order-2 flex flex-col lg:order-1 p-6 sm:p-10 md:p-14 lg:col-span-4 lg:min-h-[calc(100dvh-180px)] lg:p-10 xl:p-14" style={{ fontFamily: sans }}>
          <div className="flex flex-1 flex-col">
            <div className="market-gap-scroll flex flex-1 flex-col pr-1 pt-5 pb-5">
              <div key={`h-${index}`} className="market-gap-header relative animate-fade-in">
                <span
                  aria-hidden
                  className="absolute left-0 -top-1 select-none text-[88px] font-black leading-none sm:-top-2 sm:text-[112px] md:-top-3 md:text-[128px]"
                  style={{ color: ORANGE_DEEP, opacity: 0.08, fontFamily: sans }}
                >
                  {slide.num}
                </span>

                <div className="relative flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: ORANGE_DEEP, fontFamily: sans }}>
                    Milestone {slide.num}
                  </span>
                  <span style={{ color: "rgba(19,42,76,0.35)" }}>·</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "rgba(19,42,76,0.55)", fontFamily: sans }}>
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
                className="market-gap-build mt-6 animate-fade-in space-y-3 text-[13.5px] leading-[1.65]"
                style={{ color: "rgba(19,42,76,0.8)", fontFamily: sans }}
              >
                {slide.build.body}
              </div>

              <div
                key={`u-${index}`}
                className="market-gap-unlock mt-5 flex animate-fade-in items-start gap-3 rounded-lg p-3"
                style={{ background: "rgba(242,101,34,0.10)" }}
              >
                <Check size={16} color={ORANGE_DEEP} strokeWidth={2.6} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: ORANGE_DEEP, fontFamily: sans }}>
                    What It Unlocks
                  </div>
                  <div className="mt-1 text-[13px] font-bold" style={{ color: NAVY, fontFamily: sans }}>
                    {slide.unlock.title}
                  </div>
                  <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: "rgba(19,42,76,0.85)", fontFamily: sans }}>
                    {slide.unlock.body}
                  </p>
                </div>
              </div>
            </div>

            {/* Nav — pinned to the same bottom position on every slide */}
            <div
              className="market-gap-nav mx-auto mt-12 inline-flex lg:mt-auto lg:pt-20 items-center justify-center gap-2 rounded-full border bg-white p-1.5 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.12)] sm:gap-3"
              style={{ borderColor: "rgba(19,42,76,0.12)" }}
            >
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous milestone"
                className="group flex h-9 w-[60px] items-center justify-center gap-1 rounded-lg border bg-white px-2 transition-all duration-200 hover:-translate-y-0.5 sm:w-[64px] sm:px-2.5"
                style={{ borderColor: "rgba(19,42,76,0.15)", color: "rgba(19,42,76,0.55)", fontFamily: sans }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden text-[10px] font-black uppercase tracking-[0.2em] sm:inline">Prev</span>
              </button>

              <span className="shrink-0 whitespace-nowrap text-center text-[12px] font-black tabular-nums tracking-[0.12em] sm:w-[48px] sm:tracking-[0.16em]" style={{ color: NAVY, fontFamily: sans }}>
                {slide.num}
                <span style={{ color: "rgba(19,42,76,0.35)" }}> / {String(total).padStart(2, "0")}</span>
              </span>

              <div className="hidden w-[100px] items-center justify-center gap-0 sm:flex">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to milestone ${i + 1}`}
                    className="flex h-1 items-center justify-center rounded-full transition-all duration-300"
                    style={{ width: 16, backgroundColor: "transparent" }}
                  >
                    <span
                      className="block h-1 rounded-full transition-all duration-300"
                      style={{ width: i === index ? 16 : 10, backgroundColor: i === index ? ORANGE : "rgba(19,42,76,0.15)" }}
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next milestone"
                className="group flex h-9 w-[60px] shrink-0 animate-[button-pulse_2s_ease-in-out_infinite] items-center justify-center gap-1 rounded-lg px-2 text-white transition-all duration-200 sm:w-[64px] sm:px-2.5"
                style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, ${ORANGE_DEEP} 100%)`, fontFamily: sans }}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.18em] sm:text-[11px] sm:tracking-[0.2em]">Next</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: mockup */}
        <div
          className="market-gap-right relative order-1 flex flex-col lg:order-2 justify-center overflow-hidden p-4 sm:p-6 md:p-8 lg:col-span-8 lg:p-10 xl:p-12"
          style={{ backgroundColor: NAVY }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(242,101,34,0.22)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(242,101,34,0.10)" }}
          />

          <div key={`q-${index}`} className="market-gap-quote relative mb-3 animate-fade-in sm:mb-4">
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: ORANGE, fontFamily: serif }}
            >
              &ldquo;
            </span>
            <p className="text-[15px] leading-[1.35] text-white sm:text-[18px] md:text-[20px] lg:text-[21px]" style={{ fontFamily: serif, fontWeight: 500 }}>
              {slide.subtitle}
            </p>
          </div>

          <div className="market-gap-mockup relative flex flex-col">
            <div
              className="flex flex-col overflow-hidden rounded-lg bg-white ring-1 ring-white/10"
              style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}
            >
              <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-[#f1f3f4] px-4">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <div className="h-2 w-2 rounded-full bg-yellow-400" />
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <div
                  key={`url-${index}`}
                  className="mx-auto flex h-4 w-2/3 animate-fade-in items-center justify-center rounded-sm bg-white px-2 text-[9px] text-gray-500 sm:w-1/2"
                  style={{ fontFamily: sans }}
                >
                  {slide.urlBar}
                </div>
              </div>
              <img
                key={`img-${index}`}
                src={slide.image}
                alt={slide.label}
                loading="lazy"
                className="block h-auto w-full animate-fade-in bg-white object-contain"
              />
            </div>

            <div key={`cap-${index}`} className="market-gap-caption mt-3 flex min-h-[40px] animate-fade-in items-start sm:mt-4">
              <p className="w-full text-left text-[12px] leading-snug text-white/75 sm:text-[13px]" style={{ fontFamily: sans }}>
                <span className="mr-1.5 font-bold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: ORANGE }}>
                  {slide.imageCaption.split(":")[0]}:
                </span>
                <span>{slide.imageCaption.split(":").slice(1).join(":").trim()}</span>
              </p>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}

/* ================== HELLO / NOTE ================== */

function HelloSection({
  isCalendlyOpen,
  setIsCalendlyOpen,
}: {
  isCalendlyOpen: boolean;
  setIsCalendlyOpen: (open: boolean) => void;
}) {
  const muted = "rgba(19,42,76,0.75)";
  const calendlyRootRef = useRef<HTMLDivElement>(null);

  return (
    <section id="note" className="relative flex w-full flex-col bg-white">
      <div className="w-full px-5 py-8 sm:px-8 sm:py-14 md:px-14 md:py-20 lg:px-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Portrait */}
          <div className="hidden lg:col-span-5 lg:block">
            <div
              className="mx-auto max-w-sm overflow-hidden rounded-2xl sm:max-w-md lg:max-w-none"
              style={{ boxShadow: "0 30px 60px -20px rgba(19,42,76,0.25)" }}
            >
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "rgba(19,42,76,0.10)" }}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: ORANGE_DEEP }}>
                <Compass size={14} /> The Walkthrough
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px]" style={{ color: muted }}>
                {[
                  "20–30 minutes · No pitch",
                  "A conversation, not a pitch",
                  "See how the milestones connect",
                  "Decide if it deserves to move into execution",
                ].map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <Check size={14} color={ORANGE_DEEP} className="mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          <div className="lg:col-span-7">
            <h2 className="font-black leading-[0.98] tracking-tight" style={{ color: NAVY, fontSize: "clamp(30px, 3.8vw, 52px)" }}>
              A note from <span style={{ color: ORANGE_DEEP }}>Tai</span>
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: ORANGE }} />

            <div className="mt-6 overflow-hidden rounded-2xl lg:hidden" style={{ boxShadow: "0 20px 40px -20px rgba(19,42,76,0.25)" }}>
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 space-y-4 text-[14px] leading-[1.75] sm:mt-8 sm:space-y-5 sm:text-[15px]" style={{ color: muted }}>
              <p>Hello,</p>
              <p>Rollick already serves 150+ OEMs and thousands of dealers.</p>
              <p>That reach reflects years of product development, partnerships, industry trust, and customer knowledge.</p>
              <p>The products, marketplace, content, proof, Knowledge Base, and demo path already exist.</p>
              <p>The opportunity is to make more of that foundation useful:</p>
              <ul className="ml-4 list-disc space-y-1.5 pl-4">
                <li>useful to buyers researching dealer and OEM challenges</li>
                <li>useful to sales before the first conversation</li>
                <li>useful to customers exploring more of Rollick’s products</li>
                <li>useful to leadership deciding what deserves attention next</li>
              </ul>
              <p>
                The Dealer Revenue Leakage Diagnostic is a strong first move because it creates value on both sides.
              </p>
              <p>
                Dealers receive a clearer view of where sales opportunities may be slipping. Rollick receives better context
                for sales conversations and, over time, a more consistent view of the needs appearing across its network.
              </p>
              <p>
                The remaining milestones strengthen how buyers discover Rollick, understand its value, move through the
                website, and enter demo conversations.
              </p>
              <p>This is not a generic website redesign.</p>
              <p>
                It is a practical plan to turn Rollick’s reach across 150+ OEMs and thousands of dealers into a stronger
                Revenue Intelligence Growth System.
              </p>
              <p>Each milestone can be scoped, implemented, tested, and measured.</p>
            </div>

            <img src={signatureTai.url} alt="Signature" loading="lazy" className="mt-6 h-auto w-36 max-w-[28%] object-contain sm:w-40 md:w-44 lg:w-48" />

            <div className="mt-8 rounded-xl border p-5 sm:p-6" style={{ borderColor: "rgba(242,101,34,0.25)", background: "rgba(242,101,34,0.06)" }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: ORANGE_DEEP }}>
                Ready to Explore the First Move?
              </div>
              <p className="mt-2 text-[14px] leading-[1.6]" style={{ color: NAVY }}>
                In 20–30 minutes, I will walk you through the roadmap, explain how the milestones connect, and answer your
                questions. A conversation, not a pitch.
              </p>

              <div ref={calendlyRootRef} className="mt-5">
                <button
                  type="button"
                  onClick={() => setIsCalendlyOpen(true)}
                  className="group inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(242,101,34,0.6)] sm:gap-3 sm:px-7 sm:py-4 sm:text-[12.5px] sm:tracking-[0.16em]"
                  style={{ background: `linear-gradient(90deg, ${ORANGE} 0%, ${ORANGE_DEEP} 100%)` }}
                >
                  <Calendar className="h-4 w-4" />
                  Book the Roadmap Walkthrough
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
                <div className="mt-2 text-[10.5px] font-medium uppercase tracking-[0.18em]" style={{ color: "rgba(19,42,76,0.55)" }}>
                  20–30 minutes · No pitch
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
