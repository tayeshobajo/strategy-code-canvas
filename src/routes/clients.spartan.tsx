import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
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

const CANONICAL = "https://trusttai.com/clients/spartan";

export const Route = createFileRoute("/clients/spartan")({
  head: () => ({
    meta: [
      { title: "Spartan Security Services — Growth Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A strategic growth roadmap for Spartan Security Services — turning existing assets, SecureAI, and Houston market knowledge into more contract wins.",
      },
      { property: "og:title", content: "Spartan Security Services — Growth Roadmap" },
      {
        property: "og:description",
        content:
          "A revenue roadmap to help Spartan win more Houston security contract opportunities.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: heroSpartanOfficer.url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroSpartanOfficer.url },
    ],
    links: [
      { rel: "canonical", href: CANONICAL },
      // Preload above-the-fold LCP candidates
      { rel: "preload", as: "image", href: heroSuvSkyline.url, fetchpriority: "high" },
      { rel: "preload", as: "image", href: heroSpartanOfficer.url, fetchpriority: "high" },
      { rel: "preload", as: "image", href: spartanLogo.url },
    ],
  }),
  component: SpartanRoadmap,
});

function SpartanRoadmap() {
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
        <HeroSection />
        <CurrentStateSection />
        <HiddenOpportunitiesSection />
        <NoteFromTaiSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ================== SECTION 00: HERO ================== */

function HeroSection() {
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
            "linear-gradient(90deg, #06112A 0%, rgba(6,17,42,0.92) 38%, rgba(6,17,42,0.55) 70%, rgba(6,17,42,0.85) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle 520px at 62% 48%, rgba(40,90,200,0.45), transparent 60%)," +
            "radial-gradient(circle 520px at 82% 55%, rgba(220,38,38,0.42), transparent 60%)",
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
            letterSpacing: "-0.05em",
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

        <div className="mt-10 max-w-[720px] space-y-6 sm:mt-16 sm:space-y-7 lg:mt-20 lg:max-w-[860px] xl:mt-24 xl:max-w-[960px]">
          <div className="flex items-center gap-3">
            <div className="h-[2px] w-12 sm:w-14" style={{ backgroundColor: "#E63946" }} />
            <span
              className="text-[10px] font-bold uppercase tracking-[0.32em]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Growth Roadmap · Houston
            </span>
          </div>
          <h1
            className="font-black uppercase leading-[1.02] tracking-[-0.01em] text-white"
            style={{ fontSize: "clamp(28px, 3.4vw, 62px)" }}
          >
            THE GROWTH&nbsp;ROADMAP
            <br />
            TO HELP <span style={{ color: "#E63946" }}>SPARTAN</span> WIN
            <br />
            MORE HOUSTON SECURITY
            <br />
            CONTRACT <span style={{ color: "#3B82F6" }}>OPPORTUNITIES.</span>
          </h1>
          <p
            className="max-w-[520px] text-[14px] leading-[1.65] sm:text-[15.5px]"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            A strategic plan to increase visibility, build trust,
            <br className="hidden sm:inline" /> and turn opportunities into long-term contracts.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                border: "1.5px solid #E63946",
                backgroundColor: "rgba(230,57,70,0.08)",
              }}
            >
              <ShieldCheck size={16} color="#E63946" strokeWidth={2.2} />
            </span>
            <div className="text-[11px] font-bold uppercase leading-tight tracking-[0.18em]">
              <div className="text-white">Stronger Presence. More Trust.</div>
              <div style={{ color: "#E63946" }}>More Wins.</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:gap-5">
            <a
              href="#note-from-tai"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-4 text-[13px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_18px_40px_-16px_rgba(230,57,70,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:gap-3 hover:shadow-[0_22px_50px_-14px_rgba(230,57,70,0.85)] sm:w-auto sm:justify-start"
              style={{ backgroundColor: "#E63946" }}
            >
              Book Roadmap Walkthrough
              <ArrowRight size={16} strokeWidth={2.4} />
            </a>
            <span className="text-[11px] font-medium tracking-[0.14em] text-white/55">
              Free · 30&nbsp;min · No pitch
            </span>
          </div>
        </div>

        <div className="mt-auto pt-6 sm:pt-8">
          <div
            className="grid grid-cols-1 gap-x-4 gap-y-4 rounded-2xl px-4 py-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 sm:px-6 sm:py-5 md:grid-cols-4 md:gap-x-6"
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              maxWidth: "min(100%, 900px)",
            }}
          >
            {[
              { Icon: TrendingUp, title: "Increase Visibility", desc: "Dominate local search and digital channels." },
              { Icon: Shield, title: "Build Trust", desc: "Showcase what makes Spartan the right choice." },
              { Icon: Eye, title: "Win More Contracts", desc: "Convert more opportunities into long-term clients." },
              { Icon: ArrowRight, title: "Drive Recurring Revenue", desc: "Strengthen retention and grow account value." },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2.5 sm:gap-3">
                <Icon size={20} color="#E63946" strokeWidth={1.6} className="mt-0.5 shrink-0 sm:h-[22px] sm:w-[22px]" />
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
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: "#E63946" }}>
              01
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(15,27,61,0.22)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "rgba(15,27,61,0.55)" }}
            >
              Where Spartan Stands
            </span>
          </div>
          <h2
            className="mt-4 font-black uppercase leading-[0.92] tracking-tight"
            style={{
              fontSize: "clamp(30px, 4.2vw, 56px)",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <span style={{ color: "#E63946" }}>POINT A:</span>
            <span style={{ color: "#0B1B3A" }}>&nbsp;CURRENT POSITION</span>
          </h2>
        </div>

        <div className="grid flex-1 grid-cols-1 items-stretch gap-10 sm:gap-12 md:grid-cols-[1.05fr_1fr] md:gap-16 lg:gap-20">
          <div className="flex h-full flex-col">
            <div className="relative w-full flex-1 min-h-[280px] sm:min-h-[380px] md:min-h-[520px] lg:min-h-[600px] overflow-hidden rounded-xl shadow-[0_30px_60px_-24px_rgba(15,27,61,0.35)]">
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
                letterSpacing: "-0.01em",
              }}
            >
              Spartan already has a business{" "}
              <span className="font-semibold not-italic" style={{ color: "#E63946" }}>
                worth making more visible
              </span>
              .
            </p>


            <div
              className="space-y-5 text-[14px] leading-[1.75] sm:space-y-6 sm:text-[15px] sm:leading-[1.8]"
              style={{ color: "rgba(15,27,61,0.78)" }}
            >
              <p>
                Spartan already has the hard, crucial pieces needed to become a stronger security
                authority in Houston.
              </p>
              <div
                className="rounded-xl border border-[rgba(15,27,61,0.08)] bg-[rgba(15,27,61,0.02)] p-5 sm:p-6"
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
                    "Marquee clients (Costco, Greystar, RPM…)",
                    "Trained security officers",
                    "SecureAI",
                    "Instructors and trainees",
                    "Training facility and knowledge",
                    "Massive Houston security data",
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
              <p>So the question was never whether Spartan has credibility.</p>
              <p>
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  The question is why this level of credibility is not as visible&nbsp; online.
                </mark>
              </p>
              <p>
                The conversation started with a question about hosting and cost.{" "}
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  I looked deeper: at the website, the business, the training, and the structure
                  underneath everything, and I saw a larger opportunity than a website refresh
                </mark>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 w-full pt-2 sm:mt-10 md:mt-12">
          <div className="flex items-center gap-4">
            <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,27,61,0.18)" }} />
            <span
              className="text-[10px] font-semibold tracking-[0.28em]"
              style={{ color: "#E63946" }}
            >
              TRUSTED BY
            </span>
            <div className="h-px flex-1" style={{ backgroundColor: "rgba(15,27,61,0.18)" }} />
          </div>

          <div className="relative mt-5 sm:mt-6">
            <div
              className="flex snap-x snap-mandatory items-center justify-between gap-2 overflow-x-auto pb-2 sm:flex-nowrap sm:gap-8"
              style={{ scrollbarWidth: "none" }}
            >
              <div className="snap-center shrink-0"><CostcoMark /></div>
              <div className="snap-center shrink-0"><GreystarMark /></div>
              <div className="snap-center shrink-0"><BuildersMark /></div>
              <div className="snap-center shrink-0"><RpmMark /></div>
              <div className="snap-center shrink-0"><KaplanMark /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CostcoMark() {
  return (
    <div className="flex flex-col items-center leading-none">
      <div className="text-[11px] font-extrabold italic tracking-tight sm:text-[14px]" style={{ color: "#E31837" }}>
        COSTCO
      </div>
      <div className="mt-0.5 rounded-2xl px-1 py-[1px] text-[4px] font-bold tracking-[0.2em] text-white sm:text-[6px]" style={{ backgroundColor: "#005DAA" }}>
        WHOLESALE
      </div>
    </div>
  );
}

