import { useEffect, useRef, useState, useCallback } from "react";
import {
  Home,
  Activity,
  EyeOff,
  FileText,
  type LucideIcon,
} from "lucide-react";

type NavChild = { id: number; label: string };
type NavItem = {
  id: number;
  label: string;
  Icon: LucideIcon;
  children?: NavChild[];
};

const items: NavItem[] = [
  { id: 0, label: "Point A: Current Position", Icon: Activity },
  { id: 1, label: "The Milestones", Icon: EyeOff },
  { id: 2, label: "A note from Tai", Icon: FileText },
];


export function SideNav() {
  const [active, setActive] = useState(0);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const scrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[id^="section-"]')
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.id;
          const idx = parseInt(id.replace("section-", ""), 10);
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1.0], rootMargin: "-40% 0px -40% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((i: number) => {
    const el = document.getElementById(`section-${i}`);
    if (!el) return;

    scrollingRef.current = true;
    setActive(i);
    setHoveredGroup(null);

    const h = window.innerHeight || document.documentElement.clientHeight || 1;
    window.scrollTo({ top: i * h, behavior: "smooth" });

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollingRef.current = false;
    }, 900);
  }, []);

  const openGroup = (id: number) => {
    if (hoverCloseRef.current) clearTimeout(hoverCloseRef.current);
    setHoveredGroup(id);
  };
  const scheduleClose = () => {
    if (hoverCloseRef.current) clearTimeout(hoverCloseRef.current);
    hoverCloseRef.current = setTimeout(() => setHoveredGroup(null), 180);
  };

  return (
    <nav
      aria-label="Section navigation"
      className="fixed right-4 top-1/2 z-[100] hidden -translate-y-1/2 lg:block"
    >
      <ul
        className="flex flex-col items-center gap-0.5 rounded-full px-1.5 py-2 backdrop-blur"
        style={{
          backgroundColor: "rgba(10,14,28,0.55)",
          boxShadow:
            "0 12px 30px -10px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {items.map(({ id, label, Icon, children }) => {
          const isActive = children
            ? children.some((c) => c.id === active)
            : active === id;
          const isOpen = hoveredGroup === id;
          return (
            <li
              key={id}
              className="relative"
              onMouseEnter={() => children && openGroup(id)}
              onMouseLeave={() => children && scheduleClose()}
            >
              <button
                type="button"
                onClick={() => goTo(id)}
                aria-label={label}
                aria-current={isActive ? "true" : undefined}
                title={label}
                className="group relative flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                style={{
                  backgroundColor: isActive
                    ? "rgba(255,255,255,0.10)"
                    : "transparent",
                  boxShadow: isActive
                    ? "inset 0 0 0 1px rgba(255,255,255,0.35)"
                    : "none",
                }}
              >
                <Icon
                  size={14}
                  strokeWidth={1.6}
                  color={isActive ? "#ffffff" : "rgba(255,255,255,0.6)"}
                />
                {!children && (
                  <span
                    className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-2xl px-2 py-1 text-[10px] font-medium tracking-wide opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      backgroundColor: "rgba(10,14,28,0.95)",
                      color: "#fff",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    }}
                  >
                    {label}
                  </span>
                )}
              </button>

              {children && isOpen && (
                <div
                  className="absolute right-full top-1/2 mr-3 -translate-y-1/2"
                  onMouseEnter={() => openGroup(id)}
                  onMouseLeave={scheduleClose}
                >
                  <div
                    className="flex flex-col gap-1 rounded-2xl px-2 py-2"
                    style={{
                      backgroundColor: "rgba(10,14,28,0.95)",
                      boxShadow:
                        "0 12px 30px -10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {label}
                    </div>
                    {children.map((c) => {
                      const cActive = active === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => goTo(c.id)}
                          className="whitespace-nowrap rounded-xl px-3 py-1.5 text-left text-[11px] font-medium transition-colors"
                          style={{
                            backgroundColor: cActive
                              ? "rgba(255,255,255,0.12)"
                              : "transparent",
                            color: cActive
                              ? "#fff"
                              : "rgba(255,255,255,0.7)",
                          }}
                          onMouseOver={(e) => {
                            if (!cActive)
                              e.currentTarget.style.backgroundColor =
                                "rgba(255,255,255,0.06)";
                          }}
                          onMouseOut={(e) => {
                            if (!cActive)
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                          }}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default SideNav;