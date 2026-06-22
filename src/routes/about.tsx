import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Leaf, Star, Gauge, Map as MapIcon, Sun, Scale } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteClosing, Accent } from "@/components/SiteClosing";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { Reveal } from "@/hooks/use-reveal";
import bookHero from "@/assets/hero-open-book-story.png.asset.json";
import taiPortrait from "@/assets/tai-portrait.png.asset.json";
import trustTaiLogo from "@/assets/trust-tai-logo.png.asset.json";
import { getRequestOrigin } from "@/lib/origin.functions";

/* ---------- shared perf helpers ---------- */
function useInViewPause<T extends HTMLElement>(rootMargin = "200px 0px") {
  const ref = React.useRef<T | null>(null);
  const [active, setActive] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        // schedule state flip on the next frame so we never thrash during scroll
        requestAnimationFrame(() => setActive(entries[0]?.isIntersecting ?? true));
      },
      { rootMargin, threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [rootMargin]);
  return { ref, paused: !active };
}

function useIsSmallViewport(breakpoint = 768) {
  const [small, setSmall] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setSmall(mq.matches);
    update();
    // rAF-throttle change handler so resize storms don't re-render mid-frame
    let frame = 0;
    const handler = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    mq.addEventListener?.("change", handler);
    return () => {
      mq.removeEventListener?.("change", handler);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [breakpoint]);
  return small;
}


export const Route = createFileRoute("/about")({
  loader: async () => {
    const origin = await getRequestOrigin();
    return { origin };
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const abs = (p: string) => (p.startsWith("http") ? p : `${origin}${p}`);
    const pageUrl = abs("/about");
    const homeUrl = abs("/");
    const logoUrl = abs(trustTaiLogo.url);
    const bookHeroUrl = abs(bookHero.url);
    const portraitUrl = abs(taiPortrait.url);

    const title = "About | Trust Tai";
    const description =
      "From websites to systems to the Roadmap. The standard, the moment, and the hand that draws it.";
    const ogDescription =
      "Care more than anyone expects you to. The standard that launched Trust Tai, and still decides every build.";

    const orgId = `${origin}/#organization`;
    const websiteId = `${origin}/#website`;
    const personId = `${origin}/#tai`;
    const aboutPageId = `${pageUrl}#aboutpage`;
    const breadcrumbId = `${pageUrl}#breadcrumb`;

    const orgLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": orgId,
      name: "Trust Tai",
      url: homeUrl,
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
        width: 512,
        height: 512,
      },
      description:
        "Trust Tai builds the Roadmap, a careful operating system for businesses that want to ship work worth trusting.",
      founder: { "@id": personId },
    };

    const websiteLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId,
      name: "Trust Tai",
      url: homeUrl,
      inLanguage: "en",
      publisher: { "@id": orgId },
    };

    const personLd = {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": personId,
      name: "Tai",
      jobTitle: "Founder & Conductor",
      image: portraitUrl,
      url: pageUrl,
      worksFor: { "@id": orgId },
    };

    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: homeUrl },
        { "@type": "ListItem", position: 2, name: "About", item: pageUrl },
      ],
    };

    const aboutLd = {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "@id": aboutPageId,
      name: title,
      description,
      url: pageUrl,
      primaryImageOfPage: { "@type": "ImageObject", url: bookHeroUrl },
      isPartOf: { "@id": websiteId },
      about: { "@id": personId },
      breadcrumb: { "@id": breadcrumbId },
      mainEntity: { "@id": personId },
    };

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: ogDescription },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: pageUrl },
        { property: "og:image", content: bookHeroUrl },
        { property: "og:image:alt", content: "An open leather-bound notebook on a warm stone desk." },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: ogDescription },
        { name: "twitter:image", content: bookHeroUrl },
      ],
      links: [
        { rel: "canonical", href: pageUrl },
        { rel: "preload", as: "image", href: bookHero.url, fetchpriority: "high", media: "(min-width: 640px)" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [orgLd, websiteLd, personLd, breadcrumbLd, aboutLd],
          }),
        },
      ],

    };
  },
  component: AboutPage,
});


const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";

