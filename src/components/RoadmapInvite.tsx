import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { X, ArrowRight, Users, User, LayoutGrid, ShieldCheck, Clock } from "lucide-react";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { showRoadmapInvite } from "@/lib/roadmap-invite-visibility";

const SESSION_KEY = "tt_roadmap_invite_state_v1";

export const INVITE_COPY = {
  pill: "Need clarity?",
  marker: "BUILD MY ROADMAP",
  eyebrow: "START WITH THE PICTURE",
  headline: "Let's get clear on what comes next.",
  body: "You do not need to have everything figured out before you begin. Tell us where the business is today, what you are trying to build, and what feels harder than it should. We'll use the conversation to understand the full picture before deciding what deserves attention next.",
  cards: [
    { title: "Start where you are", note: "No polished brief required." },
    {
      title: "See the whole picture",
      note: "We look across the business, not one isolated problem.",
    },
    {
      title: "Personally reviewed",
      note: "Your conversation reaches Trust Tai with the context intact.",
    },
  ],
  cta: "Build Your Roadmap",
  time: "A thoughtful conversation. About 10 minutes.",
  footer:
    "For founders and teams carrying something they want to make clearer, stronger, or easier to run.",
};

const CARD_ICONS = [User, LayoutGrid, ShieldCheck];

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

export function RoadmapInvite() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Session memory: reopen only if the visitor left it open this session.
  useEffect(() => {
    if (readSession() === "open") setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    writeSession("closed");
    pillRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-invite-cta]")?.focus();
    }, 30);
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
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Build my roadmap invitation"
          className="pointer-events-auto max-h-[82vh] w-full max-w-none overflow-y-auto overscroll-contain rounded-[20px] border border-[color:var(--rule)] bg-[color:var(--paper-soft)] text-ink sm:max-w-[404px]"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,.7) inset, 0 18px 44px -34px rgba(10,15,31,.30), 0 0 0 8px color-mix(in oklab, var(--royal) 4%, transparent)",
          }}
        >

          <div className="flex items-start justify-between border-b border-[color:var(--rule-soft)] px-5 py-4">
            <div className="min-w-0">
              <TrustTaiLogo />
              <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-[color:color-mix(in_oklab,var(--ink)_50%,transparent)]">
                {INVITE_COPY.marker}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close invitation"
              className="shrink-0 rounded-[10px] border border-[color:var(--rule)] bg-background p-2 text-[color:color-mix(in_oklab,var(--ink)_65%,transparent)] transition-colors hover:bg-[color:var(--row-hover-bg)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-5 pt-5">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-royal">
              {INVITE_COPY.eyebrow}
            </p>
            <h2 className="mt-2.5 font-display text-[26px] leading-[1.1] tracking-tight text-ink">
              {HEADLINE_LEAD}{" "}
              <span className="italic text-royal">{HEADLINE_ACCENT}</span>
            </h2>
            <p className="mt-3 text-[13px] leading-[1.6] text-[color:color-mix(in_oklab,var(--ink)_80%,transparent)]">
              {INVITE_COPY.body}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2">
              {INVITE_COPY.cards.map((c, i) => {
                const Icon = CARD_ICONS[i] ?? Users;
                return (
                  <div
                    key={c.title}
                    className="flex items-start gap-2.5 rounded-xl border border-[color:var(--rule)] bg-background px-3 py-2.5"
                  >
                    <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:color-mix(in_oklab,var(--royal)_8%,transparent)]">
                      <Icon className="h-3.5 w-3.5 text-royal" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold leading-tight text-ink">
                        {c.title}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-[color:color-mix(in_oklab,var(--ink)_62%,transparent)]">
                        {c.note}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>


            <Link
              to="/build-my-roadmap"
              data-invite-cta
              onClick={close}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full px-6 text-[14.5px] font-semibold text-white transition-transform hover:-translate-y-[1px] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
              style={{ backgroundColor: NAVY, height: "48px" }}
            >
              {INVITE_COPY.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="mt-3 flex items-center justify-center gap-2 text-[color:color-mix(in_oklab,var(--ink)_52%,transparent)]">
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <p className="font-mono text-[9.5px] uppercase tracking-[0.14em]">
                {INVITE_COPY.time}
              </p>
            </div>
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
          className="pointer-events-auto inline-flex min-h-[44px] cursor-pointer touch-manipulation select-none items-center gap-2.5 rounded-full py-2 pl-2 pr-5 text-[13.5px] font-medium text-white transition-transform hover:-translate-y-[1px] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
          style={{
            backgroundColor: NAVY,
            boxShadow:
              "0 0 0 1px color-mix(in oklab, var(--royal) 35%, transparent), 0 12px 28px -18px rgba(10,15,31,.65)",
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
