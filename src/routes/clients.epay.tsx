import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Network,
  Layers,
  BookOpen,
  Radar,
  Search,
  Gauge,
  Route as RouteIcon,
  Calculator,
  Plug,
  MessagesSquare,
  BarChart3,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Shield,
  
} from "lucide-react";
import { PopupModal } from "react-calendly";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import taiPortrait from "@/assets/clients/spartan/tai-portrait.png.asset.json";
import signatureTai from "@/assets/clients/spartan/signature-tai.png.asset.json";
import epayEagleAsset from "@/assets/clients/epay/epay-eagle-clean.png.asset.json";
import epayOffice from "@/assets/clients/epay/epay-team-booth-2.png.asset.json";
import gapSearch from "@/assets/clients/epay/epay-gap-search-v3.png.asset.json";
import gapPaymentMaturity from "@/assets/clients/epay/epay-payment-maturity-results.png.asset.json";
import gapJourneyArchitect from "@/assets/clients/epay/epay-gap-journey-architect.png.asset.json";
import gapAdvisor from "@/assets/clients/epay/epay-gap-advisor-v3.png.asset.json";
import gapMarketSignals from "@/assets/clients/epay/epay-gap-analytics-sales-intelligence.png.asset.json";
import gapAnalyticsSalesIntelligence from "@/assets/clients/epay/epay-gap-analytics-sales-intelligence.png.asset.json";
import gapContent from "@/assets/clients/epay/epay-gap-content-engine-dashboard.png.asset.json";
import integrationHub from "@/assets/clients/epay/epay-integration-intelligence-hub.png.asset.json";
import paymentEconomicsLab from "@/assets/clients/epay/epay-payment-economics-lab.png.asset.json";
import epayLogo from "@/assets/clients/epay/epay-logo.png.asset.json";
import { SectionSlider } from "@/components/clients/epay/SectionSlider";
import { SideNav } from "@/components/clients/epay/SideNav";

const epayEagle = epayEagleAsset.url;

const NAVY = "#0B2545";
const TEAL = "#2E9C82";
const TEAL_DEEP = "#0D705B";

const CANONICAL = "https://trusttai.com/clients/epay";

export const Route = createFileRoute("/clients/epay")({
  head: () => ({
    meta: [
      { title: "ePayPolicy Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A growth roadmap for ePayPolicy: help more insurance organisations find the platform, understand their fit, and use more of it across collections, financing, payables, and reconciliation.",
      },
      { property: "og:title", content: "ePayPolicy Roadmap: Turning Trust Into Demand, Fit, and Adoption" },
      {
        property: "og:description",
        content:
          "Turn ePayPolicy's product depth into earlier discovery, guided product decisions, wider customer adoption, and better sales intelligence.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ePayPolicy Roadmap | Trust Tai" },
      {
        name: "twitter:description",
        content:
          "Turn ePayPolicy's product depth into earlier discovery, guided product decisions, wider customer adoption, and better sales intelligence.",
      },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: EpayRoadmap,
});

function EpayRoadmap() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="epay-deck relative w-full"
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
    </>
  );
}

/* ================== BRAND MARK ================== */


function EpayLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center" aria-label="ePayPolicy">
      <img
        src={epayLogo.url}
        alt="ePayPolicy"
        className="h-8 w-auto"
        style={light ? { filter: "brightness(0) invert(1)" } : undefined}
      />
    </div>
  );
}


/* ================== HERO ================== */

