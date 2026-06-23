import aceyus from "@/assets/clients/Aceyus.png.asset.json";
import book4time from "@/assets/clients/Book4Time.webp.asset.json";
import hellopaid from "@/assets/clients/Hellopaid.webp.asset.json";
import keep from "@/assets/clients/Keep_Financial.webp.asset.json";
import payStandards from "@/assets/clients/PayStandards.webp.asset.json";
import pitcher from "@/assets/clients/Pitcher.webp.asset.json";
import emci from "@/assets/clients/PTTanywhere.png.asset.json";
import realLeaders from "@/assets/clients/Real_Leaders.webp.asset.json";

type Logo = { name: string; src: string };

// Curated set — every mark is a real relationship we can stand behind.
// All logos render at the same optical weight in a single royal ink so
// the row reads as one confident wall of proof.
const LOGOS: Logo[] = [
  { name: "Aceyus, a Five9 company", src: aceyus.url },
  { name: "Agilysys Book4Time", src: book4time.url },
  { name: "Keep Financial", src: keep.url },
  { name: "PayStandards", src: payStandards.url },
  { name: "EMCI Wireless", src: emci.url },
  { name: "Pitcher", src: pitcher.url },
  { name: "Hellopaid", src: hellopaid.url },
  { name: "Real Leaders", src: realLeaders.url },
];

export function ClientMarquee() {
  const loop = [...LOGOS, ...LOGOS];
  return (
    <section
      className="border-y border-rule/70 bg-white"
      aria-labelledby="client-marquee-heading"
    >
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-10 lg:py-7">
        <h2
          id="client-marquee-heading"
          className="text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink/55"
        >
          Trusted by teams at
        </h2>

        <div
          className="tt-marquee group relative mt-5 overflow-hidden"
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
                <span
                  className="tt-marquee__mark"
                  style={{
                    WebkitMaskImage: `url(${logo.src})`,
                    maskImage: `url(${logo.src})`,
                  }}
                  role="img"
                  aria-label={logo.name}
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
          /* Uniform optical cell — every logo gets the same room so the row
             reads as one weight, one rhythm. */
          height: 44px;
          width: 168px;
          padding: 0 12px;
        }
        @media (min-width: 768px) {
          .tt-marquee__cell {
            height: 48px;
            width: 184px;
            padding: 0 14px;
          }
        }
        @media (min-width: 1280px) {
          .tt-marquee__cell {
            height: 52px;
            width: 200px;
            padding: 0 16px;
          }
        }
        @media (min-width: 1440px) {
          .tt-marquee__cell {
            height: 56px;
            width: 220px;
            padding: 0 18px;
          }
        }
        @media (min-width: 1920px) {
          .tt-marquee__cell {
            height: 60px;
            width: 248px;
            padding: 0 22px;
          }
        }
        .tt-marquee__mark {
          /* CSS mask normalizes every logo to a single ink — no per-logo
             color, weight, or opacity variance. */
          display: block;
          width: 100%;
          height: 100%;
          background-color: var(--royal);
          opacity: 0.7;
          transition: opacity 300ms ease;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-size: contain;
          mask-size: contain;
        }
        .tt-marquee:hover .tt-marquee__mark {
          opacity: 0.9;
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