function GreystarMark() {
  return (
    <div className="text-[11px] tracking-tight sm:text-[14px]" style={{ color: "#3a3a3a", fontFamily: "Georgia, 'Times New Roman', serif" }}>
      Greystar
    </div>
  );
}

function BuildersMark() {
  return (
    <div className="flex items-center gap-1">
      <svg className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" viewBox="0 0 26 26">
        <rect x="0" y="0" width="26" height="26" rx="2" fill="#E31837" />
        <path d="M6 18 L13 6 L20 18 Z" fill="#fff" />
      </svg>
      <div className="flex flex-col leading-tight">
        <span className="text-[7px] font-extrabold sm:text-[9px]" style={{ color: "#1a1a1a" }}>Builders</span>
        <span className="text-[5px] font-semibold sm:text-[7px]" style={{ color: "#6b7280" }}>FirstSource</span>
      </div>
    </div>
  );
}

function RpmMark() {
  return (
    <div className="text-[12px] font-extrabold italic tracking-tight sm:text-[16px]" style={{ color: "#1f4e79", fontFamily: "Arial Black, sans-serif" }}>
      RPM
    </div>
  );
}

function KaplanMark() {
  return (
    <div className="relative">
      <div className="text-[11px] font-extrabold tracking-tight sm:text-[14px]" style={{ color: "#0033A0" }}>
        KAPLAN
      </div>
      <div className="absolute -bottom-0.5 left-0 right-0 h-px rounded-full" style={{ backgroundColor: "#0033A0" }} />
    </div>
  );
}