function HeroSection() {
  const cards = [
    { Icon: Search, title: "Reach Buyers", desc: "Appear when insurance organisations search by payment problem, workflow, or solution need." },
    { Icon: RouteIcon, title: "Guide The Choice", desc: "Help visitors identify the right product, integration, or next step." },
    { Icon: Layers, title: "Expand Adoption", desc: "Show existing customers where ePayPolicy could support more of their operation." },
    { Icon: BarChart3, title: "Learn From Demand", desc: "Turn searches, questions, assessments, and tool activity into business insight." },
  ];

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ backgroundColor: NAVY, color: "#fff" }}
    >
      {/* Background image, blended */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${epayHero})`,
          backgroundSize: "cover",
          backgroundPosition: "right center",
          filter: "saturate(0.75) brightness(0.6)",
          opacity: 0.5,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, #0B2545 0%, rgba(11,37,69,0.92) 45%, rgba(11,37,69,0.55) 78%, rgba(11,37,69,0.25) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle 620px at 72% 55%, rgba(13,112,91,0.28), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1400px] flex-col px-5 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 lg:px-16 xl:px-20">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4">
          <EpayLogo light />
          <div className="text-right">
            <p
              className="text-[8px] font-semibold uppercase tracking-[0.32em]"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Prepared by
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white sm:text-[11px]">
              Trust Tai
            </p>
          </div>
        </div>

        {/* Eyebrow */}
        <div className="mt-14 flex items-center gap-3 sm:mt-18">
          <div className="h-[2px] w-10 sm:w-12" style={{ backgroundColor: TEAL }} />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Growth Roadmap · ePayPolicy
          </span>
        </div>

        {/* Headline */}
        <div className="mt-7 max-w-[900px] space-y-6 sm:mt-9">
          <h1
            className="font-black leading-[1.05] tracking-tight text-white"
            style={{ fontSize: "clamp(28px, 3.6vw, 58px)" }}
          >
            <span style={{ color: TEAL }}>10,000+ insurance organisations</span> already trust ePayPolicy. This roadmap helps more buyers find the right solution and helps existing customers discover more of the platform.
          </h1>
          <div className="max-w-[600px] space-y-3">
            <p
              className="text-[12px] leading-relaxed sm:text-[13.5px]"
              style={{ color: "rgba(255,255,255,0.82)" }}
            >
              ePayPolicy already has the products, integrations, expertise, and market trust.
            </p>
            <p
              className="text-[12px] leading-relaxed sm:text-[13.5px]"
              style={{ color: "rgba(255,255,255,0.82)" }}
            >
              The next opportunity is to connect those assets into a clearer system for discovery,
              buyer guidance, customer expansion, and sales intelligence.
            </p>
          </div>

          {/* Tagline row */}
          <div className="flex items-center gap-3 pt-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(13,112,91,0.15)", border: "1px solid rgba(13,112,91,0.4)" }}
            >
              <Shield size={13} color={TEAL} strokeWidth={2} />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white sm:text-[12px]">
              Found earlier. Understood faster. Chosen with confidence. Used more fully.
            </span>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-start gap-3 pt-4 sm:flex-row sm:items-center sm:gap-5">
            <a
              href="#note"
              className="group inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all duration-200 hover:gap-3"
              style={{ backgroundColor: TEAL, color: NAVY }}
            >
              <Calendar size={14} strokeWidth={2.2} />
              Book the Roadmap Walkthrough
              <ArrowRight size={14} strokeWidth={2.2} />
            </a>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
              Free · 30 minutes · Zoom · No pitch
            </span>
          </div>
        </div>

        {/* Bottom 4-card outcome panel */}
        <div className="mt-auto pt-10 sm:pt-14">
          <div
            className="grid grid-cols-1 gap-x-4 gap-y-4 rounded-2xl px-5 py-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 sm:px-6 sm:py-6 md:grid-cols-4 md:gap-x-6"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(8px)",
            }}
          >
            {cards.map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2.5 sm:gap-3">
                <Icon size={18} color={TEAL} strokeWidth={1.8} className="mt-0.5 shrink-0 sm:h-[20px] sm:w-[20px]" />
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase leading-tight tracking-[0.12em] text-white sm:text-[10.5px] sm:tracking-[0.14em]">
                    {title}
                  </div>
                  <p className="mt-1 text-[10px] leading-snug sm:text-[10.5px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

/* ================== POINT A ================== */

function PointASection() {
  const muted = "rgba(11,37,69,0.75)";
  const helvetica = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const stats: { value: string; label: string }[] = [
    { value: "10,000+", label: "Insurance organisations" },
    { value: "30+", label: "Integrations" },
    { value: "4.5K", label: "Monthly organic visits" },
    { value: "2.6K", label: "Ranking keywords" },
    { value: "3.3K", label: "Referring domains" },
    { value: "864.9K", label: "Backlinks" },
    { value: "97 / 99", label: "AI mentions across 99 cited pages" },
  ];


  const opportunities = [
    "Reach buyers earlier in their research",
    "Clarify which products and integrations fit each workflow",
    "Help customers discover additional capabilities",
    "Give sales better context before the first conversation",
    "Identify which questions, tools, and topics create demand",
  ];

  return (
    <section
      id="point-a"
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: "#ffffff", fontFamily: helvetica }}
    >
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-5 py-8 sm:px-8 sm:py-10 md:px-16 md:py-12 lg:px-24 lg:py-14 xl:px-28">
        {/* Top: brand mark */}
        <div className="mb-8 flex items-center justify-center sm:mb-10">
          <img
            src={epayLogo.url}
            alt="ePayPolicy"
            className="h-12 w-auto sm:h-14 md:h-16"
            style={{ fontFamily: helvetica }}
          />
        </div>
        {/* Top: section title */}
        <div className="mb-6 text-center sm:mb-10 md:mb-12">
          <div className="hidden items-center justify-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: TEAL_DEEP, fontFamily: helvetica }}>
              01
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(11,37,69,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(11,37,69,0.55)", fontFamily: helvetica }}>
              Where ePayPolicy Stands
            </span>
          </div>
          <h2
            className="mt-4 font-black leading-[0.98] tracking-tight"
            style={{ fontSize: "clamp(28px, 4vw, 54px)" }}
          >
            <span style={{ color: TEAL_DEEP }}>Point A:</span>
            <span style={{ color: NAVY }}>&nbsp;Current position</span>
          </h2>
        </div>

        {/* Middle: image on left, body on right — image stretches to match right column height */}
        <div className="grid grid-cols-1 items-stretch gap-8 sm:gap-10 md:grid-cols-[3fr_2fr] md:gap-14">
          {/* Left: featured image — matches right column height */}
          <div className="flex">
            <div className="relative w-full min-h-[420px] sm:min-h-[560px] md:min-h-0 overflow-hidden rounded-lg">
              <img
                src={epayOffice.url}
                alt="ePayPolicy team at their trade show booth"
                className="h-full w-full absolute inset-0 object-cover object-top"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: "linear-gradient(180deg, transparent 55%, rgba(11,37,69,0.6))",
                }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-90" style={{ fontFamily: helvetica }}>
                  10,000+ insurance organisations
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70" style={{ fontFamily: helvetica }}>
                  Payments · Financing · Reconciliation
                </div>
              </div>
            </div>
          </div>

          {/* Right: subtitle + copy + stats */}
          <div className="flex flex-col gap-5 sm:gap-6">
            <p
              className="text-[20px] leading-[1.15] sm:text-[24px] md:text-[26px] lg:text-[28px]"
              style={{
                color: NAVY,
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 500,
              }}
            >
              ePayPolicy has developed a broad insurance-payment ecosystem.
            </p>

            <div
              className="space-y-3 text-[12.5px] leading-[1.6] sm:text-[13px]"
              style={{ color: muted, fontFamily: helvetica }}
            >
              <p>
                More than 10,000 insurance organisations use ePayPolicy across collections, premium
                financing, checks, quotes and invoices, payables, integrations, reconciliation, and
                payment visibility.
              </p>
              <p className="font-semibold" style={{ color: NAVY }}>
                The foundation is strong:
              </p>
            </div>

            {/* Stats — compact */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-md border p-2.5"
                  style={{ borderColor: "rgba(11,37,69,0.10)", background: "rgba(13,112,91,0.05)" }}
                >
                  <div className="text-[16px] font-extrabold leading-none sm:text-[17px]" style={{ color: TEAL_DEEP, fontFamily: helvetica }}>
                    {s.value}
                  </div>
                  <div className="mt-1 text-[10px] leading-snug" style={{ color: muted, fontFamily: helvetica }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="space-y-3 text-[12.5px] leading-[1.6] sm:text-[13px]"
              style={{ color: muted, fontFamily: helvetica }}
            >
              <p>
                Of those backlinks, 821,890 use the phrase “make a payment.”
              </p>
              <p>
                This shows strong trust and visibility at the point where money moves. The
                opportunity is to reach buyers earlier, before they know the ePayPolicy name, and
                help existing customers understand what else the platform can support.
              </p>
            </div>
          </div>
        </div>

        {/* Full-width strategic opportunity block */}
        <div
          className="mt-10 rounded-lg border p-5 sm:p-7 md:p-8"
          style={{ borderColor: "rgba(11,37,69,0.10)", background: "rgba(11,37,69,0.03)" }}
        >
          <h3
            className="text-[13px] font-bold uppercase tracking-[0.18em] sm:text-[14px]"
            style={{ color: TEAL_DEEP, fontFamily: helvetica }}
          >
            The strategic opportunity
          </h3>
          <div
            className="mt-4 grid gap-6 text-[13px] leading-[1.65] sm:text-[13.5px] md:grid-cols-2 md:gap-10"
            style={{ color: muted, fontFamily: helvetica }}
          >
            <div className="space-y-3">
              <p className="font-semibold" style={{ color: NAVY }}>
                This roadmap helps ePayPolicy:
              </p>
              <p>
                The goal is to make ePayPolicy easier to find, understand, and choose.
              </p>
            </div>
            <ul className="space-y-2.5">
              {opportunities.map((o) => (
                <li key={o} className="flex gap-3">
                  <span
                    className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: TEAL_DEEP }}
                  />
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

function Hl({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}



/* ================== MILESTONES (7 slides) ================== */

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
      label: "Integration Intelligence Hub",
      Icon: Plug,
      urlBar: "epaypolicy.com/integrations",
      image: integrationHub.url,
      imageCaption:
        "The Integration Intelligence Hub shows which ePayPolicy connections fit each system and workflow.",
      subtitle: (
        <>
          An integration logo proves the connection. Buyers still need to understand what it can do
          for them.
        </>
      ),
      build: {
        name: "Integration Intelligence Hub",
        body: (
          <>
            <p>
              Turn the current integrations page into a searchable hub that explains how each
              connection works in real life. Buyers can filter by their system, organisation type,
              payment workflow, product need, or operational goal.
            </p>
            <p>
              Each integration gets a useful profile with the right ePayPolicy products, guides, and
              customer examples around it. If the connection they need is missing, they can request
              it, giving ePayPolicy a clearer view of what the market wants next.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Make integration fit clear",
        body: (
          <>
            Buyers understand how ePayPolicy works with their existing systems, while missing
            integration demand becomes visible to the business.
          </>
        ),
      },
    },
    {
      num: "02",
      label: "ePayPolicy Payments Advisor",
      Icon: MessagesSquare,
      urlBar: "epaypolicy.com/payments-advisor",
      image: gapAdvisor.url,
      imageCaption:
        "A guided experience helps visitors find the right ePayPolicy product, integration, resource, or conversation.",
      subtitle: (
        <>A useful sales conversation should not have to wait for office hours.</>
      ),
      build: {
        name: "ePayPolicy Payments Advisor",
        body: (
          <>
            <p>
              Build an AI payment advisor that feels like speaking with someone who knows ePayPolicy
              inside out. Visitors start the conversation naturally, and the advisor keeps it moving
              with simple follow-up questions as it learns what they need and what they are trying
              to solve.
            </p>
            <p>
              It stays available after hours, guides them towards the right ePayPolicy solution or
              next step, and gives sales the conversation context when a person needs to take over.
              It works only from approved ePayPolicy knowledge and stays away from private account
              or compliance decisions.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Find the right path",
        body: (
          <>
            New buyers identify the right starting point. Existing customers discover additional
            products or integrations that may support their operation.
          </>
        ),
      },
    },
    {
      num: "03",
      label: "Payment Journey Architect",
      Icon: RouteIcon,
      urlBar: "epaypolicy.com/payment-journey",
      image: gapJourneyArchitect.url,
      imageCaption:
        "An interactive tool maps the visitor's payment journey and shows where ePayPolicy fits.",
      subtitle: <>A product menu explains what exists, not what fits.</>,
      build: {
        name: "Payment Journey Architect",
        body: (
          <>
            <p>
              Create an interactive, visual tool that begins with the visitor rather than the
              product menu. The buyer answers a few questions about their organisation, current
              systems, and how payments work today.
            </p>
            <p>
              The tool maps that journey and shows where ePayPolicy could fit, with the right
              products, integrations, guides, and customer examples along the way. New buyers get a
              clearer place to start, while current customers can see what else could make their
              payment work easier.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Show how it works",
        body: (
          <>
            Buyers see how ePayPolicy fits their process before booking a call, while sales receives
            clearer workflow context.
          </>
        ),
      },
    },
    {
      num: "04",
      label: "Payment Economics Lab",
      Icon: Calculator,
      urlBar: "epaypolicy.com/lab/payment-economics-lab",
      image: paymentEconomicsLab.url,
      imageCaption:
        "A practical calculator turns payment-workflow inputs into a clear estimate and recommended next step.",
      subtitle: <>Payment friction gets attention when it becomes a number.</>,
      build: {
        name: "Payment Economics Lab",
        body: (
          <>
            <p>
              Expand ePayPolicy's current savings calculator into a practical suite of tools for
              checks, reconciliation, failed payments, payment delays, labour, receivables, and
              payables. Buyers enter a few simple figures and see what the current process may be
              costing them.
            </p>
            <p>
              The result highlights the biggest source of wasted time or cash flow and points to the
              ePayPolicy solution most relevant to it. Every calculation uses clear assumptions, so
              the result is credible enough to take into a budget or change conversation.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Make the cost clear",
        body: (
          <>
            Decision-makers enter the conversation with an estimate, a clearer priority, and a
            stronger reason to act.
          </>
        ),
      },
    },
    {
      num: "05",
      label: "ePayPolicy Content Engine",
      Icon: BookOpen,
      urlBar: "epaypolicy.com/content-engine",
      image: gapContent.url,
      imageCaption:
        "A content engine turning approved ePayPolicy knowledge into useful, search-ready buyer education.",
      subtitle: (
        <>
          ePayPolicy already has the knowledge. The engine turns it into content buyers are already
          looking for.
        </>
      ),
      build: {
        name: "ePayPolicy Content Engine",
        body: (
          <>
            <p>
              Build a content engine around the knowledge ePayPolicy already has. It uses current
              Google and AI search demand to spot what insurance buyers are asking, then turns those
              opportunities into useful articles, guides, product pages, FAQs, tutorials, and social
              content.
            </p>
            <p>
              Everything starts from approved ePayPolicy information, and the team stays in control
              of what gets published. As the engine learns from those approvals, useful content can
              keep moving with less manual work.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Publish what buyers need",
        body: (
          <>
            ePayPolicy can answer important questions earlier while reducing disconnected research
            and repetitive content work.
          </>
        ),
      },
    },
    {
      num: "06",
      label: "Search Foundation for New Buyers",
      Icon: Search,
      urlBar: "epaypolicy.com/search-foundation",
      image: gapSearch.url,
      imageCaption:
        "Protecting ePayPolicy's existing authority while opening more search paths for new buyers.",
      subtitle: (
        <>
          ePayPolicy already has reach. Too little of it is coming from buyers searching for help.
        </>
      ),
      build: {
        name: "Search Foundation for New Buyers",
        body: (
          <>
            <p>
              Strengthen the search foundation behind the reach ePayPolicy already has. Thousands of
              searches already lead to the site, but relatively little of that traffic comes from
              people actively looking for help with payments, reconciliation, integrations, or
              workflow problems.
            </p>
            <p>
              Fix the issues holding useful pages back, protect private pages and existing
              authority, and strengthen the pages around what buyers are already searching for. The
              aim is to help more prospects find ePayPolicy before they know to search for
              ePayPolicy.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Get found earlier",
        body: (
          <>
            More insurance organisations can discover ePayPolicy while researching a payment
            problem, not only after they know the brand.
          </>
        ),
      },
    },
    {
      num: "07",
      label: "Payment Operations Assessment",
      Icon: Gauge,
      urlBar: "epaypolicy.com/payment-assessment",
      image: gapPaymentMaturity.url,
      imageCaption:
        "A payment operations assessment showing the organisation's biggest gap and the next capability to consider.",
      subtitle: (
        <>
          Most organisations know parts of their payment process are harder than they should be.
          They may not know where to start.
        </>
      ),
      build: {
        name: "Payment Operations Assessment",
        body: (
          <>
            <p>
              Create a simple assessment that helps an agency, MGA, carrier, or premium finance
              company see where its payment operation is working and where friction is building. A
              few practical questions create a clearer picture across collections, checks,
              reconciliation, integrations, security, and automation.
            </p>
            <p>
              The result shows where they are strongest, where the biggest problem sits, and what
              deserves attention first. It then connects that need to the most relevant ePayPolicy
              solution, resource, or next conversation.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Diagnose the gap",
        body: (
          <>
            Prospects enter sales conversations with a clearer problem. Existing customers see the
            next area ePayPolicy may help them improve.
          </>
        ),
      },
    },
    {
      num: "08",
      label: "Analytics and Sales Intelligence Dashboard",
      Icon: BarChart3,
      urlBar: "epaypolicy.com/insights",
      image: gapAnalyticsSalesIntelligence.url,
      imageCaption:
        "A connected dashboard turns search, content, tools, and buyer behaviour into practical growth decisions.",
      subtitle: (
        <>
          Search, content, tools, and demos all create signals. The dashboard shows what turns into
          qualified demand.
        </>
      ),
      build: {
        name: "Analytics and Sales Intelligence Dashboard",
        body: (
          <>
            <p>
              Build one dashboard that brings search, content, tool activity, and leads into one
              place. It shows what buyers care about, where they get stuck, and what gets them to
              act.
            </p>
            <p>
              That insight keeps the whole system learning. It tells the Content Engine what to
              create, helps the Payments Advisor guide better, sharpens sales follow-up, and shows
              leadership what to improve next.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Turn activity into decisions",
        body: (
          <>
            Marketing sees what attracts the right buyers. Sales receives better context. Leadership
            sees where the next growth investment should go.
          </>
        ),
      },
    },
  ];

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  return (
    <section
      id="market-gap"
      className="relative flex min-h-screen w-full flex-col"
      style={{ backgroundColor: NAVY }}
    >
      {/* Section title (constant) */}
      <div className="market-gap-title w-full bg-white">
        <div className="flex flex-col items-center justify-center px-6 pt-8 pb-5 text-center sm:pt-14 sm:pb-8 md:pt-16 md:pb-10 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: TEAL_DEEP, fontFamily: sans }}>
              03
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(11,37,69,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(11,37,69,0.55)", fontFamily: sans }}>
              The path to the next stage
            </span>
          </div>
          <h2
            className="mt-4 font-black leading-[0.98] tracking-tight sm:mt-5"
            style={{
              color: NAVY,
              fontFamily: sans,
              fontSize: "clamp(34px, 4.6vw, 66px)",
            }}
          >
            The <span style={{ color: TEAL_DEEP }}>milestones</span>
          </h2>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 bg-white lg:grid-cols-12">
        {/* LEFT: text */}
        <div className="market-gap-left flex flex-col p-6 sm:p-10 md:p-14 lg:col-span-5 lg:p-16 xl:p-20" style={{ fontFamily: sans }}>
          {/* Nav moved below the feature image caption */}


          <div className="flex flex-1 flex-col">
            <div key={`h-${index}`} className="market-gap-header relative animate-fade-in">
              {/* Large decorative number */}
              <span
                aria-hidden
                className="absolute left-0 -top-6 text-[88px] font-black leading-none select-none sm:-top-7 sm:text-[112px] md:-top-8 md:text-[128px]"
                style={{ color: TEAL_DEEP, opacity: 0.07, fontFamily: sans }}
              >
                {slide.num}
              </span>

              <div className="relative flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: TEAL_DEEP, fontFamily: sans }}>
                  Milestone {slide.num}
                </span>
                <span style={{ color: "rgba(11,37,69,0.35)" }}>·</span>
                <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "rgba(11,37,69,0.55)", fontFamily: sans }}>
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

            <div key={`b-${index}`} className="market-gap-build mt-6 space-y-3 text-[13.5px] leading-[1.65] animate-fade-in" style={{ color: "rgba(11,37,69,0.8)", fontFamily: sans }}>
              {slide.build.body}
            </div>

            <div
              key={`u-${index}`}
              className="market-gap-unlock mt-5 flex items-start gap-3 rounded-lg p-3 animate-fade-in"
              style={{ background: "rgba(13,112,91,0.10)" }}
            >
              <Check size={16} color={TEAL_DEEP} strokeWidth={2.6} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: TEAL_DEEP, fontFamily: sans }}>
                  What It Unlocks
                </div>
                <div className="mt-1 text-[13px] font-bold" style={{ color: NAVY, fontFamily: sans }}>
                  {slide.unlock.title}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6]" style={{ color: "rgba(11,37,69,0.85)", fontFamily: sans }}>
                  {slide.unlock.body}
                </p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <div
            className="market-gap-nav mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border bg-white p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)] sm:gap-4"
            style={{ borderColor: "rgba(11,37,69,0.12)" }}
          >
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous milestone"
              className="group flex h-11 w-[76px] items-center justify-center gap-2 rounded-xl border bg-white px-3 transition-all duration-200 hover:-translate-y-0.5 sm:w-[92px] sm:px-4"
              style={{ borderColor: "rgba(11,37,69,0.15)", color: "rgba(11,37,69,0.55)", fontFamily: sans }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden text-[11px] font-black uppercase tracking-[0.22em] sm:inline">Prev</span>
            </button>

            <span className="w-[56px] text-center text-[13px] font-black tabular-nums tracking-[0.18em] sm:w-[64px]" style={{ color: NAVY, fontFamily: sans }}>
              {slide.num}
              <span style={{ color: "rgba(11,37,69,0.35)" }}> / {String(total).padStart(2, "0")}</span>
            </span>

            <div className="hidden w-[200px] items-center justify-center gap-0 sm:flex">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Go to milestone ${i + 1}`}
                  className="flex h-1.5 w-7 items-center justify-center rounded-full transition-all duration-300"
                  style={{
                    width: 28,
                    backgroundColor: "transparent",
                  }}
                >
                  <span
                    className="block h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === index ? 28 : 16,
                      backgroundColor: i === index ? TEAL_DEEP : "rgba(11,37,69,0.15)",
                    }}
                  />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next milestone"
              className="group flex h-11 w-[76px] shrink-0 animate-[button-pulse_2s_ease-in-out_infinite] items-center justify-center gap-1.5 rounded-xl px-3 transition-all duration-200 sm:w-[92px] sm:gap-2 sm:px-5"
              style={{ backgroundColor: TEAL, color: NAVY, fontFamily: sans }}
            >
              <span className="text-[11px] font-black uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.22em]">Next</span>
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* RIGHT: mockup */}
        <div
          className="market-gap-right relative flex flex-col justify-start overflow-hidden p-6 sm:p-8 md:p-10 lg:col-span-7 lg:p-10 xl:p-12"
          style={{ backgroundColor: NAVY }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(13,112,91,0.20)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(13,112,91,0.10)" }}
          />

          <div key={`q-${index}`} className="market-gap-quote relative mb-4 animate-fade-in sm:mb-5">
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: TEAL, fontFamily: serif }}
            >
              &ldquo;
            </span>
            <p
              className="text-[15px] leading-[1.35] text-white sm:text-[18px] md:text-[20px] lg:text-[21px]"
              style={{ fontFamily: serif, fontWeight: 500 }}
            >
              {slide.subtitle}
            </p>
          </div>

          <div className="market-gap-mockup relative flex flex-1 flex-col">
            <div
              className="flex flex-col overflow-hidden rounded-lg bg-white ring-1 ring-white/10"
              style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}
            >
              <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-[#f1f3f4] px-4">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <div className="h-2 w-2 rounded-full bg-yellow-400" />
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <div
                  key={`u-${index}`}
                  className="mx-auto flex h-4 w-2/3 items-center justify-center rounded-sm bg-white px-2 text-[9px] text-gray-500 animate-fade-in sm:w-1/2"
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
                className={`block h-[42vh] min-h-[260px] w-full object-cover animate-fade-in sm:h-[46vh] sm:min-h-[320px] md:h-[50vh] md:min-h-[380px] ${index === 0 || index === 1 || index === 2 || index === 3 || index === 4 || index === 5 || index === 6 ? 'object-left' : 'object-top'}`}
              />
            </div>

            <div key={`cap-${index}`} className="market-gap-caption mt-4 flex min-h-[40px] items-start animate-fade-in sm:mt-5">
              <p className="w-full text-left text-[12px] leading-snug text-white/75 sm:text-[13px]" style={{ fontFamily: sans }}>
                <span
                  className="mr-1.5 font-bold"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: TEAL }}
                >
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

