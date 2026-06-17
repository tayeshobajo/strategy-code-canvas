import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";

type NavItem = { label: string; to: string; hash?: string };

const NAV: NavItem[] = [
  { label: "The Roadmap", to: "/" },
  { label: "What We Build", to: "/what-we-build" },
  { label: "Investment", to: "/investment" },
  { label: "About", to: "/about" },
  { label: "Insights", to: "/insights" },
  { label: "The Walks", to: "/walks" },
];

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (n: NavItem) => {
    if (n.to === "/what-we-build") return pathname === "/what-we-build";
    if (n.to === "/investment") return pathname === "/investment";
    if (n.to === "/about") return pathname === "/about";
    if (n.to === "/insights") return pathname.startsWith("/insights");
    if (n.to === "/walks") return pathname.startsWith("/walks");
    if (n.to === "/") return pathname === "/";
    return false;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-5 sm:px-6">
      <header className="pointer-events-auto w-full max-w-[1200px] rounded-full border border-rule/60 bg-paper/80 px-4 py-2 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_10px_30px_-12px_rgba(10,23,51,0.18)] backdrop-blur-xl sm:px-6">
        <div className="flex h-11 items-center justify-between gap-6 sm:h-12">
          <Link to="/" className="flex items-center text-ink">
            <TrustTaiLogo variant="dark" />
          </Link>
          <nav className="hidden items-center gap-8 text-[13px] text-ink/75 lg:flex">
          {NAV.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.label}
                  to={n.to}
                  hash={n.hash}
                  className={`relative pb-1 transition-colors hover:text-ink ${active ? "text-royal" : ""}`}
                >
                  {n.label}
                  {active && (
                    <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-royal" />
                  )}
                </Link>
              );
            })}
          </nav>
          <a
            href="#cta"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            Build My Roadmap <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>
    </div>
  );
}