/* ================== SECTION 02: HIDDEN OPPORTUNITIES ================== */

type Slide = {
  label: string;
  body: ReactNode;
  image: string;
  alt: string;
  urlBar: string;
  captionTag: string;
  captionText: string;
  pullQuote: ReactNode;
  imageCaption?: string;
};

function HiddenOpportunitiesSection() {
  const navy = "#0B1B3A";
  const red = "#E63946";
  const muted = "rgba(15,27,61,0.72)";

  const slides: Slide[] = [
    {
      label: "Search Engine Optimization",
      urlBar: "google.com/search?q=security+guards+near+me",
      image: hiddenOppImg.url,
      alt: "Google search results for security services in Houston",
      captionTag: "Market Reality",
      captionText: "Competitors ranking · Spartan not yet visible",
      imageCaption: "Image 01. Real-time search. Spartan isn't ranking well for some security keywords on Google.",
      pullQuote: (
        <>
          Houston security buyers may be finding{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>competitors first</mark>{" "}
          when they search online.
        </>
      ),
      body: (
        <>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>The image on the right is a real-time Google search, and this is how Houston buyers are likely searching for security help.</mark> They search by the problem they need solved, not the name of a company.
          </p>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>Competitors are showing up near the top for those searches, while Spartan seems to show up strongest when the search includes &ldquo;Spartan.&rdquo;</mark> That means Spartan is easier to find for people who already know the brand, but not visible enough for buyers who do not.
          </p>
          <p>
            That is the bigger opportunity. <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>Spartan has the credibility to compete for that attention, and even win it.</mark> The digital structure just needs to make the business as visible as it deserves to be.
          </p>
        </>
      ),
    },
    {
      label: "Service Pages",
      urlBar: "competitor-security.com/services",
      image: mgServicesImg.url,
      alt: "Competitor security company website with specific service pages",
      captionTag: "Service Gap",
      captionText: "Broad pages · Buyers need specific paths",
      imageCaption: "Image 02. A competitor's website showing dedicated service pages.",
      pullQuote: (
        <>
          Buyers search the{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>exact situation</mark>{" "}
          they need protected, not a company.
        </>
      ),
      body: (
        <>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>A buyer looking for security is usually thinking about the exact situation in front of them</mark>: a construction site, a warehouse, a residential community, a retail property, a high-rise, or an event that needs protection.
          </p>
          <p>
            Spartan already serves these kinds of needs. <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>The website needs clearer service pages that match how buyers are searching, so when they land there, they can quickly see Spartan as the solution they need.</mark>
          </p>
        </>
      ),
    },
    {
      label: "Website Security",
      urlBar: "spartan-security.com/website-security",
      image: websiteSecurityImg.url,
      alt: "Spartan Security Services website homepage showing professional security brand presence",
      captionTag: "Website Security",
      captionText: "Digital front door · Needs the same field standard",
      imageCaption: "Image 03. Spartan's website is the digital front door. It needs the same protection standard the business is known for.",
      pullQuote: (
        <>
          The digital front door needs to feel{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>as secure as the business behind it</mark>.
        </>
      ),
      body: (
        <>
          <p>
            Spartan protects properties, people, and operations in the real world, so <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>the website should carry that same sense of care online.</mark>
          </p>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>The same standard buyers expect from the company in the field should show up on the website too</mark>: secure forms, malware scanning, backups, hosting checks, safe redirects, monitoring, and a tight process for catching issues early. The website is the digital front door, and that front door needs to feel as secure as the business behind it.
          </p>
        </>
      ),
    },
    {
      label: "SecureAI Positioning",
      urlBar: "spartan-security.com/secureai",
      image: mgSecureAIImg.url,
      alt: "SecureAI AI-powered security monitoring platform mockup",
      captionTag: "SecureAI Gap",
      captionText: "Strong asset · Not yet positioned clearly enough",
      imageCaption: "Image 04. SecureAI positioned as a real reason to choose Spartan, combining officers, AI and monitoring.",
      pullQuote: (
        <>
          SecureAI is a{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>reason to choose Spartan</mark>
          &nbsp;,&nbsp;not a footnote.
        </>
      ),
      body: (
        <>
          <p>
            SecureAI makes Spartan&rsquo;s story stronger. <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>It shows buyers that the company is thinking beyond basic security coverage and looking at how people, patrol, and technology can work together to protect properties better.</mark>
          </p>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>That needs to come through more clearly on the website</mark>, so a buyer can quickly understand how Spartan&rsquo;s officers, patrol, and AI-powered monitoring fit together as one stronger security solution.
          </p>
        </>
      ),
    },
    {
      label: "Trust Proof",
      urlBar: "spartan-security.com/clients",
      image: mgTrustImg.url,
      alt: "Trust and client proof section with client logos and reviews",
      captionTag: "Trust Gap",
      captionText: "Strong proof · Not working hard enough yet",
      imageCaption: "Image 05. Mockup home page showing marquee client proof on the front page.",
      pullQuote: (
        <>
          Costco, Greystar, Builders FirstSource ... That&nbsp;{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>proof should be doing more work</mark>.
        </>
      ),
      body: (
        <>
          <p>
            Spartan has worked with serious names like Costco, Greystar, Builders FirstSource, RPM, and Kaplan, and <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>that kind of proof should not be hidden. It should be on the front pages, showing buyers that Spartan already has the credibility to handle real properties, real responsibility, real operations, and real pressure.</mark>
          </p>
        </>
      ),
    },
    {
      label: "Content Engine",
      urlBar: "spartan-security.com/insights",
      image: mgContentImg.url,
      alt: "Content and authority dashboard with blog and social posts",
      captionTag: "Authority Gap",
      captionText: "Knowledge inside · Not visible enough outside",
      imageCaption: "Image 06. Mockup content engine dashboard turning Spartan's field knowledge into blog posts, articles and social posts.",
      pullQuote: (
        <>
          Spartan already knows the market ,&nbsp;{" "}
          <mark style={{ backgroundColor: "transparent", color: red }}>the outside just can&rsquo;t hear it yet</mark>.
        </>
      ),
      body: (
        <>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>Spartan already has the content assets it needs to build stronger social presence and authority online</mark>: years of security experience, real Houston crime data, field knowledge, training insight, and real opinions about what makes security work. Those assets should not sit dormant in documents.
          </p>
          <p>
            <mark style={{ backgroundColor: "rgba(230,57,70,0.15)", color: "inherit", padding: "0 2px" }}>The content engine can use that knowledge base to create blog posts, articles, FAQs, short videos, and social media posts</mark> that make Spartan more visible and more trusted. Built to be automated, without adding extra workload for the team.
          </p>
        </>
      ),
    },
  ];

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);
  const gapNum = String(index + 1).padStart(2, "0");

  return (
    <section
      id="section-2"
      className="relative flex w-full flex-col bg-white"
    >

      <div className="w-full bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-center px-5 pt-8 pb-5 text-center sm:px-8 sm:pt-14 sm:pb-8 md:px-12 md:pt-16 md:pb-10 lg:px-16 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: red }}>
              02
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(15,27,61,0.22)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "rgba(15,27,61,0.55)" }}
            >
              What&apos;s Being Missed
            </span>
          </div>

          <h2
            className="mt-4 font-black uppercase leading-[0.98] tracking-tight sm:mt-5"
            style={{
              color: navy,
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "clamp(32px, 4.4vw, 64px)",
            }}
          >
            THE MARKET <span style={{ color: red }}>GAP</span>
          </h2>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 bg-white lg:grid-cols-12">

        <div className="flex flex-col gap-8 p-6 pb-6 sm:gap-10 sm:p-10 md:p-14 lg:col-span-5 lg:gap-10 lg:p-16 lg:pb-10 xl:gap-12 xl:p-20 xl:pb-12">
          <div className="flex flex-1 flex-col">
            <div key={`h-${index}`} className="space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-black tabular-nums tracking-[0.28em]"
                  style={{ color: red }}
                >
                  GAP {gapNum}
                </span>
                <div className="h-px w-10" style={{ backgroundColor: "rgba(15,27,61,0.18)" }} />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.24em]"
                  style={{ color: "rgba(15,27,61,0.5)" }}
                >
                  {String(total).padStart(2, "0")} total
                </span>
              </div>
              <h3
                className="font-black uppercase leading-[1.05] tracking-[-0.005em]"
                style={{
                  color: navy,
                  fontSize: "clamp(22px, 2.4vw, 34px)",
                }}
              >
                {slide.label}
              </h3>
            </div>

            <div
              key={`b-${index}`}
              className="mt-6 space-y-4 text-[14px] leading-[1.75] sm:mt-8 sm:space-y-5 sm:text-[15px] sm:leading-[1.8] [&_mark]:transition-colors"
              style={{ color: muted }}
            >
              {slide.body}
            </div>
          </div>




          <div
            className="mt-6 flex items-center gap-3 rounded-2xl border bg-white p-2 shadow-[0_8px_24px_-12px_rgba(15,27,61,0.15)] sm:gap-4"
            style={{ borderColor: "rgba(15,27,61,0.12)" }}
          >
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous market gap"
              className="group flex h-11 items-center gap-2 rounded-xl border bg-white px-3 transition-all duration-200 hover:-translate-y-0.5 sm:px-4"
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
              <span style={{ color: "rgba(15,27,61,0.35)" }}> / {String(total).padStart(2, "0")}</span>
            </span>

            <div className="hidden flex-1 items-center gap-2 sm:flex">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Go to market gap ${i + 1}`}
                  className="h-1.5 rounded-full transition-all duration-300"
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
              className="group flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(230,57,70,0.55)] sm:gap-2 sm:px-5"
              style={{ backgroundColor: red, animation: "spartan-button-pulse 2s ease-in-out infinite" }}
            >
              <span className="text-[11px] font-black uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.22em]">Next</span>
              <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        <div
          className="relative flex flex-col justify-start overflow-hidden p-6 sm:p-8 md:p-10 lg:col-span-7 lg:p-10 xl:p-12"
          style={{ backgroundColor: navy }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(230,57,70,0.12)" }}
          />

          <div key={`q-${index}`} className="relative mb-6 sm:mb-8">
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] font-light leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: red, fontFamily: "Inter, system-ui, sans-serif" }}
            >
              &ldquo;
            </span>
            <p
              className="text-[16px] font-light italic leading-[1.4] text-white sm:text-[19px] md:text-[21px] lg:text-[22px]"
              style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "-0.005em" }}
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
                className="block h-[240px] w-full object-cover object-left-top sm:h-[420px] md:h-[520px] lg:h-[560px] xl:h-[640px]"
              />
            </div>

            <div key={`cap-${index}`} className="mt-4 flex min-h-[40px] items-center gap-3 sm:mt-5">
              {slide.imageCaption
                ? (() => {
                    const match = slide.imageCaption.match(/^(Image\s+\d+\.)\s*(.*)$/);
                    const label = match ? match[1] : "";
                    const body = match ? match[2] : slide.imageCaption;
                    return (
                      <>
                        <div className="h-px flex-1 lg:hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }} />
                        <p className="max-w-[64ch] text-left text-[12px] leading-snug text-white/75 sm:text-[13px] lg:text-[13.5px]">
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
                        <div className="h-px flex-1 lg:hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }} />
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

function NoteFromTaiSection() {
  const navy = "#0B1B3A";
  const red = "#E63946";
  const muted = "rgba(15,27,61,0.72)";
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);
  const calendlyRootRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="note-from-tai"
      className="relative flex w-full items-center bg-white"
    >

      <div className="w-full py-8 sm:py-14 md:py-20 lg:py-24">
        <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-start gap-8 px-5 sm:gap-10 sm:px-8 md:px-12 lg:grid-cols-12 lg:gap-14 lg:px-16">

          <div className="hidden lg:col-span-5 lg:block">
            <div
              className="mx-auto max-w-sm overflow-hidden rounded-2xl sm:max-w-md lg:max-w-none"
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
              className="font-black uppercase leading-[0.98] tracking-tight"
              style={{
                color: navy,
                fontFamily: "Inter, system-ui, sans-serif",
                fontSize: "clamp(32px, 4vw, 56px)",
              }}
            >
              A note from <span style={{ color: red }}>Tai</span>.
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: red }} />

            <div className="mt-6 overflow-hidden rounded-2xl lg:hidden" style={{ boxShadow: "0 20px 40px -20px rgba(15,27,61,0.25)" }}>
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
              <p>If we were sitting across the table, I would not start this conversation by talking about the website.</p>
              <p>I would start with the business.</p>
              <p>
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  Somewhere in Houston, someone is probably looking for security help right now.
                </mark>{" "}
                They are not loyal to a provider yet. They are comparing. They are checking who
                looks credible, who can handle the pressure, and who seems worth calling.
              </p>
              <p>
                They may not know Spartan yet, and that is not a problem.{" "}
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  That is an opening.
                </mark>
              </p>
              <p>
                There is a real opportunity here for Spartan to become the security authority the
                market can&apos;t ignore.{" "}
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  When someone searches for security in Houston, Spartan should be at the top of
                  that search result.
                </mark>
              </p>
              <p>That is what this roadmap is about. And more.</p>
              <p>
                This preview only shows the first layer.{" "}
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  The full roadmap goes deeper into where Spartan is today, the underused assets
                  already inside the business, where the business can move next, and how the pieces
                  all connect into a stronger authority engine.
                </mark>
              </p>
              <p>
                <mark className="px-1" style={{ backgroundColor: "rgba(230, 57, 70, 0.15)" }}>
                  The call is not a pitch. It is a conversation worth having.
                </mark>{" "}
                I&rsquo;ll walk you through the full thinking, answer your questions, and if you
                feel it&apos;s the right next step, we can talk about execution.
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
              className="mt-10 rounded-2xl border p-6 sm:mt-14 sm:p-8"
              style={{
                borderColor: "rgba(15,27,61,0.08)",
                background:
                  "linear-gradient(135deg, rgba(230,57,70,0.04) 0%, rgba(15,27,61,0.03) 100%)",
              }}
            >
              <div
                className="text-[10px] font-black uppercase tracking-[0.28em]"
                style={{ color: red }}
              >
                Next Step
              </div>
              <p
                className="mt-3 text-[20px] font-light italic leading-[1.3] sm:text-[22px] md:text-[24px]"
                style={{
                  color: navy,
                  fontFamily: "Inter, system-ui, sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                Let&rsquo;s walk through the full roadmap together.
              </p>

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <button
                  type="button"
                  onClick={() => setIsCalendlyOpen(true)}
                  className="group inline-flex w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-lg bg-[#E63946] px-6 py-4 text-[12px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_18px_40px_-16px_rgba(230,57,70,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-14px_rgba(230,57,70,0.85)] sm:w-auto sm:gap-3 sm:px-8 sm:py-5 sm:text-[13px] sm:tracking-[0.18em]"
                >
                  <Calendar className="h-4 w-4" />
                  Book the walkthrough
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>
                <div className="flex flex-col gap-1 text-[11px] font-medium tracking-[0.14em] text-[rgba(15,27,61,0.6)]">
                  <span className="uppercase">Free · 30&nbsp;minutes · Zoom</span>
                  <span className="text-[rgba(15,27,61,0.5)]">No pitch. Just the full thinking.</span>
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
    </section>
  );
}