function HelloSection() {
  const muted = "rgba(11,37,69,0.75)";
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
              style={{ boxShadow: "0 30px 60px -20px rgba(11,37,69,0.25)" }}
            >
              <img
                src={taiPortrait.url}
                alt="Portrait"
                loading="lazy"
                className="block h-full w-full object-cover"
              />
            </div>

            <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "rgba(11,37,69,0.10)" }}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: TEAL_DEEP }}>
                <Shield size={14} /> The Walkthrough
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px]" style={{ color: muted }}>
                {[
                  "Free · 30 minutes · Zoom",
                  "A conversation, not a pitch",
                  "See how the pieces connect",
                  "Decide if it deserves to move into execution",
                ].map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <Check size={14} color={TEAL_DEEP} className="mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div aria-hidden="true" className="pointer-events-none relative mt-8 overflow-hidden">
              <img
                src={epayEagle}
                alt=""
                loading="lazy"
                className="block h-auto w-full translate-y-[18%] opacity-[0.28] brightness-[0.8]"
              />
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2
              className="font-black leading-[0.98] tracking-tight"
              style={{
                color: NAVY,
                fontSize: "clamp(30px, 3.8vw, 52px)",
              }}
            >
              A note from <span style={{ color: TEAL_DEEP }}>Tai</span>
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: TEAL }} />

            <div
              className="mt-6 overflow-hidden rounded-2xl lg:hidden"
              style={{ boxShadow: "0 20px 40px -20px rgba(11,37,69,0.25)" }}
            >
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div
              className="mt-6 space-y-4 text-[14px] leading-[1.75] sm:mt-8 sm:space-y-5 sm:text-[15px]"
              style={{ color: muted }}
            >
              <p>Hi Steve,</p>
              <p>
                ePayPolicy has already done the difficult work of building a widely trusted insurance-payment platform.
              </p>
              <p>
                The business now supports collections, premium financing, checks, quotes and invoices, payables, integrations, reconciliation, reporting, and APIs.
              </p>
              <p>
                The opportunity is to make that full value easier to find, understand, and use.
              </p>
              <p>
                A buyer may enter through one payment page or product and miss the wider system. An existing customer may use one capability without seeing another that could reduce work elsewhere.
              </p>
              <p>This roadmap helps insurance organisations:</p>
              <ul className="ml-4 list-disc space-y-1.5 pl-4">
                <li>identify where their payment process needs improvement</li>
                <li>find the right ePayPolicy starting point</li>
                <li>understand how products and integrations fit</li>
                <li>calculate the cost of payment friction</li>
                <li>access useful education before speaking with sales</li>
              </ul>
              <p>
                It also helps ePayPolicy learn from what buyers search for, ask about, and try to improve.
              </p>
              <p>
                Each milestone provides value independently. Together, they create a connected growth system around the platform ePayPolicy has already built.
              </p>
              <p>
                The walkthrough will show how the milestones connect, what could be implemented first, and where the strongest early opportunities sit.
              </p>
              <p>A conversation, not a pitch.</p>
            </div>

            <img
              src={signatureTai.url}
              alt="Signature"
              loading="lazy"
              className="mt-6 h-auto w-36 max-w-[28%] object-contain sm:w-40 md:w-44 lg:w-48"
            />

            <div className="mt-8 rounded-xl border p-5 sm:p-6" style={{ borderColor: "rgba(11,37,69,0.10)", background: "rgba(13,112,91,0.05)" }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: TEAL_DEEP }}>
                Ready to See the Full Roadmap?
              </div>
              <p className="mt-2 text-[14px] leading-[1.6]" style={{ color: NAVY }}>
                In 30 minutes, I will walk you through the milestones and answer your questions.
              </p>

              <div ref={calendlyRootRef} className="mt-5">
                <button
                  type="button"
                  onClick={() => setIsCalendlyOpen(true)}
                  className="group inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-md px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(13,112,91,0.55)] sm:gap-3 sm:px-7 sm:py-4 sm:text-[12.5px] sm:tracking-[0.16em]"
                  style={{ backgroundColor: TEAL, color: NAVY }}
                >
                  <Calendar className="h-4 w-4" />
                  Book the Roadmap Walkthrough
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
                <div className="mt-2 text-[10.5px] font-medium uppercase tracking-[0.18em]" style={{ color: "rgba(11,37,69,0.55)" }}>
                  Free · 30 minutes · Zoom · No pitch
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
