import { Link } from "@tanstack/react-router";
import { Linkedin, Instagram } from "lucide-react";
import { NAV } from "@/components/SiteHeader";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

const NAVY = "#0A0F1F";
const container = "mx-auto max-w-[1240px] px-6 sm:px-8 lg:px-10";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.844l-5.36-6.99L4.6 22H1.34l8.02-9.165L1 2h7.02l4.84 6.39L18.244 2Zm-1.2 18h1.9L7.04 4H5.05l11.994 16Z" />
    </svg>
  );
}

/* Faint topographic texture for footer band */
function FooterContour() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1240 600"
    >
      <g fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1">
        {[60, 130, 220, 320, 430, 550].map((r) => (
          <ellipse key={`l-${r}`} cx="180" cy="600" rx={r * 1.7} ry={r} />
        ))}
        {[60, 130, 220, 320, 430, 550].map((r) => (
          <ellipse key={`r-${r}`} cx="1080" cy="20" rx={r * 1.7} ry={r} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Shared footer chrome. Used by SiteClosing (after the navy CTA slot) and
 * directly on pages that supply their own closing section (e.g. /build-my-roadmap).
 */
export function SiteFooter({ withTopTexture = true }: { withTopTexture?: boolean }) {
  return (
    <footer
      className="relative overflow-hidden text-white"
      style={{ backgroundColor: NAVY }}
    >
      {withTopTexture && <FooterContour />}
      <div className={`${container} relative pb-12 pt-16`}>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-0 md:divide-x md:divide-white/10">
          <div className="md:pr-8">
            <img src={logoWhite.url} alt="Trust Tai" className="h-7 w-auto" />
            <p className="mt-4 text-[13px] leading-[1.6] text-white/55">
              The system behind the system.
            </p>
          </div>
          <div className="md:px-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Navigate</p>
            <ul className="mt-4 space-y-2 text-[13px] text-white/70">
              {NAV.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} hash={n.hash} className="transition-colors hover:text-white">
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:px-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Connect</p>
            <ul className="mt-4 space-y-2 text-[13px] text-white/70">
              <li>Murfreesboro, Tennessee</li>
              <li>
                <a href="mailto:hello@trusttai.com" className="transition-colors hover:text-white">
                  hello@trusttai.com
                </a>
              </li>
            </ul>
          </div>
          <div className="md:pl-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Start</p>
            <div className="mt-4">
              <Link
                to="/build-my-roadmap"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[12.5px] text-white/80 transition-colors hover:border-white/50 hover:text-white"
              >
                Build my Roadmap
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/45 sm:flex-row sm:items-center">
          <p>© 2026 Trust Tai. All rights reserved.</p>
        </div>

      </div>
    </footer>
  );
}
