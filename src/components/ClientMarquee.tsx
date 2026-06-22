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

type Logo = { name: string; src: string; heightClass: string };

const LOGOS: Logo[] = [
  { name: "PayStandards", src: payStandards.url, heightClass: "h-8 md:h-9" },
  { name: "EMCI Wireless", src: emci.url, heightClass: "h-12 md:h-14" },
  { name: "paid", src: hellopaid.url, heightClass: "h-10 md:h-12" },
  { name: "Aceyus, a Five9 company", src: aceyus.url, heightClass: "h-9 md:h-10" },
  { name: "Keep Financial", src: keep.url, heightClass: "h-10 md:h-12" },
  { name: "Creative World School", src: cws.url, heightClass: "h-10 md:h-12" },
  { name: "Agilysys Book4Time", src: book4time.url, heightClass: "h-12 md:h-14" },
  { name: "Destination Magic", src: destinationMagic.url, heightClass: "h-9 md:h-10" },
  { name: "Pitcher", src: pitcher.url, heightClass: "h-7 md:h-8" },
  { name: "Real Leaders", src: realLeaders.url, heightClass: "h-7 md:h-8" },
];

export function ClientMarquee() {
  const loop = [...LOGOS, ...LOGOS];
  return (
    <section className="border-y border-rule/70 bg-white" aria-label="Clients">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
        <p className="text-center font-sans text-[12px] uppercase tracking-[0.18em] text-ink/55">
          Trusted by teams at
        </p>
        <div
          className="group relative mt-8 overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div className="marquee-track flex w-max items-center gap-14 md:gap-20">
            {loop.map((logo, i) => (
              <img
                key={`${logo.name}-${i}`}
                src={logo.src}
                alt={logo.name}
                loading="lazy"
                className={`${logo.heightClass} w-auto flex-none object-contain opacity-70 grayscale transition duration-300 hover:opacity-100`}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .marquee-track {
          animation: tt-marquee 45s linear infinite;
        }
        .group:hover .marquee-track {
          animation-play-state: paused;
        }
        @keyframes tt-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>
    </section>
  );
}

export default ClientMarquee;
