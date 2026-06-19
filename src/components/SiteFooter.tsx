import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";

const REASONS = [
  {
    title: "We listen first",
    body: "You talk. We map. You leave with a clearer picture of your business either way.",
  },
  {
    title: "Clarity you can keep",
    body: "Leave with insight you can use, even if we never build together.",
  },
  {
    title: "The right fit, or none",
    body: "We will tell you plainly if we are not the right partner for your map.",
  },
];

const NAV_LINKS: Array<{ label: string; to: string }> = [
  { label: "The Roadmap", to: "/" },
  { label: "What We Build", to: "/what-we-build" },
  { label: "Investment", to: "/investment" },
  { label: "About", to: "/about" },
  { label: "Insights", to: "/insights" },
  { label: "The Walks", to: "/walks" },
];

function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function RouteMark({ inView, small = false }: { inView: boolean; small?: boolean }) {
  const h = small ? 10 : 16;
  const dotR = small ? 3 : 5;
  return (
    <div
      className={`tt-routemark ${inView ? "is-in" : ""} ${small ? "tt-routemark--sm" : ""}`}
      style={{ height: h }}
      aria-hidden="true"
    >
      <div className="tt-routemark__track" />
      <div className="tt-routemark__marker" style={{ width: dotR * 2, height: dotR * 2 }}>
        <div className="tt-routemark__glow" />
        <div className="tt-routemark__core" />
      </div>
    </div>
  );
}

export function SiteFooter() {
  const headline = useInViewOnce<HTMLDivElement>();
  const reasons = useInViewOnce<HTMLDivElement>();
  return (
    <footer id="cta" className="relative bg-[#0A0F1F] text-paper">
      {/* faint topographic contour texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 22% 38%, transparent 0, transparent 46px, rgba(255,255,255,0.6) 46px, rgba(255,255,255,0.6) 47px), repeating-radial-gradient(circle at 78% 68%, transparent 0, transparent 56px, rgba(255,255,255,0.5) 56px, rgba(255,255,255,0.5) 57px)",
        }}
      />

      <style>{`
        .tt-routemark { position: relative; width: 100%; }
        .tt-routemark__track {
          position: absolute;
          top: 50%;
          left: 0;
          height: 2px;
          transform: translateY(-50%);
          background-image: radial-gradient(circle, oklch(0.85 0.14 252 / 0.85) 1px, transparent 1.4px);
          background-size: 7px 2px;
          background-repeat: repeat-x;
          background-position: left center;
          right: 0;
          width: 0%;
          transition: width 900ms linear;
        }
        .tt-routemark.is-in .tt-routemark__track { width: 100%; }
        .tt-routemark__marker {
          position: absolute;
          top: 50%;
          right: 0;
          transform: translate(50%, -50%);
          border-radius: 9999px;
          opacity: 0;
          transition: opacity 200ms linear 900ms;
        }
        .tt-routemark.is-in .tt-routemark__marker { opacity: 1; }
        .tt-routemark__core {
          position: absolute; inset: 0;
          border-radius: 9999px;
          background: oklch(0.92 0.12 252);
          box-shadow: 0 0 0 1px oklch(1 0 0 / 0.25);
        }
        .tt-routemark__glow {
          position: absolute;
          left: 50%; top: 50%;
          width: 56px; height: 56px;
          transform: translate(-50%, -50%);
          border-radius: 9999px;
          background: radial-gradient(circle, oklch(0.85 0.18 252 / 0.55) 0%, oklch(0.7 0.18 252 / 0.18) 35%, transparent 70%);
          filter: blur(6px);
          pointer-events: none;
        }
        .tt-routemark--sm .tt-routemark__glow { width: 26px; height: 26px; filter: blur(3px); }
        .tt-routemark.tt-routemark--pulse.is-in .tt-routemark__marker {
          animation: tt-marker-pulse 1100ms ease-out 900ms 1 both;
        }
        @keyframes tt-marker-pulse {
          0% { transform: translate(50%, -50%) scale(1); }
          40% { transform: translate(50%, -50%) scale(1.18); }
          100% { transform: translate(50%, -50%) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-routemark__track { width: 100% !important; transition: none !important; }
          .tt-routemark__marker { opacity: 1 !important; animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="relative mx-auto max-w-[1180px] px-6 pt-24 pb-16 lg:px-10 lg:pt-28">
        <div ref={headline.ref} className="relative">
          <div className="pointer-events-none absolute left-1/2 top-0 w-[min(720px,90%)] -translate-x-1/2 -translate-y-2">
            <div
              className={`tt-routemark tt-routemark--pulse ${headline.inView ? "is-in" : ""}`}
              style={{ height: 16 }}
              aria-hidden="true"
            >
              <div className="tt-routemark__track" />
              <div className="tt-routemark__marker" style={{ width: 14, height: 14 }}>
                <div className="tt-routemark__glow" />
                <div className="tt-routemark__core" />
              </div>
            </div>
          </div>

          <h2 className="mx-auto max-w-3xl pt-10 text-center font-display text-[clamp(1.9rem,4.2vw,2.75rem)] leading-[1.12] text-paper">
            Where you are is where you are.<br />
            Where you need to be is{" "}
            <span className="italic text-[oklch(0.92_0.07_85)] whitespace-nowrap">
              what we map next
            </span>
            .
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-center text-[13.5px] leading-relaxed text-paper/65">
            A 30-minute conversation. If the timing is right, we should talk. If it is not, the work is waiting when it is.
          </p>
        </div>

        <div ref={reasons.ref} className="mt-14 grid grid-cols-1 gap-12 sm:gap-10 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="mx-auto max-w-xs text-center">
              <div className="mx-auto w-32">
                <RouteMark inView={reasons.inView} small />
              </div>
              <h3 className="mt-5 font-display text-[1.25rem] leading-tight text-paper">{r.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-paper/65">{r.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex justify-center">
          <a
            href="#"
            className="group inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-paper px-7 text-[13.5px] font-semibold text-ink transition-colors hover:bg-paper/90 sm:w-auto"
          >
            Build My Roadmap
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      <div className="relative border-t border-paper/10">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-10 px-6 py-14 md:grid-cols-3 lg:px-10">
          <div>
            <TrustTaiLogo variant="white" />
            <p className="mt-3 text-[12.5px] text-paper/55">The system behind the system.</p>
          </div>
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/45">
              Navigation
            </div>
            <ul className="mt-4 space-y-2 text-[13px] text-paper/80">
              {NAV_LINKS.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="hover:text-paper">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-paper/45">
              Connect
            </div>
            <ul className="mt-4 space-y-2 text-[13px] text-paper/80">
              <li>Murfreesboro, Tennessee</li>
              <li>
                <a href="mailto:hello@trusttai.com" className="hover:text-paper">
                  hello@trusttai.com
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-paper">
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-paper/10">
          <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-3 px-6 py-5 text-[11.5px] text-paper/50 sm:flex-row sm:items-center lg:px-10">
            <span>© 2026 Trust Tai. All rights reserved.</span>
            <span className="flex gap-6">
              <a href="#" className="hover:text-paper">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-paper">
                Terms of Service
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
