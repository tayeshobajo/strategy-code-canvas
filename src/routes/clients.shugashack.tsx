import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Compass,
  Cake,
  ShoppingBag,
  CreditCard,
  Palette,
  ChefHat,
  Mail,
} from "lucide-react";
import { PopupModal } from "react-calendly";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import taiPortrait from "@/assets/clients/spartan/tai-portrait.png.asset.json";
import signatureTai from "@/assets/clients/spartan/signature-tai.png.asset.json";
import shugarHeroAsset from "@/assets/clients/shugashack/shugar-hero.jpg.asset.json";
import shugarPointAAsset from "@/assets/clients/shugashack/shugar-pointa.jpg.asset.json";
import m1BrandAsset from "@/assets/clients/shugashack/shugar-m1-brand.png.asset.json";
import m2WebsiteAsset from "@/assets/clients/shugashack/shugar-m2-website.png.asset.json";
import m3CalculatorAsset from "@/assets/clients/shugashack/shugar-m3-calculator.png.asset.json";
import m4CheckoutAsset from "@/assets/clients/shugashack/shugar-m4-checkout.png.asset.json";
import m5AdminAsset from "@/assets/clients/shugashack/shugar-m5-admin.png.asset.json";
import { SectionSlider } from "@/components/clients/shugashack/SectionSlider";
import { SideNav } from "@/components/clients/shugashack/SideNav";

const shugarHero = shugarHeroAsset.url;
const shugarPointA = shugarPointAAsset.url;
const m1Brand = m1BrandAsset.url;
const m2Website = m2WebsiteAsset.url;
const m3Calculator = m3CalculatorAsset.url;
const m4Checkout = m4CheckoutAsset.url;
const m5Admin = m5AdminAsset.url;

const CANONICAL = "https://trusttai.com/clients/shugashack";

const BURGUNDY = "#7B2D3B";
const BURGUNDY_DEEP = "#5C1F2B";
const CREAM = "#F8F1E5";
const DARK = "#2C1810";

