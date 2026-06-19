import { Link } from "@tanstack/react-router";
import { NAV } from "@/components/SiteHeader";

const container = "mx-auto max-w-[1240px] px-6 sm:px-8 lg:px-10";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[oklch(0.13_0.05_265)] text-white">
      <ContourField />
      <div className={`${container} relative grid grid-cols-1 gap-8 py-12 sm:grid-cols-3`}>
        <div>
          <p className="font-display text-[18px] text-white">Trust Tai</p>
          <p className="mt-1 text-[11px] tracking-[0.2em] text-white/45">MAP. BUILD. SCALE.</p>
        </div>
        <ul className="space-y-1.5 text-[12.5px] text-white/65">
          {NAV.map((n) => (
            <li key={n.to}>
              <Link to={n.to} hash={n.hash} className="hover:text-white">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-start gap-4 text-[12px] text-white/55 sm:items-end">
          <p>© 2026 Trust Tai. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="hover:text-white">Privacy Policy</a>
            <a href="#" className="hover:text-white">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function ContourField() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1240 320"
    >
      <defs>
        <radialGradient id="footer-glow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="oklch(0.32 0.1 262)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="oklch(0.13 0.05 265)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1240" height="320" fill="url(#footer-glow)" />
      <g fill="none" stroke="oklch(0.85 0.04 262 / 0.06)" strokeWidth="1">
        {[40, 80, 130, 190, 260, 340].map((r) => (
          <ellipse key={`l-${r}`} cx="200" cy="340" rx={r * 1.6} ry={r} />
        ))}
        {[40, 80, 130, 190, 260, 340].map((r) => (
          <ellipse key={`r-${r}`} cx="1080" cy="-20" rx={r * 1.6} ry={r} />
        ))}
      </g>
    </svg>
  );
}
