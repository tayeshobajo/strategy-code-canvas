import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Shield,
  ShieldCheck,
  Eye,
  TrendingUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  MapPin,
  Target,
} from "lucide-react";

import { PopupModal } from "react-calendly";

import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

import spartanLogo from "@/assets/clients/spartan/spartan-logo-new.png.asset.json";
import heroSuvSkyline from "@/assets/clients/spartan/hero-suv-skyline.jpg.asset.json";
import heroSpartanOfficer from "@/assets/clients/spartan/hero-spartan-officer.png.asset.json";
import pointABuilding from "@/assets/clients/spartan/pointA-building.png.asset.json";
import hiddenOppImg from "@/assets/clients/spartan/market-gap-google-v4.png.asset.json";
import mgServicesImg from "@/assets/clients/spartan/market-gap-services.png.asset.json";
import mgSecureAIImg from "@/assets/clients/spartan/market-gap-secureai.png.asset.json";
import mgTrustImg from "@/assets/clients/spartan/market-gap-trust.png.asset.json";
import mgContentImg from "@/assets/clients/spartan/market-gap-content.png.asset.json";
import websiteSecurityImg from "@/assets/clients/spartan/spartan-website-homepage.png.asset.json";
import taiPortrait from "@/assets/clients/spartan/tai-portrait.png.asset.json";
import signatureTai from "@/assets/clients/spartan/signature-tai.png.asset.json";
import eagleSilhouette from "@/assets/clients/spartan/eagle-silhouette.png.asset.json";

const CANONICAL = "https://trusttai.com/clients/spartan";

