import aceyus from "@/assets/clients/Aceyus.png.asset.json";
import book4time from "@/assets/clients/Book4Time.webp.asset.json";
import hellopaid from "@/assets/clients/Hellopaid.webp.asset.json";
import keep from "@/assets/clients/Keep_Financial.webp.asset.json";
import payStandards from "@/assets/clients/PayStandards.webp.asset.json";
import pitcher from "@/assets/clients/Pitcher.webp.asset.json";
import emci from "@/assets/clients/PTTanywhere.png.asset.json";
import realLeaders from "@/assets/clients/Real_Leaders.webp.asset.json";
import sharkGroup from "@/assets/clients/The_Shark_Group.webp.asset.json";
import creativeWorld from "@/assets/clients/Creative_World_School.webp.asset.json";
import swell from "@/assets/clients/The_Swell_Collective.webp.asset.json";
import teamsynerg from "@/assets/clients/TeamsynerG_Global_Consulting.webp.asset.json";

type LogoWeight = "heavy" | "normal" | "light";
type Logo = { name: string; src: string; weight?: LogoWeight };

// Curated set. Every mark is a real relationship we can stand behind.
// All logos render at the same optical weight in black and white so the
// row reads as one confident wall of proof. `weight` tags per-logo tune
// the opacity/contrast so naturally heavy marks don't overpower thin ones.
const LOGOS: Logo[] = [
  { name: "Aceyus, a Five9 company", src: aceyus.url, weight: "light" },
  { name: "Agilysys Book4Time", src: book4time.url },
  { name: "Keep Financial", src: keep.url },
  { name: "PayStandards", src: payStandards.url },
  { name: "EMCI Wireless", src: emci.url },
  { name: "Pitcher", src: pitcher.url, weight: "light" },
  { name: "Hellopaid", src: hellopaid.url, weight: "light" },
  { name: "Real Leaders", src: realLeaders.url },
  { name: "The Shark Group", src: sharkGroup.url, weight: "heavy" },
  { name: "Creative World School", src: creativeWorld.url, weight: "heavy" },
  { name: "The Swell Collective", src: swell.url, weight: "heavy" },
  { name: "TeamsynerG Global Consulting", src: teamsynerg.url, weight: "heavy" },
];

export function ClientMarquee() {
  const loop = [...LOGOS, ...LOGOS];
  return (
    <section
      className="border-y border-rule/70 bg-white"
      aria-labelledby="client-marquee-heading"
    >
      <div className="mx-auto max-w-7xl px-6 py-5 lg:px-10 lg:py-6">
        <h2
          id="client-marquee-heading"
          className="text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55"
        >
          Trusted by teams at
        </h2>

        <div
          className="tt-marquee group relative mt-4 overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          {/* Visually scrolling track is decorative; the static list below
              gives assistive tech a stable, non-duplicated reading order. */}
          <ul
            className="tt-marquee__track flex w-max items-center"
            aria-hidden="true"
          >
            {loop.map((logo, i) => (
              <li
                key={`${logo.name}-${i}`}
                className="tt-marquee__cell flex shrink-0 items-center justify-center"
              >
                <img
                  src={logo.src}
                  alt=""
                  width={220}
                  height={52}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  data-weight={logo.weight ?? "normal"}
                  className="tt-marquee__logo h-auto max-h-full w-auto max-w-full object-contain transition-opacity duration-300"
                />

              </li>
            ))}
          </ul>

          <ul className="sr-only">
            {LOGOS.map((logo) => (
              <li key={logo.name}>{logo.name}</li>
            ))}
          </ul>
        </div>
      </div>

      <style>{`
        .tt-marquee__logo {
          /* Desaturate every mark to a single ink family so the row reads
             as one weight, regardless of each logo's native palette. We
             skip brightness(0) so already-heavy logos aren't further
             painted-on, then tune per-logo weight below. */
          filter: grayscale(1) contrast(0.95);
          opacity: 0.6;
        }
        .tt-marquee__logo[data-weight="heavy"] {
          /* Naturally chunky wordmarks (Creative World, Swell, TeamsynerG,
             Shark Group) — pull them back so they don't shout. */
          opacity: 0.42;
          filter: grayscale(1) contrast(0.9);
        }
        .tt-marquee__logo[data-weight="light"] {
          /* Thin wordmarks (Aceyus, Pitcher, Hellopaid) — give them a
             touch more presence so they hold their own in the row. */
          opacity: 0.72;
          filter: grayscale(1) contrast(1.05) brightness(0.9);
        }
        .tt-marquee:hover .tt-marquee__logo,
        .tt-marquee:focus-within .tt-marquee__logo {
          opacity: 0.8;
        }
        .tt-marquee:hover .tt-marquee__logo[data-weight="heavy"],
        .tt-marquee:focus-within .tt-marquee__logo[data-weight="heavy"] {
          opacity: 0.6;
        }
        .tt-marquee:hover .tt-marquee__logo[data-weight="light"],
        .tt-marquee:focus-within .tt-marquee__logo[data-weight="light"] {
          opacity: 0.9;
        }
        .tt-marquee__cell {
          /* Uniform optical cell. Every logo gets the same room so the row
             reads as one weight, one rhythm. */
          height: 40px;
          width: 168px;
          padding: 0 12px;
        }
        @media (min-width: 768px) {
          .tt-marquee__cell {
            height: 44px;
            width: 184px;
            padding: 0 14px;
          }
        }
        @media (min-width: 1280px) {
          .tt-marquee__cell {
            height: 48px;
            width: 200px;
            padding: 0 16px;
          }
        }
        @media (min-width: 1440px) {
          .tt-marquee__cell {
            height: 52px;
            width: 220px;
            padding: 0 18px;
          }
        }
        @media (min-width: 1920px) {
          .tt-marquee__cell {
            height: 56px;
            width: 248px;
            padding: 0 22px;
          }
        }
        .tt-marquee__track {
          /* GPU-friendly transform animation; no layout/paint per frame. */
          animation: tt-marquee-scroll 50s linear infinite;
          will-change: transform;
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
        }
        .tt-marquee:hover .tt-marquee__track,
        .tt-marquee:focus-within .tt-marquee__track {
          animation-play-state: paused;
        }
        @keyframes tt-marquee-scroll {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-marquee__track {
            animation: none;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}

export default ClientMarquee;
