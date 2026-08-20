import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { X, ArrowRight, Compass, Map, Users, UserCheck } from "lucide-react";
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

const CARD_ICONS = [Compass, Map, UserCheck];


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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
      data-testid="roadmap-invite"
    >
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Build my roadmap invitation"
          className="pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-[color:var(--rule)] bg-[color:var(--paper-soft)] text-ink sm:max-w-[640px] lg:max-w-[720px]"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,.6) inset, 0 24px 60px -40px rgba(10,15,31,.35), 0 0 0 6px color-mix(in oklab, var(--royal) 5%, transparent)",
          }}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--rule-soft)] px-5 py-3.5 sm:px-7">
            <div className="flex items-center gap-3">
              <TrustTaiLogo />
              <span className="hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground sm:inline">
                {INVITE_COPY.marker}
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close invitation"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[color:var(--row-hover-bg)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
            <p className="font-mono text-[10px] tracking-[0.2em] text-royal">
              {INVITE_COPY.eyebrow}
            </p>
            <h2 className="mt-3 font-display text-[28px] leading-[1.12] tracking-tight text-ink sm:text-[34px]">
              {INVITE_COPY.headline}
            </h2>
            <p className="mt-3 max-w-[58ch] text-[13.5px] leading-relaxed text-muted-foreground sm:text-sm">
              {INVITE_COPY.body}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {INVITE_COPY.cards.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-[color:var(--rule)] bg-background px-3.5 py-3"
                >
                  <p className="text-[12.5px] font-semibold text-ink">{c.title}</p>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{c.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/build-my-roadmap"
                data-invite-cta
                onClick={close}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
                style={{ backgroundColor: NAVY }}
              >
                {INVITE_COPY.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-[12px] text-muted-foreground">{INVITE_COPY.time}</p>
            </div>

            <p className="mt-5 border-t border-[color:var(--rule-soft)] pt-4 text-[11.5px] leading-snug text-muted-foreground">
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
          className="pointer-events-auto inline-flex items-center gap-3 rounded-full py-2 pl-2 pr-4 text-sm font-medium text-white transition-transform hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
          style={{
            backgroundColor: NAVY,
            boxShadow: "0 14px 34px -22px rgba(10,15,31,.7)",
          }}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--paper)]">
            <img src="/favicon-32x32.png" alt="" aria-hidden="true" className="h-4 w-4" />
          </span>
          <span>{INVITE_COPY.pill}</span>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34C4EB] opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34C4EB]" />
          </span>
        </button>
      )}
    </div>
  );
}