export const Route = createFileRoute("/clients/shugashack")({
  head: () => ({
    meta: [
      { title: "Shugar Shack Roadmap | Trust Tai" },
      {
        name: "description",
        content:
          "A roadmap to turn Shugar Shack from a loved baking business into a premium brand that can be discovered, ordered from and remembered.",
      },
      { property: "og:title", content: "Building Shugar Shack for the Future You Have in Mind" },
      {
        property: "og:description",
        content:
          "A roadmap to turn Shugar Shack from a loved baking business into a premium brand that can be discovered, ordered from and remembered.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shugar Shack Roadmap | Trust Tai" },
      {
        name: "twitter:description",
        content:
          "A roadmap to turn Shugar Shack from a loved baking business into a premium brand that can be discovered, ordered from and remembered.",
      },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: ShugashackRoadmap,
});

function ShugashackRoadmap() {
  const [isCalendlyOpen, setIsCalendlyOpen] = useState(false);

  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="shugashack-deck relative w-full"
        style={{
          backgroundColor: "#F8F1E5",
          fontFamily: "Inter, system-ui, sans-serif",
          color: DARK,
        }}
      >
        <SectionSlider>
          <HeroSection />
          <PointASection />
          <MilestonesSection />
          <HelloSection isCalendlyOpen={isCalendlyOpen} setIsCalendlyOpen={setIsCalendlyOpen} />
        </SectionSlider>
        <SideNav />
      </main>
      <SiteFooter />
    </>
  );
}

/* ================== HERO / TITLE ================== */

function HeroSection() {
  return (
    <section
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-5 py-12 sm:px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: BURGUNDY_DEEP }}
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={shugarHero}
          alt="Elegant bakery display with decorated cakes"
          className="h-full w-full object-cover"
          style={{ opacity: 0.35 }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${BURGUNDY_DEEP}ee 0%, ${BURGUNDY_DEEP}cc 45%, ${BURGUNDY_DEEP}99 100%)`,
          }}
        />
      </div>

      {/* Decorative glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(123,45,59,0.45)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 bottom-1/4 h-72 w-72 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(248,241,229,0.08)" }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl text-center">
        {/* Brand mark as text */}
        <div className="mb-6 inline-flex flex-col items-center">
          <span
            className="text-2xl font-black tracking-tight sm:text-3xl"
            style={{ color: CREAM, fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            Shugar Shack
          </span>
        </div>

        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-8" style={{ backgroundColor: "rgba(248,241,229,0.35)" }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(248,241,229,0.7)" }}>
            Website & Digital Growth Roadmap
          </span>
          <div className="h-px w-8" style={{ backgroundColor: "rgba(248,241,229,0.35)" }} />
        </div>

        {/* Headline */}
        <h1
          className="mx-auto mt-5 max-w-4xl font-black leading-[1.05] tracking-tight"
          style={{ color: CREAM, fontSize: "clamp(41px, 6.6vw, 86px)" }}
        >
          Building Shugar Shack for the{" "}
          <span style={{ color: "rgba(248,241,229,0.85)" }}>future you have in mind</span>
        </h1>

        {/* Prepared by */}
        <p
          className="mx-auto mt-8 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "rgba(248,241,229,0.6)" }}
        >
          Prepared by Trust Tai
        </p>
      </div>
    </section>
  );
}

/* ================== POINT A ================== */

function PointASection() {
  const muted = "rgba(44,24,16,0.75)";
  const helvetica = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";


  return (
    <section id="point-a" className="relative w-full overflow-hidden" style={{ backgroundColor: CREAM, fontFamily: helvetica }}>
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-5 py-8 sm:px-8 sm:py-10 md:px-16 md:py-12 lg:px-24 lg:py-14 xl:px-28">
        {/* Section title */}
        <div className="mb-6 text-center sm:mb-10 md:mb-12">
          <div className="hidden items-center justify-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: BURGUNDY_DEEP }}>
              01
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(44,24,16,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(44,24,16,0.55)" }}>
              Where Shugar Shack Stands
            </span>
          </div>
          <h2 className="mt-4 font-black leading-[0.98] tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 54px)", color: DARK }}>
            <span style={{ color: BURGUNDY_DEEP }}>Point A:</span>
            <span>&nbsp;Current position</span>
          </h2>
        </div>

        {/* Image + body */}
        <div className="grid grid-cols-1 items-stretch gap-8 sm:gap-10 md:grid-cols-[3fr_2fr] md:gap-14">
          <div className="flex">
            <div className="relative min-h-[420px] w-full overflow-hidden rounded-lg sm:min-h-[560px] md:min-h-0">
              <img
                src={shugarPointA}
                alt="Premium cake and pastry display in a Shugar Shack bakery case"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(180deg, transparent 55%, rgba(44,24,16,0.72))" }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-90">
                  20+ Years · Handcrafted Daily
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">
                  Cakes · Pastries · Events
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 sm:gap-6">
            <p
              className="text-[20px] leading-[1.15] sm:text-[24px] md:text-[26px] lg:text-[28px]"
              style={{ color: DARK, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500 }}
            >
              Shugar Shack is not just an idea.
            </p>

            <div className="space-y-4 text-[14px] leading-[1.75] sm:text-[15px]" style={{ color: muted }}>
              <p>
                You have more than 20 years of baking experience behind it. People have eaten the cakes, called back,
                recommended you and left testimonials. There are photos, past customers, social accounts, a registered
                business and already a website holding your place online.
              </p>
              <p>The craft and the love for the craft is real.</p>
              <p>What is changing is how far you want to take it.</p>
              <p>
                You spoke about moving beyond the people who already know you. About weddings, events, corporate clients
                and eventually serving the “who is who” in rooms as big as the White House.
              </p>
              <p>That requires more than good cakes.</p>
              <p>
                Someone who has never met you needs to find Shugar Shack, see the quality, trust the brand and know
                exactly what to do next.
              </p>
              <p>
                As more people come in, the business cannot depend on you manually explaining every order, remembering
                every customer or managing every small website update yourself.
              </p>
              <p>
                The next chapter is about making the business around the baking as strong as the baking itself.
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

/* ================== MILESTONES ================== */

type GapIcon = typeof Cake;
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
      label: "Brand & UI Foundation",
      Icon: Palette,
      urlBar: "shugarshack.com",
      image: m1Brand,
      imageCaption: "Brand system: refined logo, burgundy, cream and gold, typography, photography and reusable UI elements.",
      subtitle: (
        <>Build the visual foundation for where Shugar Shack is going.</>
      ),
      build: {
        name: "Brand & UI Foundation",
        body: (
          <>
            <p>
              Before the core website, we’ll refine the existing logo, burgundy, cream and gold into a warm, premium
              visual system covering type, photography, layouts and reusable UI elements.
            </p>
            <p>This gives everything we build next a consistent look that matches the quality Shugar Shack wants customers to expect.</p>
            <p>No logo options are shown in this roadmap. The brand redesign is part of the build and will be confirmed during Milestone 1 kickoff.</p>
          </>
        ),
      },
      unlock: {
        title: "Premium Presence",
        body: <>A recognisable look that can carry Shugar Shack confidently into weddings, private events, corporate opportunities and everything we build next.</>,
      },
    },
    {
      num: "02",
      label: "Core Website & Search Foundation",
      Icon: ShoppingBag,
      urlBar: "shugarshack.com",
      image: m2Website,
      imageCaption: "Website foundation: a premium home that tells the right story and is built to be found by the customers Shugar Shack wants.",
      subtitle: (
        <>Give people who do not know Shugar Shack yet a reason to stop, look and trust.</>
      ),
      build: {
        name: "Core Website & Search Foundation",
        body: (
          <>
            <p>
              Build a website around the market you want to grow into, not only the audience you have served before. We
              will do the research inside this milestone to understand how strong baking and dessert brands attract the
              customers Shugar Shack wants.
            </p>
            <p>Then use that thinking to shape the story, services, photography, testimonials, search structure and customer journey.</p>
            <p>
              Cakes, dessert catering and culturally specific offers such as small chops can all have a place without
              allowing one part of the business to box the whole brand in.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Wider Reach",
        body: <>A premium home Shugar Shack can confidently send anyone to, with a stronger chance of being found by people already searching for what you make.</>,
      },
    },
    {
      num: "03",
      label: "Smart Ordering & Payment System",
      Icon: Cake,
      urlBar: "shugarshack.com/make-your-cake",
      image: m3Calculator,
      imageCaption: "Make Your Cake: a guided estimator that turns excitement into a complete order brief and, eventually, payment.",
      subtitle: (
        <>Let the excitement of finding the right cake move naturally into placing the order.</>
      ),
      build: {
        name: "Smart Ordering & Payment System",
        body: (
          <>
            <p>
              This is where Make Your Cake comes to life.
              <br />
              <br />
              Customers can tell Shugar Shack what they need through one guided experience: occasion, size, servings,
              layers, tiers, flavour, design, event date, inspiration, add-ons and pickup or delivery.
            </p>
            <p>
              At first, that gives you a complete brief to review. As the pricing rules become clearer, the same experience
              can begin showing starting prices or estimates and send the right orders into Stripe for payment.
            </p>
            <p>
              The long-term goal is the experience you described: an order comes in, the important details are already
              there, and where possible, the payment is too.
            </p>
          </>
        ),
      },
      unlock: {
        title: "Effortless Ordering",
        body: <>Less time asking the same questions. More customers able to move from “I want this” to a real order while the desire is still fresh.</>,
      },
    },
    {
      num: "04",
      label: "Customer & Follow-up Engine",
      Icon: CreditCard,
      urlBar: "shugarshack.com/customers",
      image: m4Checkout,
      imageCaption: "Customer engine: past customers, new enquiries and network contacts in one simple system that remembers the routine things.",
      subtitle: (
        <>Stop letting good relationships disappear after the cake is delivered.</>
      ),
      build: {
        name: "Customer & Follow-up Engine",
        body: (
          <>
            <p>
              Bring past customers, new enquiries and the people Shugar Shack meets through events and everyday networking
              into one simple customer system.
            </p>
            <p>
              From there, the business can remember who ordered, welcome new contacts, follow up on enquiries, stay in touch,
              share new offers and reconnect when the next birthday, wedding or celebration comes around.
            </p>
            <p>The system remembers the routine things so you do not have to.</p>
          </>
        ),
      },
      unlock: {
        title: "Repeat Business",
        body: <>A growing circle of people who already know Shugar Shack and have a reason to come back, refer someone or think of the brand when the next occasion arrives.</>,
      },
    },
    {
      num: "05",
      label: "Training & Learning Platform",
      Icon: ChefHat,
      urlBar: "shugarshack.com/academy",
      image: m5Admin,
      imageCaption: "Learning platform: classes, workshops or courses that turn twenty years of baking experience into a new revenue stream.",
      subtitle: (
        <>Let twenty years of learning keep creating value even when you are not baking an order.</>
      ),
      build: {
        name: "Training & Learning Platform",
        body: (
          <>
            <p>
              You mentioned training as something you can see becoming part of Shugar Shack. When the core business is
              ready, we can turn that experience into something people can learn from and pay for: classes, workshops,
              video courses or structured learning resources.
            </p>
            <p>
              The platform can handle enrolment, payments and student access while you focus on what you want to teach.
            </p>
          </>
        ),
      },
      unlock: {
        title: "New Revenue",
        body: <>A new side of Shugar Shack that earns from what you know, reaches people outside your delivery area and is not limited by how many cakes you can physically make.</>,
      },
    },
  ];

  const [index, setIndex] = useState(0);
  const total = slides.length;
  const slide = slides[index];
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  return (
    <section id="market-gap" className="relative flex w-full flex-col" style={{ backgroundColor: BURGUNDY_DEEP }}>
      {/* Section title */}
      <div className="market-gap-title w-full bg-white">
        <div className="flex flex-col items-center justify-center px-6 pt-8 pb-5 text-center sm:pt-14 sm:pb-8 md:pt-16 md:pb-10 lg:pt-20 lg:pb-12">
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-[11px] font-black tracking-[0.32em]" style={{ color: BURGUNDY_DEEP, fontFamily: sans }}>
              02
            </span>
            <div className="h-px w-10" style={{ backgroundColor: "rgba(44,24,16,0.22)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: "rgba(44,24,16,0.55)", fontFamily: sans }}>
              The road ahead
            </span>
          </div>
          <h2
            className="mt-4 font-black leading-[0.98] tracking-tight sm:mt-5"
            style={{ color: DARK, fontFamily: sans, fontSize: "clamp(34px, 4.6vw, 66px)" }}
          >
            The <span style={{ color: BURGUNDY_DEEP }}>milestones</span>
          </h2>
        </div>
      </div>

      <div className="grid w-full flex-1 grid-cols-1 items-stretch bg-white lg:grid-cols-12">
        {/* LEFT: text */}
        <div className="market-gap-left flex flex-col items-center p-6 sm:p-10 md:p-14 lg:col-span-5 lg:p-10 xl:p-14" style={{ fontFamily: sans }}>
          <div className="flex w-full max-w-md flex-1 flex-col justify-center pt-8 md:pt-10">
              <div key={`h-${index}`} className="market-gap-header relative animate-fade-in">

                <span
                  aria-hidden
                  className="absolute left-0 -top-6 select-none text-[88px] font-black leading-none sm:-top-7 sm:text-[112px] md:-top-8 md:text-[128px]"
                  style={{ color: BURGUNDY_DEEP, opacity: 0.08, fontFamily: sans }}
                >
                  {slide.num}
                </span>

                <div className="relative flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: BURGUNDY_DEEP, fontFamily: sans }}>
                    Milestone {slide.num}
                  </span>
                  <span style={{ color: "rgba(44,24,16,0.35)" }}>·</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: "rgba(44,24,16,0.55)", fontFamily: sans }}>
                    {String(total).padStart(2, "0")} total
                  </span>
                </div>

                <h3
                  className="relative mt-1 text-[30px] leading-[1.05] tracking-tight sm:text-[38px] md:text-[44px]"
                  style={{ color: DARK, fontFamily: serif, fontWeight: 600 }}
                >
                  {slide.label}
                </h3>
              </div>

              <div
                key={`b-${index}`}
                className="market-gap-build mt-6 animate-fade-in space-y-3 text-[14px] leading-[1.75]"
                style={{ color: "rgba(44,24,16,0.8)", fontFamily: sans }}
              >
                {slide.build.body}
              </div>

              <div
                key={`u-${index}`}
                className="market-gap-unlock mt-5 flex animate-fade-in items-start gap-3 rounded-lg p-3"
                style={{ background: "rgba(123,45,59,0.10)" }}
              >
                <Check size={16} color={BURGUNDY_DEEP} strokeWidth={2.6} className="mt-0.5 shrink-0" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: BURGUNDY_DEEP, fontFamily: sans }}>
                    What It Unlocks
                  </div>
                  <div className="mt-1 text-[13px] font-bold" style={{ color: DARK, fontFamily: sans }}>
                    {slide.unlock.title}
                  </div>
                  <p className="mt-1 text-[14px] leading-[1.7]" style={{ color: "rgba(44,24,16,0.85)", fontFamily: sans }}>
                    {slide.unlock.body}
                  </p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <div
              className="market-gap-nav mt-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl border bg-white p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)] sm:gap-3"

              style={{ borderColor: "rgba(44,24,16,0.12)" }}
            >
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous milestone"
                className="group mr-auto flex h-10 w-[68px] items-center justify-center gap-1.5 rounded-xl border bg-white px-2 transition-all duration-200 hover:-translate-y-0.5 sm:w-[72px] sm:px-3"
                style={{ borderColor: "rgba(44,24,16,0.15)", color: "rgba(44,24,16,0.55)", fontFamily: sans }}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden text-[11px] font-black uppercase tracking-[0.22em] sm:inline">Prev</span>
              </button>

              <span className="w-[52px] text-center text-[13px] font-black tabular-nums tracking-[0.18em] sm:w-[56px]" style={{ color: DARK, fontFamily: sans }}>
                {slide.num}
                <span style={{ color: "rgba(44,24,16,0.35)" }}> / {String(total).padStart(2, "0")}</span>
              </span>

              <div className="hidden w-[120px] items-center justify-center gap-0 sm:flex">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to milestone ${i + 1}`}
                    className="flex h-1.5 items-center justify-center rounded-full transition-all duration-300"
                    style={{ width: 20, backgroundColor: "transparent" }}
                  >
                    <span
                      className="block h-1.5 rounded-full transition-all duration-300"
                      style={{ width: i === index ? 20 : 12, backgroundColor: i === index ? BURGUNDY : "rgba(44,24,16,0.15)" }}
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next milestone"
                className="group ml-auto flex h-10 w-[68px] shrink-0 animate-[button-pulse_2s_ease-in-out_infinite] items-center justify-center gap-1.5 rounded-xl px-2 text-white transition-all duration-200 sm:w-[72px] sm:px-3"
                style={{ background: `linear-gradient(90deg, ${BURGUNDY} 0%, ${BURGUNDY_DEEP} 100%)`, fontFamily: sans }}
              >
                <span className="text-[11px] font-black uppercase tracking-[0.18em] sm:text-[12px] sm:tracking-[0.22em]">Next</span>
                <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
        </div>

        {/* RIGHT: mockup */}
        <div
          className="market-gap-right relative flex flex-col justify-center overflow-hidden lg:col-span-7"
          style={{ backgroundColor: BURGUNDY_DEEP }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(123,45,59,0.22)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(248,241,229,0.10)" }}
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-center p-4 sm:p-6 md:p-8 lg:pl-8 lg:pr-10 xl:pl-10 xl:pr-12">
            <div key={`q-${index}`} className="market-gap-quote relative mb-3 animate-fade-in sm:mb-4">
            <span
              aria-hidden
              className="absolute -left-3 -top-5 text-[48px] leading-none opacity-30 sm:-left-4 sm:-top-6 sm:text-[64px]"
              style={{ color: CREAM, fontFamily: serif }}
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
                <span className="mr-1.5 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: CREAM }}>
                  {slide.imageCaption.split(":")[0]}:
                </span>
                <span>{slide.imageCaption.split(":").slice(1).join(":").trim()}</span>
              </p>
            </div>
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
  const muted = "rgba(44,24,16,0.75)";
  const calendlyRootRef = useRef<HTMLDivElement>(null);

  return (
    <section id="note" className="relative flex w-full flex-col bg-white">
      <div className="w-full px-5 py-8 sm:px-8 sm:py-14 md:px-14 md:py-20 lg:px-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Portrait */}
          <div className="hidden lg:col-span-5 lg:block">
            <div
              className="mx-auto max-w-sm overflow-hidden rounded-2xl sm:max-w-md lg:max-w-none"
              style={{ boxShadow: "0 30px 60px -20px rgba(44,24,16,0.25)" }}
            >
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "rgba(44,24,16,0.10)" }}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: BURGUNDY_DEEP }}>
                <Compass size={14} /> The Walkthrough
              </div>
              <ul className="mt-3 space-y-2 text-[12.5px]" style={{ color: muted }}>
                {[
                  "30 minutes · No pitch",
                  "A conversation, not a pitch",
                  "See how the milestones connect",
                  "Decide if it deserves to move into execution",
                ].map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <Check size={14} color={BURGUNDY_DEEP} className="mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7">
            <h2 className="font-black leading-[0.98] tracking-tight" style={{ color: DARK, fontSize: "clamp(30px, 3.8vw, 52px)" }}>
              A note from <span style={{ color: BURGUNDY_DEEP }}>Tai</span>
            </h2>
            <div className="mt-4 h-1 w-14 rounded-full sm:w-16" style={{ backgroundColor: BURGUNDY }} />

            <div className="mt-6 overflow-hidden rounded-2xl lg:hidden" style={{ boxShadow: "0 20px 40px -20px rgba(44,24,16,0.25)" }}>
              <img src={taiPortrait.url} alt="Portrait" loading="lazy" className="block h-full w-full object-cover" />
            </div>

            <div className="mt-6 space-y-4 text-[14px] leading-[1.75] sm:mt-8 sm:space-y-5 sm:text-[15px]" style={{ color: muted }}>
              <p>Hello Ese,</p>
              <p>
                When I asked you where you could see Shugar Shack in three years, you did not describe a small bakery.
              </p>
              <p>
                You talked about the White House. The movers and shakers. The “who is who.” Taking something you have been
                doing for more than twenty years and putting it in front of people far beyond the circle that knows you
                today.
              </p>
              <p>I paid attention to that.</p>
              <p>I also heard the other side of it.</p>
              <p>
                You do not want Shugar Shack boxed into one market. You want someone who has never met you to be able to
                find the business and immediately understand the quality behind it.
              </p>
              <p>
                You want ordering to become easier. Not endless messages before someone can even know what a cake might
                cost.
              </p>
              <p>
                And as the business grows, the last thing we should do is give you another job managing a website, chasing
                every enquiry or remembering who needs a follow-up.
              </p>
              <p>That is what this roadmap is really about.</p>
              <p>Not building technology for the sake of it.</p>
              <p>We just have to make sure every move or build takes us closer to the bigger goal.</p>
              <p>
                On the payment side, I like to keep projects like this flexible. We agree on a monthly amount that feels
                fair, then shape the work around it. If you want to move faster, we increase it. If you need more
                breathing room, we reduce it. And if you need to pause for a while, you can.
              </p>
              <p>That number could be anywhere from $750 - $1,500 or upwards if budget allows.</p>
              <p>The roadmap stays clear. We simply adjust the pace.</p>
              <p>
                If this feels right, send me the monthly amount you would like to work with and I will map out what we
                can realistically move forward each month so you always know what is coming next.
              </p>
              <p>Or, if you would rather talk it through together, we can get on a call and finalise the route.</p>
              <p>Trust,</p>
              <p>Tai</p>
            </div>

            <img src={signatureTai.url} alt="Signature" loading="lazy" className="mt-6 h-auto w-36 max-w-[28%] object-contain sm:w-40 md:w-44 lg:w-48" />

            <div
              className="mt-8 rounded-xl border p-5 sm:p-6"
              style={{ borderColor: "rgba(123,45,59,0.25)", background: "rgba(123,45,59,0.06)" }}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: BURGUNDY_DEEP }}>
                Ready to take the next step?
              </div>
              <p className="mt-2 text-[14px] leading-[1.6]" style={{ color: DARK }}>
                Send the monthly amount you would like to work with, or book a call and we will finalise the route together.
              </p>

              <div ref={calendlyRootRef} className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsCalendlyOpen(true)}
                  className="group inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(123,45,59,0.6)] sm:gap-3 sm:px-7 sm:py-4 sm:text-[12.5px] sm:tracking-[0.16em]"
                  style={{ background: `linear-gradient(90deg, ${BURGUNDY} 0%, ${BURGUNDY_DEEP} 100%)` }}
                >
                  <Calendar className="h-4 w-4" />
                  Book a call
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>

                <a
                  href="mailto:tai@trusttai.com?subject=Shugar Shack monthly amount"
                  className="group inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap rounded-full border px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-all duration-300 hover:-translate-y-0.5 sm:gap-3 sm:px-7 sm:py-4 sm:text-[12.5px] sm:tracking-[0.16em]"
                  style={{ borderColor: "rgba(123,45,59,0.35)", color: BURGUNDY_DEEP, background: "transparent" }}
                >
                  <Mail className="h-4 w-4" />
                  Send monthly amount
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </a>
              </div>

              <div className="mt-3 text-[10.5px] font-medium uppercase tracking-[0.18em]" style={{ color: "rgba(44,24,16,0.55)" }}>
                30 minutes · No pitch · Monthly amount from $750–$1,500
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