export const Route = createFileRoute("/clients/spartan")({
  head: () => ({
    meta: [
      { title: "Spartan Security Services — Growth Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A strategic growth roadmap for Spartan Security Services — turning existing credibility into visibility, trust, and long-term contracts in Houston.",
      },
      { property: "og:title", content: "Spartan Security Services — Growth Roadmap" },
      {
        property: "og:description",
        content: "Spartan already does the work. This is the roadmap that makes Houston see it.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: heroSpartanOfficer.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroSpartanOfficer.url },
    ],
    links: [
      { rel: "canonical", href: CANONICAL },
      { rel: "preload", as: "image", href: heroSuvSkyline.url, fetchpriority: "high" },
      { rel: "preload", as: "image", href: heroSpartanOfficer.url, fetchpriority: "high" },
      { rel: "preload", as: "image", href: spartanLogo.url },
    ],
  }),
  component: SpartanRoadmap,
});

function SpartanRoadmap() {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const calendlyRootRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main
        className="spartan-deck relative w-full"
        style={{
          backgroundColor: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#0B1B3A",
        }}
      >
        <HeroSection setIsCalendlyOpen={setIsCalendlyOpen} />
        <CurrentStateSection />
        <HiddenOpportunitiesSection />
        <NoteFromTaiSection
          isCalendlyOpen={isCalendlyOpen}
          setIsCalendlyOpen={setIsCalendlyOpen}
          calendlyRootRef={calendlyRootRef}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ================== SECTION 00: HERO ================== */

function HeroSection({
  setIsCalendlyOpen,
}: {
  setIsCalendlyOpen: (open: boolean) => void;
}) {
  return (
    <section
      id="section-0"
      className="relative min-h-screen w-full overflow-hidden slide-snap"
      style={{ backgroundColor: "#06112A", color: "#fff" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${heroSuvSkyline.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center 60%",
          filter: "saturate(0.55) brightness(0.55)",
          opacity: 0.55,
          mixBlendMode: "luminosity",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(90deg, #06112A 0%, rgba(6,17,42,0.94) 42%, rgba(6,17,42,0.58) 70%, rgba(6,17,42,0.86) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle 520px at 82% 55%, rgba(230,57,70,0.42), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-[8%] z-[1] hidden items-center md:flex"
        aria-hidden="true"
      >
        <span
          className="font-black leading-none"
          style={{
            fontSize: "780px",
            color: "transparent",
            WebkitTextStroke: "2px rgba(255,255,255,0.06)",
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "0",
          }}
        >
          S
        </span>
      </div>

      <img
        src={heroSpartanOfficer.url}
        alt="Spartan security officer"
        width={476}
        height={730}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="pointer-events-none absolute bottom-0 right-[10%] z-[2] hidden h-[88%] w-auto object-contain object-bottom md:block"
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1400px] flex-col px-5 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 lg:px-16 xl:px-20">
        <div className="flex items-start justify-between gap-4">
          <img
            src={spartanLogo.url}
            alt="Spartan Security Services logo"
            width={280}
            height={58}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-auto w-full max-w-[150px] object-contain sm:max-w-[180px] md:max-w-[210px]"
          />
          <div className="text-right">
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.32em]"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Prepared by
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white sm:text-[12px]">
              Trust Tai
            </p>
          </div>
        </div>

        <div className="mt-10 max-w-[680px] space-y-6 sm:mt-16 sm:space-y-7 lg:mt-20 lg:max-w-[760px] xl:mt-24">
          <div className="flex items-center gap-3">
            <div className="h-[2px] w-12 sm:w-14" style={{ backgroundColor: "#E63946" }} />
            <span
              className="text-[10px] font-bold tracking-[0.24em]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Growth roadmap · Houston
            </span>
          </div>
          <h1
            className="max-w-[13.4ch] text-wrap text-[34px] font-black leading-[0.94] tracking-normal text-white sm:max-w-[14.6ch] sm:text-[44px] lg:max-w-[15ch] lg:text-[60px] xl:text-[70px]"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <span style={{ color: "#E63946" }}>Spartan</span> already does the work.
            <br />
            This is the roadmap that makes Houston see it.
          </h1>
          <p
            className="max-w-[540px] text-[14px] leading-[1.65] sm:text-[15.5px] sm:leading-[1.75]"
            style={{
              color: "rgba(255,255,255,0.78)",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            The credibility is already Spartan's. This is the plan that turns it into visibility,
            trust, and contracts that last, mapped from where Spartan stands today to where it could
            stand in Houston security.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                border: "1.5px solid #E63946",
                backgroundColor: "rgba(230,57,70,0.08)",
              }}
            >
              <ShieldCheck size={16} color="#E63946" strokeWidth={2.2} />
            </span>
            <p className="text-[11px] font-bold leading-snug tracking-[0.16em] text-white">
              Stronger presence. Deeper trust. Contracts that hold.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:gap-5">
            <button
              type="button"
              onClick={() => setIsCalendlyOpen(true)}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-4 text-[12px] font-bold tracking-[0.08em] text-white shadow-[0_18px_40px_-16px_rgba(230,57,70,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:gap-3 hover:shadow-[0_22px_50px_-14px_rgba(230,57,70,0.85)] sm:w-auto sm:justify-start sm:whitespace-nowrap sm:text-[13px]"
              style={{ backgroundColor: "#E63946" }}
            >
              Book the roadmap walkthrough
              <ArrowRight size={16} strokeWidth={2.4} />
            </button>
            <span className="text-[11px] font-medium tracking-[0.14em] text-white/55">
              Free · 30 minutes · No pitch
            </span>
          </div>
        </div>

        <div className="mt-auto pt-6 sm:pt-8">
          <div
            className="grid grid-cols-1 gap-x-4 gap-y-4 rounded-lg px-4 py-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 sm:px-6 sm:py-5 md:grid-cols-4 md:gap-x-6"
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              maxWidth: "min(100%, 900px)",
            }}
          >
            {[
              {
                Icon: TrendingUp,
                title: "Get found",
                desc: "Show up first when Houston searches for security, not only when someone already knows the name.",
              },
              {
                Icon: Shield,
                title: "Earn the trust",
                desc: "Let buyers see the proof before they ever pick up the phone.",
              },
              {
                Icon: Eye,
                title: "Win the work",
                desc: "Turn more of that attention into signed contracts.",
              },
              {
                Icon: ArrowRight,
                title: "Grow what recurs",
                desc: "Keep clients longer, and grow the value of each one.",
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2.5 sm:gap-3">
                <Icon
                  size={20}
                  color="#E63946"
                  strokeWidth={1.6}
                  className="mt-0.5 shrink-0 sm:h-[22px] sm:w-[22px]"
                />
                <div className="min-w-0">
                  <div className="text-[10.5px] font-extrabold uppercase leading-tight tracking-[0.12em] text-white sm:text-[11px] sm:tracking-[0.14em]">
                    {title}
                  </div>
                  <p
                    className="mt-1 text-[10.5px] leading-snug sm:text-[11px]"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== SECTION 01: CURRENT STATE ================== */

function CurrentStateSection() {
  return (
    <section
      id="section-1"
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="mx-auto flex min-h-full max-w-[1240px] flex-col px-5 py-10 sm:px-8 sm:py-14 md:px-12 md:py-16 lg:px-16 lg:py-20">
        <div className="mb-6 text-center sm:mb-10 md:mb-12">
          <div className="hidden items-center justify-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.24em]" style={{ color: "#E63946" }}>
              01 · Where Spartan stands today
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(15,27,61,0.22)" }} />
            <span
              className="text-[10px] font-semibold tracking-[0.2em]"
              style={{ color: "rgba(15,27,61,0.55)" }}
            >
              Point A
            </span>
          </div>
          <h2
            className="mt-4 text-[30px] font-black leading-[0.98] tracking-normal sm:text-[40px] lg:text-[54px]"
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <span style={{ color: "#E63946" }}>Point A:</span>
            <span style={{ color: "#0B1B3A" }}> the current position</span>
          </h2>
        </div>

        <div className="grid flex-1 grid-cols-1 items-stretch gap-10 sm:gap-12 md:grid-cols-[1.05fr_1fr] md:gap-16 lg:gap-20">
          <div className="flex h-full flex-col">
            <div className="relative min-h-[280px] w-full flex-1 overflow-hidden rounded-lg shadow-[0_30px_60px_-24px_rgba(15,27,61,0.35)] sm:min-h-[380px] md:min-h-[520px] lg:min-h-[600px]">
              <img
                src={pointABuilding.url}
                alt="Spartan Security Services headquarters at sunset"
                width={1672}
                height={941}
                loading="lazy"
                decoding="async"
                className="h-full w-full scale-105 object-cover object-[40%_10%]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
                style={{ background: "linear-gradient(to top, rgba(6,17,42,0.55), transparent)" }}
              />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-3 text-white">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  Spartan HQ · Houston, TX
                </span>
                <span
                  className="text-[10px] font-mono tracking-[0.18em]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  Est. presence
                </span>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col gap-8 sm:gap-10">
            <p
              className="text-[20px] font-light italic leading-[1.3] sm:text-[22px] md:text-[26px] lg:text-[28px]"
              style={{
                color: "#0B1B3A",
                fontFamily: "Inter, system-ui, sans-serif",
                letterSpacing: "0",
              }}
            >
              Spartan already runs a business{" "}
              <span className="font-semibold not-italic" style={{ color: "#E63946" }}>
                worth making visible
              </span>
              .
            </p>

            <div
              className="space-y-5 text-[14px] leading-[1.75] sm:space-y-6 sm:text-[15px] sm:leading-[1.8]"
              style={{ color: "rgba(15,27,61,0.78)" }}
            >
              <p>
                Spartan protects Costco, Greystar, Builders FirstSource, RPM, and Kaplan. That is
                not a starting line. That is proof most security companies never earn. The hard part
                is already done.
              </p>
              <div
                className="rounded-lg border border-[rgba(15,27,61,0.08)] bg-[rgba(15,27,61,0.02)] p-5 sm:p-6"
                style={{ color: "#0B1B3A" }}
              >
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.24em]"
                    style={{ color: "#E63946" }}
                  >
                    Assets already in place
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,27,61,0.12)" }} />
                </div>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    "Marquee clients, Costco, Greystar, RPM",
                    "SecureAI",
                    "A training facility and the knowledge inside it",
                    "Trained security officers",
                    "Instructors and trainees",
                    "Years of Houston security data",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-[13px] font-medium leading-snug"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: "#E63946" }}
                      >
                        <Check size={11} color="#ffffff" strokeWidth={3} />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p>
                So the question was never whether Spartan is credible. The market settled that a
                long time ago. The question is quieter. Why is a company with this record not the
                obvious choice the moment a Houston buyer starts looking.
              </p>
              <p>
                The opportunity here is bigger than a better website. It is taking everything Spartan
                already has, the clients, the training, the data, the relationships, and making the
                market see it as clearly as those clients already do.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 w-full pt-2 sm:mt-10 md:mt-12">
          <div className="flex items-center gap-4">
            <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,27,61,0.18)" }} />
            <span
              className="text-[10px] font-semibold tracking-[0.22em]"
              style={{ color: "#E63946" }}
            >
              Trusted by
            </span>
            <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,27,61,0.18)" }} />
          </div>

          <div className="relative mt-5 sm:mt-6">
            <p
              className="text-center text-[12px] font-semibold leading-relaxed tracking-[0.12em] sm:text-[13px] md:text-[14px]"
              style={{ color: "rgba(15,27,61,0.72)" }}
            >
              Costco <span className="mx-2 text-[rgba(15,27,61,0.32)]">·</span> Greystar{" "}
              <span className="mx-2 text-[rgba(15,27,61,0.32)]">·</span> Builders FirstSource{" "}
              <span className="mx-2 text-[rgba(15,27,61,0.32)]">·</span> RPM{" "}
              <span className="mx-2 text-[rgba(15,27,61,0.32)]">·</span> Kaplan
            </p>
            <p className="mt-3 text-center text-[10px] font-medium leading-snug text-[rgba(15,27,61,0.42)]">
              Shown once each contract clears for display.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== SECTION 02: HIDDEN OPPORTUNITIES ================== */

type Slide = {
  eyebrow: string;
  title: string;
  lead: string;
  body: string;
  means: string;
  unlockPayoff: string;
  unlockSupport?: string;
  image: string;
  alt: string;
  urlBar: string;
  captionTag: string;
  captionText: string;
  pullQuote: string;
  imageCaption?: string;
};

function HiddenOpportunitiesSection() {
  const navy = "#0B1B3A";
  const red = "#E63946";
  const muted = "rgba(15,27,61,0.72)";

  const slides: Slide[] = [
    {
      eyebrow: "Gap 01 · 06 total",
      title: "Being found first",
      lead: "When a Houston buyer searches, the first name they see gets the call.",
      body: "Buyers rarely start with a company name. They start with the problem, construction site security, warehouse patrol, a community that needs coverage overnight. Competitors are showing up first, and Spartan shows up strongest only when someone already knows to look for it. The credibility is there. Visibility is the gap, and it is the one that decides who gets the inquiry.",
      means: "Spartan can lose high-intent buyers before the website ever has a chance to convert them.",
      unlockPayoff: "Capture demand before it reaches a competitor.",
      unlockSupport: "More visibility in high-intent searches means more qualified Houston inquiries and a stronger pipeline.",
      urlBar: "google.com/search?q=security+guards+near+me",
      image: hiddenOppImg.url,
      alt: "Google search results for security services in Houston",
      captionTag: "Market Reality",
      captionText: "Competitors ranking · Spartan not yet visible",
      imageCaption:
        "Image 01. Real-time search. Spartan is not yet winning enough broad Houston security searches.",
      pullQuote: "Houston buyers may be meeting competitors first when they search.",
    },
    {
      eyebrow: "Gap 02 · 06 total",
      title: "Service pages",
      lead: "Buyers search the exact thing they need protected, not a company.",
      body: "A buyer is thinking about the site in front of them, a warehouse, a residential community, a retail property, an event. Spartan covers all of it. The site does not yet have a page for each, so a buyer who searches a specific need does not land on a page built for that need. A page per need is how a buyer knows, in seconds, that Spartan is the right call.",
      means: "A buyer searching a specific need lands on a general page, and a general page rarely feels like the right call.",
      unlockPayoff: "Turn every search into the right first impression.",
      unlockSupport: "A page built for each need, warehouse, retail, residential, event, so buyers see Spartan as the obvious fit in seconds.",
      urlBar: "competitor-security.com/services",
      image: mgServicesImg.url,
      alt: "Competitor security company website with specific service pages",
      captionTag: "Service Gap",
      captionText: "Broad pages · Buyers need specific paths",
      imageCaption: "Image 02. A competitor's website showing dedicated service pages.",
      pullQuote: "Buyers search the exact situation they need protected, not a company.",
    },
    {
      eyebrow: "Gap 03 · 06 total",
      title: "Website security",
      lead: "The digital front door should feel as secure as the business behind it.",
      body: "Spartan protects properties, people, and operations in the real world. The website is the first thing a buyer touches, and it should carry the same standard, secure forms, backups, monitoring, and a process that catches issues early. For a security company, a site that feels unprotected is the one gap a buyer notices without being told.",
      means: "For a security company, a site that feels unprotected quietly undercuts the one thing Spartan sells.",
      unlockPayoff: "A front door that proves the promise.",
      unlockSupport: "Secure forms, backups, and monitoring that make the website feel as protected as the business behind it.",
      urlBar: "spartan-security.com/website-security",
      image: websiteSecurityImg.url,
      alt: "Spartan Security Services website homepage showing professional security brand presence",
      captionTag: "Website Security",
      captionText: "Digital front door · Needs the same field standard",
      imageCaption:
        "Image 03. Spartan's website is the digital front door. It needs the same protection standard the business is known for.",
      pullQuote: "The digital front door should feel as secure as the business behind it.",
    },
    {
      eyebrow: "Gap 04 · 06 total",
      title: "SecureAI positioning",
      lead: "SecureAI is a reason to choose Spartan, not a footnote.",
      body: "SecureAI shows a buyer that Spartan thinks past basic coverage, that officers, patrol, and monitoring work as one. Right now it reads like a feature buried in the site. Positioned as the advantage it is, it becomes a reason a buyer picks Spartan over a cheaper name, and a path into higher-value contracts.",
      means: "Buried as a feature, SecureAI competes on price. Shown as an advantage, it competes on value.",
      unlockPayoff: "A reason to choose Spartan over a cheaper name.",
      unlockSupport: "Officers, patrol, and monitoring shown as one system, and a clear path into higher-value contracts.",
      urlBar: "spartan-security.com/secureai",
      image: mgSecureAIImg.url,
      alt: "SecureAI AI-powered security monitoring platform mockup",
      captionTag: "SecureAI Gap",
      captionText: "Strong asset · Not yet positioned clearly enough",
      imageCaption:
        "Image 04. SecureAI positioned as a real reason to choose Spartan, combining officers, AI and monitoring.",
      pullQuote: "SecureAI is a reason to choose Spartan, not a footnote.",
    },
    {
      eyebrow: "Gap 05 · 06 total",
      title: "Trust proof",
      lead: "Costco, Greystar, Builders FirstSource. That proof should be doing more work.",
      body: "Spartan has earned names most security companies never will. Proof like that belongs on the front page, where a buyer sees it before they ever ask, showing that Spartan already handles real properties, real responsibility, and real pressure. Proof a buyer has to dig for is proof that is not yet paying its way.",
      means: "Proof a buyer has to dig for is proof that is not yet paying its way.",
      unlockPayoff: "Close the buyer before the first call.",
      unlockSupport: "Marquee clients on the front page, so credibility does the selling before anyone picks up the phone.",
      urlBar: "spartan-security.com/clients",
      image: mgTrustImg.url,
      alt: "Trust and client proof section with client logos and reviews",
      captionTag: "Trust Gap",
      captionText: "Strong proof · Not working hard enough yet",
      imageCaption: "Image 05. Mockup home page showing marquee client proof on the front page.",
      pullQuote: "Costco, Greystar, Builders FirstSource. That proof should be doing more work.",
    },
    {
      eyebrow: "Gap 06 · 06 total",
      title: "Content engine",
      lead: "Spartan already knows the market. The outside just cannot hear it yet.",
      body: "Years of field experience, Houston crime data, and a real point of view on what keeps a property safe. That knowledge is sitting in documents and in people's heads. A content engine turns it into the articles, guides, and posts buyers read and trust, built to run without adding to the team's week.",
      means: "Spartan's best knowledge sits in documents and in people's heads, where no buyer or recruit can find it.",
      unlockPayoff: "Authority that brings buyers and recruits in on their own.",
      unlockSupport: "Field experience and Houston data turned into content that runs without adding to the team's week.",
      urlBar: "spartan-security.com/insights",
      image: mgContentImg.url,
      alt: "Content and authority dashboard with blog and social posts",
      captionTag: "Authority Gap",
      captionText: "Knowledge inside · Not visible enough outside",
      imageCaption:
        "Image 06. Mockup content engine dashboard turning Spartan's field knowledge into blog posts, articles and social posts.",
      pullQuote: "Spartan already knows the market. The outside just cannot hear it yet.",
    },
  ];

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => {
    setDirection(dir);
    setIndex((i) => (i + dir + total) % total);
  };
  const jumpTo = (i: number) => {
    setDirection(i >= index ? 1 : -1);
    setIndex(i);
  };
  const gapNum = String(index + 1).padStart(2, "0");
  const slideInClass = direction >= 0 ? "slide-in-from-right-6" : "slide-in-from-left-6";
  const onSliderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { e.preventDefault(); jumpTo(0); }
    else if (e.key === "End") { e.preventDefault(); jumpTo(total - 1); }
  };


  return (
    <section id="section-2" className="relative flex w-full flex-col bg-white">
      <div className="w-full bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-center px-5 pt-8 pb-5 text-center sm:px-8 sm:pt-14 sm:pb-8 md:px-12 md:pt-16 md:pb-10 lg:px-16 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.24em]" style={{ color: red }}>
              02 · What is being missed
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(15,27,61,0.22)" }} />
            <span
              className="text-[10px] font-semibold tracking-[0.2em]"
              style={{ color: "rgba(15,27,61,0.55)" }}
            >
              Six fixable gaps
            </span>
          </div>

          <h2
            className="mt-4 text-[32px] font-black leading-[0.98] tracking-normal sm:mt-5 sm:text-[44px] lg:text-[64px]"
            style={{
              color: navy,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            The market <span style={{ color: red }}>gap</span>
          </h2>
        </div>
      </div>

      <div
        id="market-gap-slider"
        className="grid w-full grid-cols-1 bg-white lg:grid-cols-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E63946]/60"
        role="region"
        aria-roledescription="carousel"
        aria-label="Market gap slider. Use left and right arrow keys to navigate."
        tabIndex={0}
        onKeyDown={onSliderKeyDown}
      >

        <div
          className="relative order-2 flex flex-col gap-8 p-6 pb-6 sm:gap-10 sm:p-10 md:p-14 lg:order-none lg:col-span-5 lg:gap-10 lg:p-16 lg:pb-10 xl:gap-12 xl:p-20 xl:pb-12 xl:pl-32"
          role="group"
          aria-roledescription="slide"
          aria-label={`Gap ${index + 1} of ${total}: ${slide.title}`}
          aria-live="polite"
        >

          <div className="flex flex-1 flex-col">
            <div key={`h-${index}`} className={`relative space-y-4 animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-3 -top-14 select-none text-[132px] font-black leading-none sm:-left-5 sm:text-[170px] xl:-left-10"
                style={{
                  color: "rgba(230,57,70,0.055)",
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                {gapNum}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-black tabular-nums tracking-[0.28em]"
                  style={{ color: red }}
                >
                  {slide.eyebrow}
                </span>
              </div>
              <h3
                className="relative text-[26px] font-black leading-[1.02] tracking-normal sm:text-[32px] lg:text-[40px]"
                style={{ color: navy }}
              >
                {slide.title}
              </h3>
              <p
                className="relative max-w-[34rem] text-[15px] font-semibold leading-[1.55] sm:text-[17px]"
                style={{ color: navy }}
              >
                {slide.lead}
              </p>
            </div>

            <div
              key={`b-${index}`}
              className={`mt-6 text-[14px] leading-[1.68] sm:mt-7 sm:text-[15px] sm:leading-[1.72] animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}
              style={{ color: muted }}
            >
              <p>{slide.body}</p>
            </div>

            <div className="mt-auto space-y-5 pt-8 sm:space-y-6">
              {/* What this means — red-accented card */}
              <div
                key={`m-${index}`}
                className={`relative flex items-start gap-4 rounded-r-md border-l-[3px] p-4 sm:gap-5 sm:p-5 animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}
                style={{
                  borderColor: red,
                  backgroundColor: "rgba(230,57,70,0.045)",
                }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
                  style={{ backgroundColor: "rgba(230,57,70,0.12)" }}
                >
                  <TrendingUp className="h-5 w-5 sm:h-[22px] sm:w-[22px]" style={{ color: red }} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div
                    className="text-[10px] font-black tracking-[0.22em] sm:text-[11px]"
                    style={{ color: red }}
                  >
                    WHAT THIS MEANS
                  </div>
                  <p
                    className="mt-1.5 text-[14px] font-semibold leading-[1.5] sm:text-[15px]"
                    style={{ color: navy }}
                  >
                    {slide.means}
                  </p>
                </div>
              </div>

              {/* What it unlocks — blue-accented card */}
              <div
                key={`u-${index}`}
                className={`relative flex items-start gap-4 border-t pt-5 sm:gap-5 sm:pt-6 animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}
                style={{ borderColor: "rgba(15,27,61,0.10)" }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
                  style={{ backgroundColor: "rgba(37,99,235,0.10)" }}
                >
                  <Target className="h-5 w-5 sm:h-[22px] sm:w-[22px]" style={{ color: "#2563EB" }} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div
                    className="text-[10px] font-black tracking-[0.22em] sm:text-[11px]"
                    style={{ color: "#2563EB" }}
                  >
                    WHAT IT UNLOCKS
                  </div>
                  <p
                    className="mt-1.5 text-[14px] font-semibold leading-[1.5] sm:text-[15px]"
                    style={{ color: navy }}
                  >
                    {slide.unlockPayoff}
                  </p>
                  {slide.unlockSupport ? (
                    <p
                      className="mt-1.5 text-[13px] leading-[1.6] sm:text-[13.5px]"
                      style={{ color: muted }}
                    >
                      {slide.unlockSupport}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>


          <div
            className="mt-6 flex items-center gap-3 rounded-lg border bg-white p-2 shadow-[0_8px_24px_-12px_rgba(15,27,61,0.15)] sm:gap-4"
            style={{ borderColor: "rgba(15,27,61,0.12)" }}
          >
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous market gap"
              aria-controls="market-gap-slider"
              className="group flex h-11 items-center gap-2 rounded-lg border bg-white px-3 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#E63946] sm:px-4"
              style={{ borderColor: "rgba(15,27,61,0.15)", color: "rgba(15,27,61,0.55)" }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden text-[11px] font-black uppercase tracking-[0.22em] sm:inline">
                Prev
              </span>
            </button>

            <span
              className="text-[13px] font-black tabular-nums tracking-[0.18em]"
              style={{ color: navy }}
            >
              {gapNum}
              <span style={{ color: "rgba(15,27,61,0.35)" }}>
                {" "}
                / {String(total).padStart(2, "0")}
              </span>
            </span>

            <div
              className="hidden flex-1 items-center gap-2 sm:flex"
              role="tablist"
              aria-label="Select market gap"
            >
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpTo(i)}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Go to market gap ${i + 1} of ${total}: ${slides[i].title}`}
                  aria-controls="market-gap-slider"
                  className="h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#E63946]"
                  style={{
                    width: i === index ? 40 : 24,
                    backgroundColor: i === index ? red : "rgba(15,27,61,0.15)",
                  }}
                />
              ))}
            </div>
            <div className="flex-1 sm:hidden" />

            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next market gap"
              aria-controls="market-gap-slider"
              className="group flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(230,57,70,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white sm:gap-2 sm:px-5"
              style={{
                backgroundColor: red,
              }}

            >
              <span className="text-[11px] font-black uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.22em]">
                Next
              </span>
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        <div
          className="relative order-1 flex flex-col justify-start overflow-hidden p-6 sm:p-8 md:p-10 lg:order-none lg:col-span-7 lg:p-10 xl:p-12"
          style={{ backgroundColor: navy }}

        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.045), transparent 34%), linear-gradient(315deg, rgba(230,57,70,0.11), transparent 38%)",
            }}
          />

          <div key={`q-${index}`} className={`relative mb-6 sm:mb-8 animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}>
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] font-light leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: red, fontFamily: "Inter, system-ui, sans-serif" }}
            >
              &ldquo;
            </span>
            <p
              className="text-[16px] font-light italic leading-[1.4] text-white sm:text-[19px] md:text-[21px] lg:text-[22px]"
              style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0" }}
            >
              {slide.pullQuote}
            </p>
          </div>

          <div className="relative flex flex-col">
            <div
              className="overflow-hidden rounded-lg bg-white ring-1 ring-white/10"
              style={{ boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}
            >
              <div className="flex h-8 items-center gap-1.5 border-b border-gray-200 bg-[#f1f3f4] px-4">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <div className="h-2 w-2 rounded-full bg-yellow-400" />
                <div className="h-2 w-2 rounded-full bg-green-400" />
                <div
                  key={`u-${index}`}
                  className="mx-auto flex h-4 w-2/3 items-center justify-center rounded-sm bg-white px-2 text-[9px] text-gray-400 sm:w-1/2"
                >
                  {slide.urlBar}
                </div>
              </div>
              <img
                key={`img-${index}`}
                src={slide.image}
                alt={slide.alt}
                width={1536}
                height={1024}
                loading="lazy"
                decoding="async"
                className={`block h-[240px] w-full object-cover object-left-top sm:h-[420px] md:h-[520px] lg:h-[560px] xl:h-[640px] animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}
              />
            </div>

            <div key={`cap-${index}`} className={`mt-4 flex min-h-[40px] items-center gap-3 sm:mt-5 animate-in fade-in ${slideInClass} duration-500 ease-out motion-reduce:animate-none`}>
              {slide.imageCaption
                ? (() => {
                    const match = slide.imageCaption.match(/^(Image\s+\d+\.)\s*(.*)$/);
                    const label = match ? match[1] : "";
                    const body = match ? match[2] : slide.imageCaption;
                    return (
                      <>
                        <div
                          className="h-px flex-1 lg:hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                        />
                        <p className="w-full text-left text-[12px] leading-snug text-white/75 sm:text-[13px] lg:text-[13.5px]">
                          {label ? (
                            <span
                              className="mr-1.5 font-bold"
                              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                            >
                              {label}
                            </span>
                          ) : null}
                          <span>{body}</span>
                        </p>
                        <div
                          className="h-px flex-1 lg:hidden"
                          style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                        />
                      </>
                    );
                  })()
                : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================== SECTION 03: A NOTE FROM TAI ================== */

function NoteFromTaiSection({
  isCalendlyOpen,
  setIsCalendlyOpen,
  calendlyRootRef,
}: {
  isCalendlyOpen: boolean;
  setIsCalendlyOpen: (open: boolean) => void;
  calendlyRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const navy = "#0B1B3A";
  const red = "#E63946";
  const muted = "rgba(15,27,61,0.72)";

  return (
    <section id="note-from-tai" className="relative flex w-full items-center overflow-hidden bg-white">
      <div className="relative z-10 w-full py-8 sm:py-14 md:py-20 lg:py-24">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-start gap-8 px-5 sm:gap-10 sm:px-8 md:px-12 lg:grid-cols-12 lg:gap-14 lg:px-16">
          <div className="hidden lg:col-span-5 lg:block">
            <div
              className="mx-auto max-w-sm overflow-hidden rounded-lg sm:max-w-md lg:max-w-none"
              style={{ boxShadow: "0 30px 60px -20px rgba(15,27,61,0.25)" }}
            >
              <img
                src={taiPortrait.url}
                alt="Portrait of Tai"
                width={1122}
                height={1402}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2
              className="text-[32px] font-black leading-[0.98] tracking-normal sm:text-[44px] lg:text-[56px]"
              style={{
                color: navy,
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              A note from <span style={{ color: red }}>Tai</span>.
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: red }} />

            <div
              className="mt-6 overflow-hidden rounded-lg lg:hidden"
              style={{ boxShadow: "0 20px 40px -20px rgba(15,27,61,0.25)" }}
            >
              <img
                src={taiPortrait.url}
                alt="Portrait of Tai"
                width={1122}
                height={1402}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover"
              />
            </div>

            <div
              className="mt-6 space-y-4 text-[14px] leading-[1.7] sm:mt-8 sm:space-y-5 sm:text-[15px] sm:leading-[1.75]"
              style={{ color: muted }}
            >
              <p>
                If we were sitting across the table, I would not start this conversation with the
                website.
              </p>
              <p>
                I would start with the business, and with what your market is already doing whether
                Spartan is in the conversation or not.
              </p>
              <p>
                Right now, somewhere in Houston, someone is looking for security. They are not loyal
                to anyone yet. They are comparing. They are checking who looks credible, who can
                handle the pressure, and who is worth calling.
              </p>
              <p>They may not know Spartan yet. That is not a problem. That is an opening.</p>
              <p>
                There is a real opportunity here for Spartan to become the security authority the
                market cannot ignore. When someone searches for security in Houston, Spartan should
                be the name at the top of that result.
              </p>
              <p>That is where this roadmap begins.</p>
              <p>
                This preview only shows the first layer. The full roadmap goes deeper. Where Spartan
                stands today. The assets already inside the business that have not been built yet.
                Where the business can move next. And how the pieces connect into one authority
                engine.
              </p>
              <p>
                The call is not a pitch. It is a conversation worth having. I will walk you through
                the whole picture, answer your questions, and if it feels like the right next step,
                we can talk about execution.
              </p>
            </div>

            <img
              src={signatureTai.url}
              alt="Tai Shobajo signature"
              width={1584}
              height={672}
              loading="lazy"
              decoding="async"
              className="mt-6 h-auto w-36 max-w-[28%] object-contain sm:w-40 md:w-44 lg:w-48"
            />

            <div
              ref={calendlyRootRef}
              className="mt-8 rounded-2xl border p-6 sm:mt-10 sm:p-8"
              style={{
                borderColor: "rgba(15,27,61,0.10)",
                backgroundColor: "#ffffff",
              }}
            >
              <div className="flex items-start gap-5 sm:gap-7">
                <div
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full sm:h-20 sm:w-20"
                  style={{ backgroundColor: "rgba(230,57,70,0.08)" }}
                >
                  <MapPin className="h-7 w-7 sm:h-8 sm:w-8" style={{ color: red }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    className="text-[18px] font-black leading-tight sm:text-[20px]"
                    style={{ color: navy, fontFamily: "Inter, system-ui, sans-serif" }}
                  >
                    Ready to walk the full roadmap?
                  </h3>
                  <p
                    className="mt-2 text-[13px] leading-[1.55] sm:text-[14px]"
                    style={{ color: muted }}
                  >
                    In 30 minutes, I&rsquo;ll walk you through the complete roadmap, answer your
                    questions, and show you where Spartan&rsquo;s strongest opportunities are.
                  </p>

                  <button
                    type="button"
                    onClick={() => setIsCalendlyOpen(true)}
                    className="group mt-5 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E63946] px-5 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_18px_40px_-16px_rgba(230,57,70,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-14px_rgba(230,57,70,0.85)] sm:px-8 sm:text-[12px] sm:tracking-[0.16em] md:text-[13px] md:tracking-[0.18em]"
                  >
                    Book the roadmap walkthrough
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 sm:h-4 sm:w-4" />
                  </button>

                  <div
                    className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium"
                    style={{ color: muted }}
                  >
                    <span>Free</span>
                    <span style={{ color: red }}>•</span>
                    <span>30 minutes</span>
                    <span style={{ color: red }}>•</span>
                    <span>Zoom</span>
                    <span style={{ color: red }}>•</span>
                    <span>No pitch</span>
                  </div>
                </div>
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

      <img
        src={eagleSilhouette.url}
        alt=""
        aria-hidden="true"
        width={1024}
        height={1280}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute bottom-0 left-0 hidden h-auto w-[78%] -translate-x-[22%] translate-y-[10%] rotate-[-6deg] opacity-25 md:block md:w-[62%] lg:w-[48%]"
        style={{
          filter: "grayscale(1) drop-shadow(0 12px 32px rgba(11,27,58,0.06))",
          maskImage: "linear-gradient(90deg, transparent 0%, black 18%, black 78%, transparent 100%), linear-gradient(0deg, transparent 0%, black 14%, black 86%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 18%, black 78%, transparent 100%), linear-gradient(0deg, transparent 0%, black 14%, black 86%, transparent 100%)",
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      />
    </section>
  );
}
