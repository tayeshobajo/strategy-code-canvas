import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { X, ArrowRight, Users, Clock, Compass, LayoutGrid, ShieldCheck } from "lucide-react";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { showRoadmapInvite } from "@/lib/roadmap-invite-visibility";

const SESSION_KEY = "tt_roadmap_invite_state_v1";
const CUE_KEY = "tt_roadmap_invite_cue_v1";

export const INVITE_COPY = {
  pill: "Need clarity?",
  marker: "BUILD YOUR ROADMAP",
  eyebrow: "START WITH THE PICTURE",
  headline: "Let's get clear on what comes next.",
  body: "You do not need to have everything figured out before you begin. Tell us where the business is today, what you are trying to build, and what feels harder than it should. We'll use the conversation to understand the full picture before deciding what deserves attention next.",
  presence: "Tai reads every conversation personally.",
  cards: [
    { title: "Honest conversations", note: "No polished brief required." },
    { title: "Clear next steps", note: "You leave knowing what comes first." },
    { title: "Reviewed personally", note: "Your context reaches Trust Tai intact." },
  ],
  cta: "Build Your Roadmap",
  time: "A thoughtful conversation. About 10 minutes.",
  footer:
    "For founders and teams carrying something they want to make clearer, stronger, or easier to run.",
};

const CARD_ICONS = [Compass, LayoutGrid, ShieldCheck];

const HEADLINE_LEAD = "Let's get clear on";
const HEADLINE_ACCENT = "what comes next.";

const NAVY = "#0A0F1F";

function readSession(): "open" | "closed" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SESSION_KEY);
    return v === "open" || v === "closed" ? v : null;
  } catch {
    return null;
  }
}

function writeSession(v: "open" | "closed") {
  try {
    window.sessionStorage.setItem(SESSION_KEY, v);
  } catch {
    /* storage blocked; state stays in memory */
  }
}

