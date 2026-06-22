import aceyus from "@/assets/clients/Aceyus.png.asset.json";
import book4time from "@/assets/clients/Book4Time.webp.asset.json";
import cws from "@/assets/clients/CWS.webp.asset.json";
import destinationMagic from "@/assets/clients/Destination_Magic.webp.asset.json";
import hellopaid from "@/assets/clients/Hellopaid.webp.asset.json";
import keep from "@/assets/clients/Keep_Financial.webp.asset.json";
import payStandards from "@/assets/clients/PayStandards.webp.asset.json";
import pitcher from "@/assets/clients/Pitcher.webp.asset.json";
import emci from "@/assets/clients/PTTanywhere.png.asset.json";
import realLeaders from "@/assets/clients/Real_Leaders.webp.asset.json";
import sharkGroup from "@/assets/clients/Shark_Group.webp.asset.json";
import tuneUpFitness from "@/assets/clients/Tune_Up_Fitness.webp.asset.json";
import teamsynerG from "@/assets/clients/TeamsynerG.webp.asset.json";
import swellCollective from "@/assets/clients/Swell_Collective.webp.asset.json";

type Logo = { name: string; src: string; scale?: number };

// Each logo is rendered inside a uniform cell so wordmarks and square marks
// share the same optical weight. `scale` nudges individual marks that read
// visually small or large at the default cell height.
const LOGOS: Logo[] = [
  { name: "PayStandards", src: payStandards.url, scale: 0.85 },
  { name: "EMCI Wireless", src: emci.url, scale: 1.05 },
  { name: "paid", src: hellopaid.url, scale: 0.95 },
  { name: "Aceyus, a Five9 company", src: aceyus.url, scale: 0.9 },
  { name: "Keep Financial", src: keep.url, scale: 0.95 },
  { name: "Creative World School", src: cws.url, scale: 1 },
  { name: "Agilysys Book4Time", src: book4time.url, scale: 1.1 },
  { name: "Destination Magic", src: destinationMagic.url, scale: 0.9 },
  { name: "Pitcher", src: pitcher.url, scale: 0.75 },
  { name: "Real Leaders", src: realLeaders.url, scale: 0.75 },
  { name: "The Shark Group", src: sharkGroup.url, scale: 1 },
  { name: "Tune Up Fitness", src: tuneUpFitness.url, scale: 1 },
  { name: "TeamsynerG Global Consulting", src: teamsynerG.url, scale: 1 },
  { name: "The Swell Collective", src: swellCollective.url, scale: 1.05 },
];


export function ClientMarquee() {
  const loop = [...LOGOS, ...LOGOS];
  return (
    <section
      className="border-y border-rule/70 bg-white"
      aria-labelledby="client-marquee-heading"
    >
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
        <h2
          id="client-marquee-heading"
          className="text-center font-sans text-[12px] uppercase tracking-[0.18em] text-ink/55"
        >
          Trusted by teams at
        </h2>

        <div
          className="tt-marquee group relative mt-8 overflow-hidden"
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
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  style={{
                    maxHeight: `${(logo.scale ?? 1) * 100}%`,
                    maxWidth: `${(logo.scale ?? 1) * 100}%`,
                  }}
                  className="h-auto w-auto object-contain opacity-70 grayscale transition-opacity duration-300 group-hover:opacity-90"
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
        .tt-marquee__cell {
          /* Uniform optical cell — every logo gets the same vertical and
             horizontal room, so wordmarks and square marks balance.
             Cell grows in lockstep with viewport so spacing stays even
             from 1280px laptops through 1920px monitors. */
          height: 56px;
          width: 168px;
          padding: 0 12px;
        }
        @media (min-width: 768px) {
          .tt-marquee__cell {
            height: 60px;
            width: 184px;
            padding: 0 14px;
          }
        }
        @media (min-width: 1280px) {
          .tt-marquee__cell {
            height: 64px;
            width: 200px;
            padding: 0 16px;
          }
        }
        @media (min-width: 1440px) {
          .tt-marquee__cell {
            height: 68px;
            width: 220px;
            padding: 0 18px;
          }
        }
        @media (min-width: 1920px) {
          .tt-marquee__cell {
            height: 76px;
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