function Eyebrow({ children, tone = "royal" }: { children: React.ReactNode; tone?: "royal" | "paper" }) {
  return (
    <span
      className={
        tone === "royal"
          ? "eyebrow"
          : "font-mono text-[11px] uppercase tracking-[0.18em] text-paper/55"
      }
    >
      {children}
    </span>
  );
}

function PrimaryCTA({
  children = "Build My Roadmap",
  variant = "dark",
}: {
  children?: React.ReactNode;
  variant?: "dark" | "light";
}) {
  const base =
    "group inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-medium transition-all duration-300 ease-out hover:-translate-y-[1px]";
  const skin =
    variant === "dark"
      ? "bg-ink text-paper hover:shadow-[0_10px_30px_-12px_rgba(10,23,51,0.5)]"
      : "bg-paper text-ink hover:shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)]";
  return (
    <a href="/build-my-roadmap" className={`${base} ${skin}`}>
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
    </a>
  );
}

function GhostLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-2 text-[13px] font-medium text-royal transition-colors hover:text-ink"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
    </Link>
  );
}

function AboutPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <Hero />
      <OneMoment />
      <ThePattern />
      <TheConductor />
      <HowWeThink />
      <HonestFit />
      <SiteClosing
        headline={<><Accent>Care more than anyone expects you to.</Accent></>}
        supporting={<>Your ambition matters. So does the partner you hand it to. If that is how you build, let us build your Roadmap. If it is not, we will point you toward someone who builds the way you need.</>}
      />
    </main>
  );
}

/* ---------------------- HERO ---------------------- */
function Hero() {
  return (
    <section id="overview" className="relative w-full overflow-hidden bg-paper">
      <div className="lg:grid lg:grid-cols-[48fr_52fr] lg:items-stretch">
        <div className="relative flex items-center px-6 py-14 pr-6 lg:py-20 lg:pl-10 lg:pr-12 xl:pl-[max(2.5rem,calc((100vw-80rem)/2+2.5rem))]">
          <div className="hero-texture pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true" />
          <div className="relative z-10 max-w-[620px]">
            <Reveal immediate variant="fade-up" delay={0} as="p" className="eyebrow mb-6">The Story</Reveal>
            <Reveal immediate variant="rise" delay={120} as="h1" className="font-display text-[3rem] leading-[1.04] tracking-tight text-ink sm:text-[3.5rem]">
              From websites to systems to{" "}
              <span className="italic text-royal drift inline-block">the Roadmap.</span>
            </Reveal>
            <Reveal immediate variant="fade-up" delay={260} as="p" className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-ink/70">
              Trust Tai launched a decade ago because Tai Shobajo had a standard, not a business plan. The instinct was simple to say and hard to hold: care more than anyone expects you to.
            </Reveal>
            <Reveal immediate variant="fade-up" delay={400} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="/build-my-roadmap" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[13.5px] font-medium text-paper transition-all hover:bg-ink/90">
                Build My Roadmap
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <Link to="/what-we-build" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-transparent px-6 text-[13.5px] font-medium text-ink transition-colors hover:border-ink/40">
                See what we've built
              </Link>
            </Reveal>
            <Reveal immediate variant="fade-up" delay={540} as="p" className="mt-5 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-ink/60">
              <span className="inline-block h-px w-5 bg-ink/40" />
              <span>A standard, a moment, and the hand that draws it.</span>
            </Reveal>
          </div>
        </div>

        <Reveal immediate variant="fade-right" delay={300} className="relative h-[420px] w-full lg:h-full lg:min-h-[640px]">
          <img
            src={bookHero.url}
            alt="An open leather-bound notebook on a warm stone desk, lit by soft natural light. The standard that started Trust Tai."
            loading="eager"
            decoding="async"
            // @ts-expect-error — fetchpriority is a valid HTML attribute, React types lag
            fetchpriority="high"
            className="absolute inset-0 h-full w-full object-cover object-right lg:hero-photo-fade"
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-[42%] lg:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--paper) 0%, color-mix(in oklab, var(--paper) 80%, transparent) 30%, color-mix(in oklab, var(--paper) 40%, transparent) 60%, transparent 100%)",
            }}
            aria-hidden="true"
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------- ONE MOMENT / THE REALITY ---------------------- */
function MiniBrowserCard() {
  return (
    <div className="rounded-md border border-rule/70 bg-white/70 p-3 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_18px_40px_-28px_rgba(10,23,51,0.18)]">
      <div className="flex items-center gap-1.5 pb-3">
        <span className="h-2 w-2 rounded-full bg-rule" />
        <span className="h-2 w-2 rounded-full bg-rule" />
        <span className="h-2 w-2 rounded-full bg-rule" />
      </div>
      <div className="relative flex h-[160px] flex-col items-center justify-center rounded-sm bg-[oklch(0.965_0.012_75)] px-6">
        <p className="font-display text-[20px] leading-none tracking-wide text-ink/85">One</p>
        <span className="mt-2 block h-px w-6 bg-royal/80" />
        <span className="mt-4 block h-1.5 w-3/5 rounded-full bg-ink/10" />
        <span className="mt-1.5 block h-1.5 w-2/5 rounded-full bg-ink/10" />
        <svg className="absolute bottom-2 right-2" width="44" height="14" viewBox="0 0 44 14" fill="none" aria-hidden="true">
          <path
            d="M2 10 C 10 2, 20 14, 30 6 S 40 4, 42 5"
            stroke="var(--royal)"
            strokeWidth="1"
            strokeDasharray="1.5 3"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
          <circle cx="42" cy="5" r="1.6" fill="var(--royal)" />
        </svg>
      </div>
      <div className="mt-3 space-y-1.5">
        <span className="block h-1.5 w-3/4 rounded-full bg-rule/80" />
        <span className="block h-1.5 w-1/2 rounded-full bg-rule/60" />
      </div>
    </div>
  );
}