/** Fade-up wrapper with a small stagger delay. */
function Reveal({
  show,
  delay,
  className,
  children,
}: {
  show: boolean;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`transition-[opacity,transform] duration-[420ms] ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100 ${
        show ? "translate-y-0 opacity-100" : "translate-y-[6px] opacity-0"
      } ${className ?? ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function RoadmapInvite() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // panel in the DOM
  const [visible, setVisible] = useState(false); // panel animated in
  const [pillIn, setPillIn] = useState(false);
  const [cue, setCue] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Session memory: reopen only if the visitor left it open this session.
  useEffect(() => {
    if (readSession() === "open") {
      setOpen(true);
      setMounted(true);
    }
    const t = window.setTimeout(() => setPillIn(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Drive enter/exit transitions.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(t);
  }, [open]);

  // One gentle attention cue per session, never repeating.
  useEffect(() => {
    if (open) return;
    let already = false;
    try {
      already = window.sessionStorage.getItem(CUE_KEY) === "1";
    } catch {
      already = true;
    }
    if (already) return;
    const start = window.setTimeout(() => {
      setCue(true);
      try {
        window.sessionStorage.setItem(CUE_KEY, "1");
      } catch {
        /* storage blocked */
      }
      window.setTimeout(() => setCue(false), 1400);
    }, 6000);
    return () => window.clearTimeout(start);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    writeSession("closed");
    window.setTimeout(() => pillRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-invite-cta]")?.focus();
    }, 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, close]);

  if (!showRoadmapInvite(pathname)) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
      }}
      data-testid="roadmap-invite"
    >
      {mounted ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Build your roadmap invitation"
          className={`pointer-events-auto max-h-[82vh] w-full max-w-none origin-bottom-right overflow-y-auto overscroll-contain rounded-[20px] border border-[color:var(--rule)] bg-[color:var(--paper-soft)] text-ink transition-[opacity,transform] duration-[280ms] ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100 sm:max-w-[404px] ${
            visible
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-3 scale-[0.98] opacity-0"
          }`}
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,.7) inset, 0 18px 44px -34px rgba(10,15,31,.30), 0 0 0 8px color-mix(in oklab, var(--royal) 4%, transparent)",
          }}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--rule-soft)] px-5 py-4">
            <div className="min-w-0">
              <TrustTaiLogo />
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close invitation"
              className="group grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[color:var(--rule)] bg-background text-[color:color-mix(in_oklab,var(--ink)_65%,transparent)] transition-colors hover:bg-[color:var(--row-hover-bg)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90 motion-reduce:transform-none" />
            </button>
          </div>

          <div className="px-5 pb-5 pt-5">
            <Reveal show={visible} delay={60}>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-royal">
                {INVITE_COPY.eyebrow}
              </p>
            </Reveal>
            <Reveal show={visible} delay={120} className="mt-2.5">
              <h2 className="font-display text-[26px] leading-[1.1] tracking-tight text-ink">
                {HEADLINE_LEAD}{" "}
                <span className="italic text-royal">{HEADLINE_ACCENT}</span>
              </h2>
            </Reveal>
            <Reveal show={visible} delay={180} className="mt-3">
              <p className="text-[13px] leading-[1.6] text-[color:color-mix(in_oklab,var(--ink)_80%,transparent)]">
                {INVITE_COPY.body}
              </p>
            </Reveal>

            <Reveal show={visible} delay={240} className="mt-4">
              <ul className="grid grid-cols-3 divide-x divide-[color:var(--rule-soft)] overflow-hidden rounded-[12px] border border-[color:var(--rule)] bg-background">
                {INVITE_COPY.cards.map((c, i) => {
                  const Icon = CARD_ICONS[i] ?? Compass;
                  return (
                    <li key={c.title} className="px-2.5 py-3 text-center">
                      <Icon
                        className="mx-auto h-4 w-4 text-royal"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      <p className="mt-1.5 text-[11px] font-medium leading-tight text-ink">
                        {c.title}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Reveal>

            <Reveal show={visible} delay={300} className="mt-5">
              <Link
                to="/build-my-roadmap"
                data-invite-cta
                onClick={close}
                className="group flex w-full cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.985] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
                style={{ backgroundColor: NAVY, height: "56px" }}
              >
                <span className="pointer-events-none">{INVITE_COPY.cta}</span>
                <ArrowRight className="pointer-events-none h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none" />
              </Link>
            </Reveal>

            <Reveal show={visible} delay={360} className="mt-3">
              <div className="flex items-center justify-center gap-2 text-[color:color-mix(in_oklab,var(--ink)_52%,transparent)]">
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em]">
                  {INVITE_COPY.time}
                </p>
              </div>
            </Reveal>

            <Reveal show={visible} delay={420} className="mt-3">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34C4EB] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34C4EB]" />
                </span>
                <p className="text-[11.5px] text-[color:color-mix(in_oklab,var(--ink)_58%,transparent)]">
                  {INVITE_COPY.presence}
                </p>
              </div>
            </Reveal>
          </div>

          <div className="flex items-start gap-2.5 border-t border-[color:var(--rule-soft)] px-5 py-3.5">
            <Users
              className="mt-[2px] h-4 w-4 shrink-0 text-royal"
              strokeWidth={1.5}
            />
            <p className="text-[12px] leading-snug text-[color:color-mix(in_oklab,var(--ink)_62%,transparent)]">
              {INVITE_COPY.footer}
            </p>
          </div>
        </div>
      ) : (
        <button
          ref={pillRef}
          type="button"
          data-testid="roadmap-invite-pill"
          onClick={() => {
            setOpen(true);
            writeSession("open");
          }}
          className={`pointer-events-auto inline-flex min-h-[44px] cursor-pointer touch-manipulation select-none items-center gap-2.5 rounded-full py-2 pl-2 pr-5 text-[13.5px] font-medium text-white transition-[opacity,transform] duration-300 ease-out hover:-translate-y-[1px] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2 ${
            pillIn ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          } ${cue ? "animate-[pulse_700ms_ease-in-out_2] motion-reduce:animate-none" : ""}`}
          style={{
            backgroundColor: NAVY,
            boxShadow: cue
              ? "0 0 0 1px color-mix(in oklab, var(--royal) 55%, transparent), 0 0 0 8px color-mix(in oklab, var(--royal) 10%, transparent), 0 12px 28px -18px rgba(10,15,31,.65)"
              : "0 0 0 1px color-mix(in oklab, var(--royal) 35%, transparent), 0 12px 28px -18px rgba(10,15,31,.65)",
            transitionProperty: "opacity, transform, box-shadow",
          }}
        >
          <span className="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--paper)]">
            <img src="/favicon-32x32.png" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          <span className="pointer-events-none">{INVITE_COPY.pill}</span>
          <span className="pointer-events-none relative ml-0.5 flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34C4EB] opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34C4EB]" />
          </span>
        </button>
      )}
    </div>
  );
}