function OneMoment() {
  return (
    <section className="bg-paper py-20 lg:py-24">
      <div className={container}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[840px] text-center">
          <Eyebrow>The Reality</Eyebrow>
          <h2 className="mt-3 font-display text-[28px] leading-[1.2] tracking-tight text-ink sm:text-[34px] lg:text-[38px]">
            The work was never measured by size alone.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal as="div" variant="fade-up" className="lg:col-span-4">
            <MiniBrowserCard />
            <p className="mt-3 text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
              Putting people first
            </p>
          </Reveal>
          <Reveal as="div" variant="fade-up" delay={120} className="lg:col-span-8">
            <div className="space-y-5 text-[14.5px] leading-[1.8] text-ink/75">
              <p>
                One of those builds was a private anniversary site. Three days on the clock, from the
                first conversation to launch. It never paid like the large engagements. When the client
                saw it, he cried.
              </p>
              <p>
                That project became the measure for everything since. Not the size of the build. The care
                inside it. The version that works, delivered with more attention than the brief asked
                for.
              </p>
              <blockquote className="border-l-2 border-royal pl-4 text-[13.5px] text-ink/80">
                <p className="font-medium text-ink">The right work is never a shortcut.</p>
                <p>But once the system is right, nothing it earns goes to waste.</p>
              </blockquote>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------- THE PATTERN ---------------------- */
function PatternDiagram() {
  // dotted "scatter" particles on the left, dotted curving path to the right ending in target rings
  const pathD = "M170 150 C 230 70, 320 230, 400 130 S 540 70, 560 90";
  const particles = React.useMemo(() => {
    const seeded = (i: number) => {
      const x = Math.sin(i * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
    // converge toward the start of the path (~170,150)
    const target = { x: 170, y: 150 };
    return Array.from({ length: 42 }).map((_, i) => {
      const x = round(20 + seeded(i) * 130);
      const y = round(30 + seeded(i + 17) * 160);
      const r = round(1 + seeded(i + 33) * 1.6);
      const o = round(0.35 + seeded(i + 51) * 0.55);
      const dx = round((target.x - x) * 0.55);
      const dy = round((target.y - y) * 0.55);
      const dur = round(6 + seeded(i + 71) * 4);
      const delay = round(seeded(i + 89) * 4);
      return { x, y, r, o, dx, dy, dur, delay };
    });
  }, []);
  return (
    <svg viewBox="0 0 620 260" className="h-auto w-full" aria-hidden="true">
      <defs>
        <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--royal)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--royal)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* scatter — converge toward the path start */}
      {particles.map((p, i) => (
        <circle
          key={i}
          className="pattern-dot"
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill="var(--royal)"
          opacity={p.o}
          style={
            {
              ["--dx" as never]: `${p.dx}px`,
              ["--dy" as never]: `${p.dy}px`,
              ["--o" as never]: p.o,
              ["--dur" as never]: `${p.dur}s`,
              ["--d" as never]: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
      {/* dotted curving path with marching ants */}
      <path
        className="path-march"
        d={pathD}
        fill="none"
        stroke="var(--royal)"
        strokeWidth="1.5"
        strokeDasharray="2 7"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* node dots along the path */}
      {[
        [200, 122],
        [240, 110],
        [290, 150],
        [340, 170],
        [390, 140],
        [440, 110],
        [490, 95],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="var(--royal)" />
      ))}
      {/* traveler dot moving through the Roadmap */}
      <circle r="3.2" fill="var(--royal)" opacity="0.95">
        <animateMotion dur="5s" repeatCount="indefinite" path={pathD} rotate="auto" />
      </circle>
      {/* target rings on the right */}
      <circle cx="560" cy="90" r="26" fill="url(#ring-glow)" className="ring-breathe" />
      <circle cx="560" cy="90" r="16" fill="none" stroke="var(--royal)" strokeWidth="1" opacity="0.5" />
      <circle
        cx="560"
        cy="90"
        r="10"
        fill="none"
        stroke="var(--royal)"
        strokeWidth="1.2"
        opacity="0.8"
        className="ring-breathe"
      />
      <circle cx="560" cy="90" r="4.5" fill="var(--royal)" />

      <text x="60" y="232" fontFamily="Inter, sans-serif" fontSize="11" fill="oklch(0.4 0.04 260)">
        Details
      </text>
      <text x="60" y="246" fontFamily="Inter, sans-serif" fontSize="11" fill="oklch(0.4 0.04 260)">
        &amp; Systems
      </text>
      <text x="120" y="246" fontFamily="Inter, sans-serif" fontSize="10.5" fill="oklch(0.5 0.03 260)">
        Solve real problems
      </text>

      <text
        x="560"
        y="128"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontSize="11"
        fill="oklch(0.4 0.04 260)"
      >
        The Roadmap
      </text>
      <line x1="540" y1="134" x2="580" y2="134" stroke="var(--royal)" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

function ThePattern() {
  const { ref, paused } = useInViewPause<HTMLElement>();
  return (
    <section
      ref={ref}
      data-anim-paused={paused ? "true" : "false"}
      className="border-y border-rule/50 py-20 lg:py-24"
      style={{ background: "oklch(0.96 0.018 255)" }}
    >
      <div className={container}>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal as="div" variant="fade-up" className="lg:col-span-5">
            <Eyebrow>The Pattern</Eyebrow>
            <h2 className="mt-3 font-display text-[28px] leading-[1.15] tracking-tight text-ink sm:text-[34px] lg:text-[38px]">
              A clear, repeatable path, <br />
              where the real work becomes clear.
            </h2>
            <div className="mt-6 space-y-4 text-[14px] leading-[1.8] text-ink/75">
              <p>
                A pattern kept surfacing across the two hundred and sixty-six. The founders who thrived
                were not the ones with the best builds. They were the ones who knew what to build next,
                in what order, and why. The rest had vendors. They needed a map.
              </p>
              <p>
                So the Roadmap became the product. Today Trust Tai is the cartographer of business
                transformation. We diagnose where a business is, name where it needs to be, and walk
                the path with the discipline the journey deserves.
              </p>
            </div>
            <div className="mt-6">
              <GhostLink to="/what-we-build">See the Roadmap</GhostLink>
            </div>
          </Reveal>
          <Reveal as="div" variant="fade" delay={120} className="lg:col-span-7">
            <PatternDiagram />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------- THE CONDUCTOR ---------------------- */
function ConductorIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-royal/40 text-royal">
      {children}
    </span>
  );
}

function TheConductor() {
  return (
    <section className="bg-paper py-20 lg:py-24">
      <div className={container}>
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal as="div" variant="fade" className="lg:col-span-5">
            <div className="overflow-hidden rounded-md border border-rule/60 shadow-[0_18px_40px_-28px_rgba(10,23,51,0.25)]">
              <img
                src={taiPortrait.url}
                alt="Tai Shobajo, founder of Trust Tai, seated in his Murfreesboro office."
                className="block h-auto w-full"
                loading="lazy"
              />
            </div>
          </Reveal>

          <Reveal as="div" variant="fade-up" delay={100} className="lg:col-span-4">
            <Eyebrow>The Conductor</Eyebrow>
            <h2 className="mt-3 font-display text-[28px] leading-[1.15] tracking-tight text-ink sm:text-[34px] lg:text-[38px]">
              The hand that <br /> draws the Roadmap.
            </h2>
            <div className="mt-6 space-y-4 text-[14px] leading-[1.8] text-ink/75">
              <p>
                Tai Shobajo authors every Roadmap, holds creative direction, and carries the standard.
                He works from Murfreesboro, Tennessee, with a team that has built alongside him for
                years.
              </p>
              <p>Every engagement holds three roles.</p>
            </div>
            <ul className="mt-5 space-y-3 text-[14px] leading-[1.7] text-ink/80">
              <li className="flex items-start gap-3">
                <ConductorIcon>
                  <Compass className="h-3.5 w-3.5" />
                </ConductorIcon>
                <p>
                  <span className="font-medium text-ink">The client</span> brings the world.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <ConductorIcon>
                  <Star className="h-3.5 w-3.5" />
                </ConductorIcon>
                <p>
                  <span className="font-medium text-ink">The Conductor</span> protects the world.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <ConductorIcon>
                  <MapIcon className="h-3.5 w-3.5" />
                </ConductorIcon>
                <p>
                  <span className="font-medium text-ink">The team</span> builds the world.
                </p>
              </li>
            </ul>
          </Reveal>

          <Reveal as="div" variant="fade-up" delay={200} className="lg:col-span-3">
            <aside className="rounded-md border border-rule/70 bg-white/60 p-5 text-[12.5px] leading-[1.65] text-ink/75">
              <span className="block h-px w-8 bg-royal/70" />
              <div className="mt-3 flex items-start gap-2">
                <Compass className="mt-0.5 h-4 w-4 flex-none text-royal" />
                <p>We do the hard work so your mindset can lead the Roadmap.</p>
              </div>
              <p className="mt-3">Business runs better, and character builds what lasts.</p>
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------- HOW WE THINK ---------------------- */
function PrincipleCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-md border border-paper/15 bg-paper/[0.03] p-6 transition-colors hover:bg-paper/[0.06]">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-paper/25 text-paper/80">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-[18px] leading-snug text-paper">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-[1.7] text-paper/65">{body}</p>
    </div>
  );
}

function StarsField({
  count = 60,
  width = 1200,
  height = 600,
  seedSalt = 1,
  durRange = [2.4, 5.5],
}: {
  count?: number;
  width?: number;
  height?: number;
  seedSalt?: number;
  durRange?: [number, number];
}) {
  const stars = React.useMemo(() => {
    const seeded = (i: number) => {
      const x = Math.sin(i * 7.13 + seedSalt * 11.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const [dMin, dMax] = durRange;
    const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
    return Array.from({ length: count }).map((_, i) => ({
      x: round(seeded(i) * width),
      y: round(seeded(i + 9) * height),
      r: round(0.4 + seeded(i + 19) * 1.4),
      oMin: round(0.1 + seeded(i + 29) * 0.25),
      oMax: round(0.55 + seeded(i + 41) * 0.45),
      dur: round(dMin + seeded(i + 53) * (dMax - dMin)),
      delay: round(seeded(i + 67) * dMax),
    }));
  }, [count, width, height, seedSalt, durRange]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          className="twinkle-star"
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#cfe0ff"
          style={
            {
              ["--o-min" as never]: s.oMin,
              ["--o-max" as never]: s.oMax,
              ["--dur" as never]: `${s.dur}s`,
              ["--d" as never]: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </svg>
  );
}

function HowWeThink() {
  const { ref, paused } = useInViewPause<HTMLElement>();
  const isSmall = useIsSmallViewport();
  return (
    <section
      ref={ref}
      data-anim-paused={paused ? "true" : "false"}
      className="contour-bg relative overflow-hidden py-20 lg:py-24"
    >
      <StarsField
        count={isSmall ? 28 : 70}
        width={1400}
        height={700}
        seedSalt={3}
        durRange={[2.8, 6]}
      />
      <div className={`relative ${container}`}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[760px] text-center">
          <Eyebrow tone="paper">How We Think</Eyebrow>
          <h2 className="mt-3 font-display text-[28px] leading-[1.2] tracking-tight text-paper sm:text-[34px] lg:text-[40px]">
            How we think when no one is watching.
          </h2>
          <p className="mt-5 text-[13.5px] leading-[1.8] text-paper/70">
            Underneath the work sits one conviction: every person on the other end of it is spirit
            first. A human carrying weight, building a vision, holding more than the people around them
            know. Not a lead. Not a conversion. We call that foundation Spirit First, and it decides how
            we work before any work begins.
          </p>
        </Reveal>

        <Reveal as="div" variant="fade-up" delay={120} className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PrincipleCard
            icon={<Star className="h-4 w-4" />}
            title="The Cathedral Standard"
            body="If it will not hold in five years, we do not build it today."
          />
          <PrincipleCard
            icon={<Leaf className="h-4 w-4" />}
            title="Stewardship over extraction"
            body="A Roadmap a founder can carry into a future without us is a Roadmap we built well."
          />
          <PrincipleCard
            icon={<Gauge className="h-4 w-4" />}
            title="Nothing ships below a nine"
            body="Not perfectionism. The client deserves the version that works."
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------- HONEST FIT ---------------------- */
function FitCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-md border border-rule/70 bg-white/60 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-royal/30 hover:shadow-[0_18px_40px_-28px_rgba(10,23,51,0.25)]">
      <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-royal/30 text-royal transition-colors group-hover:border-royal/60">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-[18px] leading-snug text-ink">{title}</h3>
      <p className="mt-2 text-[13px] leading-[1.7] text-ink/70">{body}</p>
    </div>
  );
}

function HonestFit() {
  return (
    <section className="bg-paper py-20 lg:py-24">
      <div className={container}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[760px] text-center">
          <Eyebrow>The Commitment</Eyebrow>
          <h2 className="mt-3 font-display text-[28px] leading-[1.2] tracking-tight text-ink sm:text-[34px] lg:text-[40px]">
            We are not the right partner for everyone.
          </h2>
          <p className="mt-4 text-[13.5px] leading-[1.8] text-ink/65">
            Founders we partner best with: people who choose becoming over buying, because we go
            farther together and stay together over time.
          </p>
        </Reveal>

        <Reveal as="div" variant="fade-up" delay={120} className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <FitCard
            icon={<Sun className="h-4 w-4" />}
            title="Treatment of Light"
            body="We value what matters, not what's loud."
          />
          <FitCard
            icon={<MapIcon className="h-4 w-4" />}
            title="Discipline Without a Map"
            body="We respect the map, not the shortcut."
          />
          <FitCard
            icon={<Scale className="h-4 w-4" />}
            title="Price Alone"
            body="We measure in transformation investments."
          />
        </Reveal>

        <Reveal as="p" variant="fade-up" delay={220} className="mx-auto mt-8 max-w-[640px] text-center text-[13px] leading-[1.7] text-ink/60">
          If that costs us work, it was work we were going to do badly.
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------- CLOSE / CTA ---------------------- */
function ConstellationBG() {
  const isSmall = useIsSmallViewport();
  const count = isSmall ? 30 : 70;
  const stars = React.useMemo(() => {
    const seeded = (i: number) => {
      const x = Math.sin(i * 7.13) * 43758.5453;
      return x - Math.floor(x);
    };
    const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
    return Array.from({ length: count }).map((_, i) => ({
      x: round(seeded(i) * 380),
      y: round(seeded(i + 9) * 260),
      r: round(0.4 + seeded(i + 19) * 1.6),
      oMin: round(0.1 + seeded(i + 29) * 0.3),
      oMax: round(0.55 + seeded(i + 41) * 0.45),
      dur: round(3.2 + seeded(i + 53) * 4.5),
      delay: round(seeded(i + 67) * 5),
    }));
  }, [count]);
  return (
    <svg
      viewBox="0 0 380 260"
      className="pointer-events-none absolute inset-y-0 left-0 h-full w-[55%] opacity-90"
      preserveAspectRatio="xMinYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="star-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7aa9ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7aa9ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {stars.map((s, i) => (
        <circle
          key={i}
          className="twinkle-star"
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#cfe0ff"
          style={
            {
              ["--o-min" as never]: s.oMin,
              ["--o-max" as never]: s.oMax,
              ["--dur" as never]: `${s.dur}s`,
              ["--d" as never]: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
      <circle cx="120" cy="150" r="38" fill="url(#star-glow)" className="ring-breathe" />
    </svg>
  );
}

function PaperPlane() {
  // arc trail from lower-left to upper-right across the CTA, looped
  const trailD = "M40 360 C 220 260, 380 320, 540 180 S 880 60, 1100 40";
  return (
    <svg
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <path
        className="plane-trail"
        d={trailD}
        fill="none"
        stroke="#cfe0ff"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinecap="round"
        style={{ ["--len" as never]: 1500 } as React.CSSProperties}
      />
      {/* paper plane glyph — nose points to +X so rotate="auto" flies forward */}
      <g opacity="0.92">
        <g transform="translate(-12 -8)">
          <path
            d="M24 8 L0 0 L8 8 L0 16 Z"
            fill="#eaf2ff"
            stroke="#7aa9ff"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path d="M8 8 L0 8" stroke="#7aa9ff" strokeWidth="0.8" strokeLinecap="round" />
        </g>
        <animateMotion
          dur="11s"
          repeatCount="indefinite"
          rotate="auto"
          path={trailD}
          keyPoints="0;1"
          keyTimes="0;1"
          calcMode="spline"
          keySplines="0.4 0 0.2 1"
        />
      </g>
    </svg>
  );
}

function CloseCTA() {
  const { ref, paused } = useInViewPause<HTMLElement>();
  return (
    <section
      ref={ref}
      data-anim-paused={paused ? "true" : "false"}
      id="cta"
      className="relative overflow-hidden py-20 lg:py-24"
      style={{
        background:
          "linear-gradient(to right, oklch(0.18 0.05 262) 0%, oklch(0.14 0.05 262) 60%, oklch(0.13 0.05 262) 100%)",
      }}
    >
      <ConstellationBG />
      <PaperPlane />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[60%]"
        style={{
          background:
            "linear-gradient(to left, oklch(0.14 0.05 262) 30%, transparent 100%)",
        }}
      />
      <div className={`relative ${container}`}>
        <Reveal as="div" variant="fade-up" className="mx-auto max-w-[680px] text-center">
          <span className="mx-auto mb-6 block h-px w-10 bg-paper/30" />
          <h2 className="font-display text-[28px] leading-[1.2] tracking-tight text-paper sm:text-[32px] lg:text-[36px]">
            Care more than anyone expects you to.
          </h2>
          <div className="mx-auto mt-5 max-w-[58ch] space-y-2 text-[13.5px] leading-[1.8] text-paper/75">
            <p>Your ambition matters, so does your partner. Done right.</p>
            <p>We map the work in 2 weeks, find what fits, and fund it.</p>
            <p>
              If that's how you build, let's build your Roadmap. If not, that's OK; we are happy to
              point you toward someone who is.
            </p>
          </div>
          <div className="mt-7 flex justify-center">
            <PrimaryCTA variant="light">Build My Roadmap</PrimaryCTA>
          </div>
          <p className="mt-4 text-[12px] text-paper/55">
            A 30-minute conversation. No pitch. If the timing is right we should talk.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

