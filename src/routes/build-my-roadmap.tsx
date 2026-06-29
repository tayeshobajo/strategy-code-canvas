import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Bookmark, Check, Loader2, LogOut } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TrustTaiLogo } from "@/components/TrustTaiLogo";
import { Reveal } from "@/hooks/use-reveal";
import notebookImg from "@/assets/cta-book-cover-desk.png.asset.json";
import heroMountain from "@/assets/roadmap-hero-mountain.png.asset.json";


export const Route = createFileRoute("/build-my-roadmap")({
  head: () => {
    const title = "Build My Roadmap | Trust Tai";
    const description =
      "A 30-minute conversation, not a pitch. We listen first, tell you what we see, and only map the road if it fits. No pressure, no follow-up hounding.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://new.trusttai.com/build-my-roadmap" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "https://new.trusttai.com/build-my-roadmap" }],
      scripts: [
        {
          type: "application/ld+json",
          id: "jsonld-build-my-roadmap",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "ContactPage",
                name: title,
                description,
                url: "https://new.trusttai.com/build-my-roadmap",
                isPartOf: { "@type": "WebSite", name: "Trust Tai", url: "https://new.trusttai.com" },
                mainEntity: {
                  "@type": "Organization",
                  name: "Trust Tai",
                  email: "tai@trusttai.com",
                  contactPoint: {
                    "@type": "ContactPoint",
                    contactType: "customer support",
                    email: "tai@trusttai.com",
                  },
                },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://new.trusttai.com/" },
                  { "@type": "ListItem", position: 2, name: "Build My Roadmap", item: "https://new.trusttai.com/build-my-roadmap" },
                ],
              },
            ],
          }),
        },
      ],


    };
  },
  component: BuildMyRoadmapPage,
});

const container = "mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-12";
const ROYAL = "#2563FF";

/* -------------------- HERO -------------------- */
function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-white">
      <div className={`${container} flex flex-col-reverse items-center gap-10 pt-[140px] pb-10 lg:grid lg:grid-cols-[1.05fr_1fr] lg:pt-[160px] lg:pb-12`}>
        <div>
          <Reveal as="p" variant="fade-up" className="font-mono text-[11px] uppercase tracking-[0.28em]" >
            <span style={{ color: ROYAL }}>Build My Roadmap</span>
          </Reveal>
          <Reveal
            as="h1"
            variant="rise"
            delay={120}
            className="mt-5 font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.06] tracking-[-0.02em] text-ink"
          >
            Let&rsquo;s see where your<br />business needs to go.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={240} className="mt-6 max-w-[34rem] text-[15px] leading-[1.75] text-ink/70">
            This is a 30-minute conversation, not a pitch. We listen first. You leave with a clearer picture of your business whether we walk together or not.
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={320} className="mt-4 max-w-[34rem] text-[15px] leading-[1.75] text-ink/70">
            If we are not the right partner, we will tell you, and point you to who is.
          </Reveal>
        </div>
        <Reveal as="div" variant="fade-up" delay={200} className="relative">
          <EngravedWorld />
        </Reveal>
      </div>
    </section>
  );
}

function EngravedWorld() {
  return (
    <img
      src={heroMountain.url}
      alt=""
      aria-hidden="true"
      className="block w-full h-auto select-none"
      draggable={false}
    />
  );
}


/* -------------------- SECTION 2 - Lead-in line -------------------- */
function ConversationLead() {
  return (
    <section className="bg-paper">
      <div className={`${container} pt-14 pb-8 lg:pt-16 lg:pb-10`}>
        <Reveal
          as="div"
          variant="fade-up"
          className="mx-auto flex max-w-[60ch] items-start justify-center gap-4"
        >
          <span
            aria-hidden="true"
            className="mt-[2px] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: "rgba(37,99,255,0.35)" }}
          >
            <ClockGlyph />
          </span>
          <p className="text-[14.5px] leading-[1.8] text-ink/75">
            <span className="font-medium text-ink">One 30-minute conversation.</span>
            <br />
            No slides, no pitch, no obligation.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.2} strokeLinecap="round">
        <circle cx={12} cy={12} r={8} />
        <path d="M 12 7 L 12 12 L 16 14" />
      </g>
    </svg>
  );
}

/* -------------------- SECTION 3 - Immersive intake -------------------- */
const CONTACT_EMAIL = "tai@trusttai.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFLECT_MIN = 25;
const REFLECT_DEBOUNCE_MS = 2200;
const REFLECT_TIMEOUT_MS = 12000;
const STORAGE_KEY = "tt:intake:token:v1";
const PATH_D = "M22,64 C 200,30 300,82 400,52 S 560,24 658,34";

function getBezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
) {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  };
}

const SEG1: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
  { x: 22, y: 64 },
  { x: 200, y: 30 },
  { x: 300, y: 82 },
  { x: 400, y: 52 },
];
const SEG2: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
  { x: 400, y: 52 },
  { x: 500, y: 22 },
  { x: 560, y: 24 },
  { x: 658, y: 34 },
];

function pointOnPath(t: number) {
  if (t <= 0.5) {
    return getBezierPoint(t * 2, SEG1[0], SEG1[1], SEG1[2], SEG1[3]);
  }
  return getBezierPoint((t - 0.5) * 2, SEG2[0], SEG2[1], SEG2[2], SEG2[3]);
}


// Lightweight analytics shim — fires to GTM dataLayer and gtag if present,
// and always emits a CustomEvent so other listeners (Plausible, Segment shim,
// tests) can subscribe without coupling to a vendor.
type TrackPayload = Record<string, string | number | boolean | null | undefined>;
function track(event: string, payload: TrackPayload = {}) {
  if (typeof window === "undefined") return;
  const data = { event, ...payload, ts: Date.now() };
  try {
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
      gtag?: (...args: unknown[]) => void;
    };
    if (Array.isArray(w.dataLayer)) w.dataLayer.push(data);
    if (typeof w.gtag === "function") w.gtag("event", event, payload);
    window.dispatchEvent(new CustomEvent("tt:analytics", { detail: data }));
  } catch {
    /* analytics must never break the form */
  }
}

type IntakeQuestion = {
  key: string;
  eyebrow: string;
  before: string;
  accent: string;
  after: string;
  placeholder: string;
  optional?: boolean;
};

const QUESTIONS: IntakeQuestion[] = [
  {
    key: "current_state",
    eyebrow: "01 / where you are",
    before: "Tell us what you have built. ",
    accent: "What is the business today",
    after: ", in your words?",
    placeholder: "Start anywhere. What you do, who you serve, how it runs now.",
  },
  {
    key: "why_now",
    optional: true,
    eyebrow: "02 / why now",
    before: "What brought you here. ",
    accent: "What were you hoping to put on paper",
    after: "?",
    placeholder: "The thing that made today the day you started this.",
  },
  {
    key: "the_weight",
    eyebrow: "03 / the weight",
    before: "Where does the business still run through you? ",
    accent: "What moves only when you touch it",
    after: "?",
    placeholder: "The decisions, the approvals, the work that waits for you.",
  },
  {
    key: "what_didnt_hold",
    optional: true,
    eyebrow: "04 / what did not hold",
    before: "What have you tried before that did not hold? ",
    accent: "What would make this time different",
    after: "?",
    placeholder: "Agencies, hires, tools. What happened, and what you took from it.",
  },
  {
    key: "unbuilt_asset",
    optional: true,
    eyebrow: "05 / what you already have",
    before: "What does the business already own that you have not built on yet? ",
    accent: "A relationship base, a body of data, a credential, a position",
    after: " you already sit in.",
    placeholder: "Something you sit on top of that a competitor could not copy.",
  },
  {
    key: "point_b",
    eyebrow: "06 / where you need to be",
    before: "Picture the business 24 months out, running the way it should. ",
    accent: "What is true then that is not true now",
    after: "?",
    placeholder: "What you can see, what you can measure, what you stop carrying.",
  },
  {
    key: "point_c",
    optional: true,
    eyebrow: "07 / if it could not fail",
    before: "If you knew it could not fail, ",
    accent: "what would you build",
    after: "? Where is the energy when you think about this business?",
    placeholder: "The version you would chase if fear was not in the room.",
  },
  {
    key: "practical",
    eyebrow: "08 / the practical",
    before: "Last one. ",
    accent: "Who else is part of this decision, and what timeline are you working toward",
    after: "?",
    placeholder: "Names, roles, and any date that matters.",
  },
];

const REQUIRED_KEYS = QUESTIONS.filter((q) => !q.optional).map((q) => q.key);

type AnswerRecord = { response: string; reflected_offered: string | null };
type ContactState = { name: string; business: string; website: string; email: string };
type SubmitStatus = "idle" | "submitting" | "error";

function IntakeExperience({ open, intakeRef, onExit }: { open: boolean; intakeRef: React.RefObject<HTMLDivElement | null>; onExit?: () => void }) {
  const [step, setStep] = React.useState<number>(-1); // -1 intro, 0..7 questions, 8 review+contact, 9 sent
  const [answers, setAnswers] = React.useState<Record<string, AnswerRecord>>({});
  const [reflections, setReflections] = React.useState<Record<string, { state: "idle" | "loading" | "ready" | "error"; text: string }>>({});
  const [contact, setContact] = React.useState<ContactState>({ name: "", business: "", website: "", email: "" });
  const [consent, setConsent] = React.useState<boolean>(true);
  const [contactErrors, setContactErrors] = React.useState<{ name?: string; email?: string; website?: string }>({});
  const [status, setStatus] = React.useState<SubmitStatus>("idle");
  const [hydrated, setHydrated] = React.useState(false);
  const [resumeToken, setResumeToken] = React.useState<string | null>(null);
  const [resumeNote, setResumeNote] = React.useState<{ kind: "sent" | "saved" | "error"; text: string } | null>(null);
  const [autosaveError, setAutosaveError] = React.useState<boolean>(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [furthestStep, setFurthestStep] = React.useState<number>(-1);

  const lastSubmitPayload = React.useRef<Record<string, unknown> | null>(null);

  const total = QUESTIONS.length;
  const requiredAnsweredCount = React.useMemo(
    () => REQUIRED_KEYS.filter((k) => (answers[k]?.response ?? "").trim().length > 0).length,
    [answers],
  );
  const progress = step < 0 ? 0 : Math.min(1, requiredAnsweredCount / REQUIRED_KEYS.length);

  // Hydrate from URL ?draft= or localStorage token on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(window.location.href);
        let token = url.searchParams.get("draft");
        if (!token) {
          try { token = window.localStorage.getItem(STORAGE_KEY); } catch { /* noop */ }
        }
        if (token && UUID_RE.test(token)) {
          const mod = await import("@/lib/intake.functions");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await mod.loadDraft({ data: { resume_token: token } } as any);
          if (cancelled) return;
          if (res?.found) {
            const rebuilt: Record<string, AnswerRecord> = {};
            for (const a of res.answers ?? []) {
              if (a && typeof a.key === "string") {
                rebuilt[a.key] = {
                  response: String(a.response ?? ""),
                  reflected_offered: a.reflected_offered == null ? null : String(a.reflected_offered),
                };
              }
            }
            setAnswers(rebuilt);
            const c = res.contact ?? {};
            setContact((p) => ({
              name: String(c.name ?? p.name ?? ""),
              business: String(c.business ?? p.business ?? ""),
              website: String(c.website ?? p.website ?? ""),
              email: String(c.email ?? p.email ?? ""),
            }));
            setResumeToken(token);
            setStep(0);
            try { window.localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
            // Ensure ?draft= is on the URL for shareability
            if (!url.searchParams.get("draft")) {
              url.searchParams.set("draft", token);
              window.history.replaceState({}, "", url.toString());
            }
            track("intake_draft_resumed", { resume_token: token, answers_count: Object.keys(rebuilt).length });
          } else {
            // stale token, drop it
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
          }
        }
      } catch (err) {
        console.warn("[intake] could not restore draft", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced server-side autosave through save-draft. Browser never writes to the table.
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflightSave = React.useRef<Promise<void> | null>(null);
  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const hasAny =
      Object.values(answers).some((a) => (a?.response ?? "").trim().length > 0) ||
      contact.name.trim() || contact.email.trim() || contact.website.trim() || contact.business.trim();
    if (!hasAny) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = {
        resume_token: resumeToken ?? undefined,
        answers: QUESTIONS.map((q) => ({
          key: q.key,
          question: `${q.before}${q.accent}${q.after}`,
          response: (answers[q.key]?.response ?? "").trim(),
          reflected_offered: answers[q.key]?.reflected_offered ?? null,
        })).filter((a) => a.response.length > 0),
        contact,
      };
      setSaveState("saving");
      inflightSave.current = (async () => {
        try {
          const mod = await import("@/lib/intake.functions");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await mod.saveDraft({ data: payload } as any);
          if (res?.resume_token && res.resume_token !== resumeToken) {
            setResumeToken(res.resume_token);
            try { window.localStorage.setItem(STORAGE_KEY, res.resume_token); } catch { /* noop */ }
            try {
              const url = new URL(window.location.href);
              url.searchParams.set("draft", res.resume_token);
              window.history.replaceState({}, "", url.toString());
            } catch { /* noop */ }
          }
          setAutosaveError(false);
          setSaveState("saved");
          setLastSavedAt(Date.now());
          track("intake_draft_saved", { resume_token: res?.resume_token ?? null, answers_count: payload.answers.length });
        } catch (err) {
          console.warn("[intake] autosave failed (non-blocking)", err);
          setAutosaveError(true);
          setSaveState("error");
          track("intake_draft_save_failed", { resume_token: resumeToken });
        }
      })();
    }, 900);

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [answers, contact, resumeToken, hydrated]);

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      window.history.replaceState({}, "", url.toString());
    } catch { /* noop */ }
  };

  const onAnswerChange = (key: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [key]: { response: value, reflected_offered: prev[key]?.reflected_offered ?? null },
    }));
    // Optimistic indicator: show "Saving…" as soon as the user types,
    // before the debounce window even starts.
    setSaveState((s) => (s === "error" ? s : "saving"));
  };

  // Track the furthest step the user has reached, so the journey dots
  // know which milestones are visited (and therefore clickable).
  React.useEffect(() => {
    if (step > furthestStep) setFurthestStep(step);
  }, [step, furthestStep]);

  // Milestone states for the journey path: answered / skipped / current / future.
  const milestoneStates = React.useMemo(() => {
    return QUESTIONS.map((q, i) => {
      if (step === i) return "current" as const;
      const filled = (answers[q.key]?.response ?? "").trim().length > 0;
      if (filled) return "answered" as const;
      if (i <= furthestStep && q.optional) return "skipped" as const;
      if (i < furthestStep) return "answered" as const; // visited but somehow empty required — treat as reached
      return "future" as const;
    });
  }, [answers, step, furthestStep]);

  // (Scroll-into-view removed — intake now mounts inside a full-screen overlay
  // that owns the viewport, so there is nothing on the page to scroll to.)




  // Reflection debouncing per-question (with timeout + abort)
  // Reflection lock: never mutate the displayed mirror while the founder
  // is actively typing. We track the last keystroke time per question and
  // defer both the "refining" state and the final text swap until the
  // founder has been idle for REFLECT_LOCK_MS.
  const REFLECT_LOCK_MS = 500;
  const reflectTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const reflectAborts = React.useRef<Record<string, AbortController | undefined>>({});
  const lastKeystrokeAt = React.useRef<Record<string, number>>({});
  const commitTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  // Track the last response value we actually fetched a reflection for, per
  // question. Without this, any setAnswers call from inside the effect (e.g.
  // committing `reflected_offered`) re-triggers the effect, restamps
  // lastKeystrokeAt, and fires another fetch — an infinite token burn.
  const lastFetchedFor = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    if (step < 0 || step >= total) return;
    const q = QUESTIONS[step];
    const value = answers[q.key]?.response ?? "";
    const trimmed = value.trim();

    // If the response text hasn't changed since the last run, this effect was
    // triggered by something else (e.g. reflected_offered being stored). Do
    // nothing — no keystroke stamp, no fetch, no "refining" flicker.
    if (lastFetchedFor.current[q.key] === trimmed) return;

    // Mark this keystroke; any pending commit will wait for the lock window.
    lastKeystrokeAt.current[q.key] = Date.now();


    const existing = reflectTimers.current[q.key];
    if (existing) clearTimeout(existing);
    const pendingCommit = commitTimers.current[q.key];
    if (pendingCommit) clearTimeout(pendingCommit);
    reflectAborts.current[q.key]?.abort();

    if (trimmed.length < REFLECT_MIN) {
      // Below the threshold: clear to idle so the placeholder shows again.
      setReflections((prev) => {
        if (!prev[q.key] || (prev[q.key]?.state === "idle" && !prev[q.key]?.text)) return prev;
        return { ...prev, [q.key]: { state: "idle", text: "" } };
      });
      return;
    }

    const key = q.key;
    const commitState = (next: { state: "idle" | "loading" | "ready" | "error"; text: string }) => {
      const elapsed = Date.now() - (lastKeystrokeAt.current[key] ?? 0);
      if (elapsed < REFLECT_LOCK_MS) {
        const existingCommit = commitTimers.current[key];
        if (existingCommit) clearTimeout(existingCommit);
        commitTimers.current[key] = setTimeout(() => commitState(next), REFLECT_LOCK_MS - elapsed);
        return;
      }
      setReflections((prev) => ({ ...prev, [key]: next }));
    };

    reflectTimers.current[q.key] = setTimeout(async () => {
      // Remember which value we're fetching for so the effect doesn't re-fire
      // when setAnswers writes reflected_offered back into state.
      lastFetchedFor.current[q.key] = trimmed;
      const ctrl = new AbortController();
      reflectAborts.current[q.key] = ctrl;
      const to = setTimeout(() => ctrl.abort(), REFLECT_TIMEOUT_MS);

      // Stale-while-revalidate: keep previous text visible, only flip state to "loading"
      // — and only once the founder has actually paused (lock window).
      commitState({ state: "loading", text: reflections[q.key]?.text ?? "" });
      try {
        const mod = await import("@/lib/intake.functions");
        const res = await mod.reflectAnswer({
          data: { question: `${q.before}${q.accent}${q.after}`, answer: trimmed },
          signal: ctrl.signal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        const text = (res?.text ?? "").trim();
        if (!text) {
          // No new mirror — preserve any previous one instead of blanking.
          const prevText = reflections[q.key]?.text ?? "";
          commitState({ state: prevText ? "ready" : "idle", text: prevText });
          return;
        }
        commitState({ state: "ready", text });
        // Only stash reflected_offered once the new mirror is actually committed.
        const commitAnswer = () => {
          const elapsed = Date.now() - (lastKeystrokeAt.current[key] ?? 0);
          if (elapsed < REFLECT_LOCK_MS) {
            setTimeout(commitAnswer, REFLECT_LOCK_MS - elapsed);
            return;
          }
          setAnswers((prev) => ({
            ...prev,
            [key]: { response: prev[key]?.response ?? trimmed, reflected_offered: text },
          }));
        };
        commitAnswer();
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.warn("[intake] reflect failed (non-blocking)", err);
        // Keep the last good mirror visible; just mark error state.
        commitState({ state: "error", text: reflections[q.key]?.text ?? "" });
      } finally {
        clearTimeout(to);
      }
    }, REFLECT_DEBOUNCE_MS);


    return () => {
      const t = reflectTimers.current[q.key];
      if (t) clearTimeout(t);
      const c = commitTimers.current[q.key];
      if (c) clearTimeout(c);
    };
  }, [step, answers, total]);


  const useReflectedWords = (key: string) => {
    const text = reflections[key]?.text ?? "";
    if (!text) return;
    setAnswers((prev) => ({
      ...prev,
      [key]: { response: text, reflected_offered: text },
    }));
  };

  const advance = () => {
    if (step >= 0 && step < total) {
      const q = QUESTIONS[step];
      const filled = (answers[q.key]?.response ?? "").trim().length > 0;
      track("intake_question_advanced", {
        key: q.key,
        index: step + 1,
        optional: !!q.optional,
        skipped: !!q.optional && !filled,
        characters: (answers[q.key]?.response ?? "").length,
      });
      if (step === total - 1) track("intake_review_reached", {});
    }
    if (step < total - 1) setStep(step + 1);
    else setStep(total); // to review
  };
  const back = () => {
    if (step > -1) {
      track("intake_question_back", { from_index: step + 1 });
      setStep(step - 1);
    }
  };

  const validateContact = (state: ContactState = contact, consentState: boolean = consent) => {
    const e: { name?: string; email?: string; website?: string } = {};
    if (!state.name.trim()) e.name = "Please add your name.";
    const em = state.email.trim();
    if (!em) e.email = "Please add your email.";
    else if (!EMAIL_RE.test(em)) e.email = "That email does not look right.";
    const site = state.website.trim();
    if (site && !URL_RE.test(site)) e.website = "That URL does not look right.";
    if (consentState && !site) e.website = "Add a website, or uncheck the box below.";
    return e;
  };

  // Live revalidation after first error appears
  React.useEffect(() => {
    if (Object.keys(contactErrors).length === 0) return;
    setContactErrors(validateContact());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, consent]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    const ce = validateContact();
    setContactErrors(ce);
    if (Object.keys(ce).length > 0) {
      track("intake_submit_validation_failed", { fields: Object.keys(ce).join(",") });
      return;
    }

    setStatus("submitting");
    const payload = {
      name: contact.name.trim(),
      business: contact.business.trim(),
      website: contact.website.trim(),
      email: contact.email.trim(),
      authorizes_scan: consent && !!contact.website.trim(),
      answers: QUESTIONS.map((q) => ({
        key: q.key,
        question: `${q.before}${q.accent}${q.after}`,
        response: (answers[q.key]?.response ?? "").trim(),
        reflected_offered: answers[q.key]?.reflected_offered ?? null,
      })).filter((a) => a.response.length > 0),
      resume_token: resumeToken ?? undefined,
    };
    lastSubmitPayload.current = payload;
    track("intake_submit_started", { answers_count: payload.answers.length, resume_token: resumeToken });

    try {
      const mod = await import("@/lib/intake.functions");
      // Ensure any pending autosave settles first so the server has the latest draft state.
      if (inflightSave.current) {
        try { await inflightSave.current; } catch { /* ignore */ }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await mod.submitIntake({ data: payload } as any);
      clearDraft();
      setResumeToken(null);
      setStep(total + 1);
      setStatus("idle");
      track("intake_submit_success", { answers_count: payload.answers.length });
    } catch (err) {
      console.error("[intake] submit failed", err);
      setStatus("error");
      track("intake_submit_failed", { message: (err as Error)?.message?.slice(0, 200) ?? "" });
    }
  };

  const onRetrySubmit = () => {
    // Re-fires from the latest captured form state. Answers stay in React state, so nothing is lost.
    const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent;
    track("intake_submit_retry", {});
    void onSubmit(fakeEvent);
  };

  const onSaveAndComeBack = async () => {
    if (typeof window === "undefined") return;
    const email = contact.email.trim();
    let token = resumeToken;
    try {
      if (inflightSave.current) {
        try { await inflightSave.current; } catch { /* ignore */ }
      }
      if (!token) {
        const mod = await import("@/lib/intake.functions");
        const payload = {
          answers: QUESTIONS.map((q) => ({
            key: q.key,
            question: `${q.before}${q.accent}${q.after}`,
            response: (answers[q.key]?.response ?? "").trim(),
            reflected_offered: answers[q.key]?.reflected_offered ?? null,
          })).filter((a) => a.response.length > 0),
          contact,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await mod.saveDraft({ data: payload } as any);
        token = res?.resume_token ?? null;
        if (token) {
          setResumeToken(token);
          try { window.localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
          const url = new URL(window.location.href);
          url.searchParams.set("draft", token);
          window.history.replaceState({}, "", url.toString());
        }
      }
      if (!token) {
        setResumeNote({ kind: "error", text: "we could not save just yet. your words are still on this page." });
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("draft", token);
      const resumeUrl = url.toString();
      if (email && EMAIL_RE.test(email)) {
        const mod = await import("@/lib/intake.functions");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await mod.sendResumeLink({ data: { resume_token: token, email, resume_url: resumeUrl, name: contact.name.trim() } } as any);
        setResumeNote({ kind: "sent", text: `a continue link is on its way to ${email}.` });
        track("intake_resume_link_sent", { resume_token: token });
      } else {
        setResumeNote({ kind: "saved", text: "your progress is saved to this link. bookmark it and come back anytime." });
        track("intake_draft_saved_manual", { resume_token: token });
      }
    } catch (err) {
      console.warn("[intake] save and come back failed", err);
      setResumeNote({ kind: "error", text: "we could not save just yet. your words are still on this page. try again, or copy this page URL to come back to." });
      track("intake_save_and_come_back_failed", { message: (err as Error)?.message?.slice(0, 200) ?? "" });
    }
  };


  const firstName = contact.name.trim().split(/\s+/)[0] || "there";
  const currentQuestion = step >= 0 && step < total ? QUESTIONS[step] : null;
  const currentAnswerValue = currentQuestion ? answers[currentQuestion.key]?.response ?? "" : "";
  const currentReflection = currentQuestion ? reflections[currentQuestion.key] : undefined;

  if (!open) return null;

  const saveLabel =
    saveState === "saving"
      ? "Saving\u2026"
      : saveState === "saved"
        ? "All changes saved"
        : saveState === "error"
          ? "Save paused"
          : null;

  const savedTooltip = lastSavedAt ? `Saved ${formatRelativeTime(lastSavedAt)}` : undefined;

  return (
    <section
      id="intake"
      ref={intakeRef}
      className="relative"
    >
      {/* Room header — Trust Tai mark / autosave status / exit */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <TrustTaiLogo variant="dark" className="h-5 sm:h-6" />
        <div className="flex shrink-0 items-center gap-3 sm:gap-7">
          {saveLabel && (
            <span
              aria-live="polite"
              title={saveState === "saved" ? savedTooltip : undefined}
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.02em] text-ink/60"
            >
              {saveState === "saving" ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-ink/45" />
              ) : saveState === "error" ? (
                <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full bg-[#B91C1C]/70" />
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(16,150,90,0.12)" }}
                >
                  <Check className="h-3 w-3" style={{ color: "#10965A" }} />
                </span>
              )}
              <span className="hidden sm:inline">{saveLabel}</span>
            </span>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-ink/70 transition-colors hover:text-ink"
            >
              <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exit and return home</span>
            </button>
          )}
        </div>
      </header>

      <div className="pt-10 lg:pt-12">
        {/* Journey path */}
        <JourneyPath
          step={step}
          progress={step >= total ? 1 : progress}
          milestoneStates={milestoneStates}
          furthestStep={furthestStep}
          onJump={(i) => {
            track("intake_dot_jump", { to: i });
            setStep(i);
          }}
          atReview={step >= total}
        />

        <div className="mx-auto mt-12 max-w-[820px]">
          {step === -1 && (
            <IntakeIntro onBegin={() => { track("intake_started", {}); setStep(0); }} />
          )}

          {currentQuestion && (
            <QuestionPanel
              q={currentQuestion}
              index={step}
              total={total}
              value={currentAnswerValue}
              onChange={(v) => onAnswerChange(currentQuestion.key, v)}
              reflection={currentReflection}
              onUseReflected={() => useReflectedWords(currentQuestion.key)}
              onBack={step > 0 ? back : undefined}
              onNext={advance}
            />
          )}

          {step === total && (
            <ReviewAndContact
              answers={answers}
              contact={contact}
              setContact={setContact}
              consent={consent}
              setConsent={setConsent}
              contactErrors={contactErrors}
              status={status}
              onEdit={(i) => setStep(i)}
              onBack={() => setStep(total - 1)}
              onSubmit={onSubmit}
              onRetry={onRetrySubmit}
            />
          )}

          {step === total + 1 && <IntakeConfirmation firstName={firstName} />}
        </div>

        {step >= 0 && step < total && (
          <div className="mx-auto mt-10 max-w-[560px] text-center">
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="h-px flex-1 bg-ink/10" />
              <button
                type="button"
                onClick={onSaveAndComeBack}
                className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] transition-colors"
                style={{ color: ROYAL }}
              >
                <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Save and come back later</span>
              </button>
              <span aria-hidden="true" className="h-px flex-1 bg-ink/10" />
            </div>
            <p className="mt-2 font-mono text-[11px] tracking-[0.02em] text-ink/50">
              We will save as you go. You will get a private link to return.
            </p>
            {resumeNote && (
              <p
                role={resumeNote.kind === "error" ? "alert" : undefined}
                className={`mt-3 font-mono text-[11px] normal-case tracking-[0.04em] ${
                  resumeNote.kind === "error" ? "text-[#B91C1C]" : "text-ink/55"
                }`}
              >
                {resumeNote.text}
                {resumeNote.kind === "error" && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onSaveAndComeBack}
                      className="underline decoration-[#B91C1C]/40 underline-offset-[4px] hover:decoration-[#B91C1C]"
                    >
                      try again
                    </button>
                  </>
                )}
              </p>
            )}
            {autosaveError && !resumeNote && (
              <p role="status" className="mt-3 font-mono text-[11px] normal-case tracking-[0.04em] text-ink/45">
                autosave paused. your words stay on this page. we will retry as you type.
              </p>
            )}
          </div>
        )}

        {/* Quiet bottom note — present across every step except the sent confirmation */}
        {step !== total + 1 && (
          <p className="mx-auto mt-10 max-w-[640px] text-center font-display italic text-[13.5px] leading-[1.7] text-ink/55">
            A person reads every word. This is a note to understand you, not a form to qualify you.
          </p>
        )}
      </div>
    </section>
  );
}


type MilestoneState = "answered" | "skipped" | "current" | "future";

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function JourneyPath({
  step,
  progress,
  milestoneStates,
  furthestStep,
  onJump,
  atReview,
}: {
  step: number;
  progress: number;
  milestoneStates: MilestoneState[];
  furthestStep: number;
  onJump: (i: number) => void;
  atReview: boolean;
}) {
  const reduce = usePrefersReducedMotion();
  const LENGTH = 680;
  const offset = reduce ? 0 : LENGTH * (1 - progress);
  const STOPS = milestoneStates.length;
  const points = Array.from({ length: STOPS }, (_, i) => pointOnPath(i / (STOPS - 1)));
  const bg = "oklch(0.97 0.02 255)";
  const pct = Math.round(progress * 100);
  return (
    <div className="mx-auto w-full max-w-[620px]">
      <svg viewBox="0 0 680 100" className="block h-[64px] w-full">
        <defs>
          <filter id="intake-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        <path d={PATH_D} fill="none" stroke="rgba(10,15,31,0.28)" strokeWidth={1} strokeDasharray="2 5" />
        {!reduce && (
          <path
            d={PATH_D}
            fill="none"
            stroke={ROYAL}
            strokeOpacity={0.22}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={LENGTH}
            strokeDashoffset={offset}
            filter="url(#intake-glow)"
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        )}
        <path
          d={PATH_D}
          fill="none"
          stroke={ROYAL}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={offset}
          style={{ transition: reduce ? "none" : "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {points.map((p, i) => {
          const state = milestoneStates[i];
          const isCurrent = state === "current";
          const isAnswered = state === "answered";
          const isSkipped = state === "skipped";
          const canJump = i <= Math.max(furthestStep, step);
          const visibleR = isCurrent ? 7 : 4;
          const fill = isAnswered || isCurrent ? ROYAL : bg;
          const stroke = isAnswered || isCurrent ? ROYAL : isSkipped ? ROYAL : "rgba(10,15,31,0.35)";
          const strokeWidth = isAnswered || isCurrent ? 0 : isSkipped ? 1.5 : 1;
          return (
            <g
              key={i}
              transform={`translate(${p.x},${p.y})`}
              role={canJump ? "button" : undefined}
              tabIndex={canJump ? 0 : -1}
              aria-label={canJump ? `Go to question ${i + 1}` : undefined}
              style={{ cursor: canJump ? "pointer" : "default", outline: "none" }}
              onClick={() => { if (canJump) onJump(i); }}
              onKeyDown={(e) => {
                if (!canJump) return;
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump(i); }
              }}
            >
              {/* Generous transparent hit target */}
              <circle r={14} fill="transparent" />
              {isCurrent && (
                <circle
                  r={12}
                  fill="none"
                  stroke={ROYAL}
                  strokeOpacity={0.28}
                  strokeWidth={1.5}
                  style={{ transition: reduce ? "none" : "all 500ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                />
              )}
              <circle
                r={visibleR}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                style={{ transition: reduce ? "none" : "all 500ms cubic-bezier(0.22, 1, 0.36, 1)" }}
              />
            </g>
          );
        })}
        {/* Trailing review marker at the very end of the path */}
        {(() => {
          const end = pointOnPath(1);
          const filled = atReview;
          return (
            <g transform={`translate(${end.x + 14},${end.y})`}>
              <circle r={5} fill={filled ? ROYAL : bg} stroke={ROYAL} strokeWidth={filled ? 0 : 1.5} />
            </g>
          );
        })()}
      </svg>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.32em]">
        <span className="text-ink/70">Point A</span>
        <span className="text-ink/70">
          <span className="mr-2 text-ink/55">{pct}%</span>
          <span aria-hidden="true" className="mr-2 text-ink/30">·</span>
          Point B
        </span>
      </div>
    </div>
  );
}



function usePrefersReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduce;
}

function IntakeIntro({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: ROYAL }}>
        the intake
      </p>
      <h2 className="mt-5 font-display text-[clamp(1.8rem,3vw,2.3rem)] leading-[1.15] tracking-[-0.018em] text-ink">
        Eight questions. One at a time.<br />
        <em className="italic font-normal" style={{ color: ROYAL }}>Write the way you talk.</em>
      </h2>
      <p className="mx-auto mt-6 max-w-[52ch] text-[14.5px] leading-[1.8] text-ink/70">
        No forms to wade through. You write, you review, you send. A person reads it next.
      </p>
      <button
        type="button"
        onClick={onBegin}
        className="group mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[13.5px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)]"
      >
        <span>Begin</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

function QuestionPanel({
  q,
  index,
  total,
  value,
  onChange,
  reflection,
  onUseReflected,
  onBack,
  onNext,
}: {
  q: IntakeQuestion;
  index: number;
  total: number;
  value: string;
  onChange: (v: string) => void;
  reflection?: { state: "idle" | "loading" | "ready" | "error"; text: string };
  onUseReflected: () => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const isOptional = !!q.optional;
  const hasText = value.trim().length > 0;
  const canAdvance = isOptional || hasText;
  const isLast = index === total - 1;
  const primaryLabel = isLast ? "Review" : isOptional && !hasText ? "Skip" : "Continue";
  const [touched, setTouched] = React.useState(false);
  // Reset touched as the user moves between steps
  React.useEffect(() => { setTouched(false); }, [q.key]);
  const showRequiredHint = !isOptional && !hasText && touched;
  // Parse the eyebrow ("01 / Where you are") so we can render the section label.
  const eyebrowRest = q.eyebrow.split(" / ").slice(1);
  const eyebrowTail = eyebrowRest.join(" / ");

  const hasMirror = !!reflection?.text;
  const isLoading = reflection?.state === "loading";
  const isError = reflection?.state === "error";
  // Editorial cross-fade: hold the previous mirror, dim out briefly, swap the
  // text once it is off-screen, then ease the new line back in. Respects
  // prefers-reduced-motion via the wrapper's motion-safe utilities.
  const incoming = reflection?.text ?? "";
  const [displayedText, setDisplayedText] = React.useState(incoming);
  const [textOpacity, setTextOpacity] = React.useState(1);
  React.useEffect(() => {
    if (incoming === displayedText) return;
    // If we have no current text, just set it without a fade (first paint).
    if (!displayedText) {
      setDisplayedText(incoming);
      setTextOpacity(1);
      return;
    }
    setTextOpacity(0);
    const swap = setTimeout(() => setDisplayedText(incoming), 220);
    const settle = setTimeout(() => setTextOpacity(1), 360);
    return () => {
      clearTimeout(swap);
      clearTimeout(settle);
    };
  }, [incoming, displayedText]);

  const charLimit = 2000;
  const charCount = value.length;

  return (
    <div>
      {/* Centered eyebrow: question section label only */}
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.34em] text-ink/55">
        {eyebrowTail && (
          <span className="text-ink/70">{eyebrowTail}</span>
        )}
        {isOptional && (
          <span className="ml-3 inline-flex items-center rounded-full border border-ink/15 px-2 py-[3px] font-mono text-[10px] normal-case tracking-[0.22em] text-ink/60">optional</span>
        )}
      </p>


      <h2 className="mt-6 font-display text-[clamp(1.6rem,2.6vw,2.05rem)] leading-[1.25] tracking-[-0.015em] text-ink">
        {q.before}
        <em className="italic font-normal" style={{ color: ROYAL }}>{q.accent}</em>
        {q.after}
      </h2>

      {/* Writing surface — bright fill, soft border, blue focus */}
      <div className="relative mt-6">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={6}
          maxLength={charLimit}
          placeholder={q.placeholder}
          aria-invalid={showRequiredHint}
          aria-describedby={showRequiredHint ? `${q.key}-hint` : undefined}
          className={`peer w-full resize-none rounded-2xl border bg-white px-6 py-5 pb-10 text-[16px] leading-[1.75] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-[#2563FF] ${showRequiredHint ? "border-[#B91C1C]/60" : "border-ink/12"}`}
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
          autoFocus
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-4 font-mono text-[11px] tracking-[0.04em] text-ink/35"
        >
          {charCount}/{charLimit}
        </span>
      </div>
      {showRequiredHint && (
        <p id={`${q.key}-hint`} className="mt-2 font-mono text-[11px] normal-case tracking-[0.04em] text-[#B91C1C]">
          this one is required. a sentence or two is plenty.
        </p>
      )}

      {/* Reflection — thoughtful note, not a tool box */}
      <div
        className="mt-6 rounded-2xl border px-6 py-6 transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(255,255,255,0.55)",
          borderColor: "rgba(37,99,255,0.18)",
          minHeight: 132,
          opacity: isLoading && hasMirror ? 0.94 : 1,
        }}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.26em]" style={{ color: ROYAL }}>
            A clearer version, if it helps
          </span>
          {isLoading && (
            <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/55">
              <span
                aria-hidden="true"
                className="inline-block h-[6px] w-[6px] rounded-full motion-safe:animate-pulse"
                style={{ backgroundColor: ROYAL }}
              />
              refining
            </span>
          )}
        </div>

        {hasMirror ? (
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <p
              className="font-display italic text-[16.5px] leading-[1.75] motion-safe:transition-opacity motion-safe:duration-[420ms] motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
              style={{ color: "rgba(10,15,31,0.78)", opacity: textOpacity }}
            >
              {displayedText}
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={onUseReflected}
                className="inline-flex items-center rounded-full border bg-white px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] transition-colors hover:bg-[rgba(37,99,255,0.06)]"
                style={{ color: ROYAL, borderColor: "rgba(37,99,255,0.35)" }}
              >
                use these words
              </button>
              {isError && (
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/50">
                  couldn&rsquo;t refine just now
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 font-display italic text-[15px] leading-[1.7] text-ink/45">
            {isLoading
              ? "Reading what you just wrote\u2026"
              : isError
                ? "We couldn\u2019t read that back. Your words are fine as written."
                : "A clearer version will appear here once you pause. Write the way you talk."}
          </p>
        )}
      </div>

      {/* Action row — Back outlined pill / Continue solid navy pill */}
      <div className="mt-8 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-[13px] font-medium text-ink/80 transition-colors hover:border-ink/40 hover:text-ink"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4 rotate-180" />
            <span>Back</span>
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3 text-[13px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <span>{primaryLabel}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}



function ReviewAndContact({
  answers,
  contact,
  setContact,
  consent,
  setConsent,
  contactErrors,
  status,
  onEdit,
  onBack,
  onSubmit,
  onRetry,
}: {
  answers: Record<string, AnswerRecord>;
  contact: ContactState;
  setContact: React.Dispatch<React.SetStateAction<ContactState>>;
  consent: boolean;
  setConsent: (v: boolean) => void;
  contactErrors: { name?: string; email?: string; website?: string };
  status: SubmitStatus;
  onEdit: (index: number) => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: ROYAL }}>
        here is what we heard
      </p>
      <h2 className="mt-4 font-display text-[clamp(1.6rem,2.8vw,2.1rem)] leading-[1.2] tracking-[-0.015em] text-ink">
        Read it back. Change anything that is not true.
      </h2>

      <ul className="mt-10 divide-y divide-ink/10">
        {QUESTIONS.map((q, i) => {
          const a = answers[q.key]?.response?.trim() ?? "";
          return (
            <li key={q.key} className="py-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/55">
                  {q.eyebrow}
                </p>
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="font-mono text-[11px] uppercase tracking-[0.24em] underline decoration-royal/30 underline-offset-[5px] hover:decoration-royal"
                  style={{ color: ROYAL }}
                >
                  edit
                </button>
              </div>
              <p className="mt-3 font-display text-[15.5px] leading-[1.55] text-ink/85">
                {q.before}
                <em className="italic font-normal" style={{ color: ROYAL }}>{q.accent}</em>
                {q.after}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-[14.5px] leading-[1.75] text-ink/75">
                {a || <span className="italic text-ink/40">(nothing yet)</span>}
              </p>
            </li>
          );
        })}
      </ul>

      <form onSubmit={onSubmit} noValidate className="mt-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: ROYAL }}>
          where do we send this
        </p>
        <h3 className="mt-3 font-display text-[clamp(1.3rem,2.3vw,1.7rem)] leading-[1.25] tracking-[-0.015em] text-ink">
          Four lines and we are done.
        </h3>

        <div className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2">
          <UnderlineField
            label="Your name"
            value={contact.name}
            onChange={(v) => setContact((p) => ({ ...p, name: v }))}
            error={contactErrors.name}
            required
            autoComplete="name"
          />
          <UnderlineField
            label="Business name"
            value={contact.business}
            onChange={(v) => setContact((p) => ({ ...p, business: v }))}
            autoComplete="organization"
          />
          <UnderlineField
            label="Website"
            value={contact.website}
            onChange={(v) => setContact((p) => ({ ...p, website: v }))}
            placeholder="https://"
            autoComplete="url"
            error={contactErrors.website}
          />
          <UnderlineField
            label="Email"
            type="email"
            value={contact.email}
            onChange={(v) => setContact((p) => ({ ...p, email: v }))}
            error={contactErrors.email}
            required
            autoComplete="email"
          />
        </div>

        <label
          className={`mt-8 flex items-start gap-3 text-[13px] leading-[1.7] transition-opacity ${
            contact.website.trim() ? "text-ink/65" : "text-ink/35 cursor-not-allowed"
          }`}
          title={contact.website.trim() ? undefined : "Add a website above to enable this"}
        >
          <input
            type="checkbox"
            checked={consent && !!contact.website.trim()}
            disabled={!contact.website.trim()}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-[3px] h-4 w-4 accent-[#2563FF] disabled:cursor-not-allowed"
          />
          <span>
            You are welcome to look at our site before we talk. It helps us see where the business stands.
            {!contact.website.trim() && (
              <span className="ml-1 italic text-ink/40">Add a website to enable.</span>
            )}
          </span>
        </label>


        <div className="mt-10 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/55 hover:text-ink"
          >
            ← back
          </button>
          <button
            type="submit"
            disabled={status === "submitting"}
            aria-busy={status === "submitting"}
            className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[13.5px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Sending&hellip;</span>
              </>
            ) : (
              <>
                <span>Send it</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>

        {status === "error" && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-[#B91C1C]/30 bg-[#B91C1C]/5 p-4 text-[13px] leading-[1.7] text-ink/80"
          >
            <p>
              That did not send. Your words are still here. Try once more, or email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-ink/30 underline-offset-2 hover:text-ink">
                {CONTACT_EMAIL}
              </a>{" "}
              directly.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-ink hover:border-ink/60"
            >
              Try again
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function UnderlineField({
  label,
  value,
  onChange,
  error,
  type = "text",
  required,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10.5px] uppercase tracking-[0.24em] text-ink/55">
        {label}{required && <span className="ml-1" style={{ color: ROYAL }}>*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        className={`mt-2 w-full border-0 border-b bg-transparent px-0 py-2 text-[15px] text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-royal ${error ? "border-[#B91C1C]" : "border-ink/25"}`}
      />
      {error && <span className="mt-1.5 block text-[12px] text-[#B91C1C]">{error}</span>}
    </label>
  );
}

function IntakeConfirmation({ firstName }: { firstName: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: ROYAL }}>
        received
      </p>
      <h2 className="mt-5 font-display text-[clamp(1.9rem,3.2vw,2.5rem)] leading-[1.15] tracking-[-0.018em] text-ink">
        We have it, {firstName}.<br />
        <em className="italic font-normal" style={{ color: ROYAL }}>
          A person reads this next, not a machine.
        </em>
      </h2>
      <p className="mx-auto mt-8 max-w-[52ch] text-[14.5px] leading-[1.8] text-ink/70">
        One reply, from a person. If you go quiet, we leave you be. The first conversation has no pitch.
      </p>
    </div>
  );
}

/* -------------------- SUCCESS STATE (legacy, unused) -------------------- */
function SuccessSection() {
  const steps = [
    {
      mark: <SuccessMarkA />,
      title: "Within one business day, you get one reply.",
      body: "From a person, by name. Not a sequence.",
    },
    {
      mark: <SuccessMarkB />,
      title: "We read what you sent and tell you honestly whether a 30-minute conversation makes sense.",
      body: "If it does not, we say so.",
    },
    {
      mark: <SuccessMarkC />,
      title: "If it does, we find a time that works for you.",
      body: "No pressure to decide on the call.",
    },
  ];
  return (
    <section
      id="cta"
      className="relative"
      style={{ background: "linear-gradient(to right, #F6F9FE, #EEF5FF)" }}
    >
      <div className={`${container} grid grid-cols-1 gap-14 py-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:py-28`}>
        {/* LEFT - confirmation */}
        <div>
          <Reveal as="p" variant="fade-up" className="font-mono text-[11px] uppercase tracking-[0.28em]" >
            <span style={{ color: ROYAL }}>Your message arrived</span>
          </Reveal>
          <Reveal
            as="h2"
            variant="rise"
            delay={120}
            className="mt-5 font-display text-[clamp(2rem,3.6vw,2.8rem)] leading-[1.1] tracking-[-0.018em] text-ink"
          >
            We have it.<br />
            Now you can{" "}
            <em className="italic font-normal" style={{ color: "oklch(0.55 0.13 75)" }}>
              put it down
            </em>
            .
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={220} className="mt-6 max-w-[42ch] text-[14.5px] leading-[1.75] text-ink/70">
            Your note is with a person, not a queue.<br />
            Here is what happens next.
          </Reveal>

          <ol className="mt-10 space-y-7">
            {steps.map((s, i) => (
              <Reveal as="li" key={i} variant="fade-up" delay={300 + i * 120} className="flex items-start gap-5">
                <div className="mt-1 shrink-0">{s.mark}</div>
                <div>
                  <p className="text-[14.5px] font-medium leading-[1.55] text-ink">{s.title}</p>
                  <p className="mt-1.5 max-w-[48ch] text-[13.5px] leading-[1.7] text-ink/60">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>

          <div className="mt-12 border-t border-ink/10 pt-8">
            <Reveal as="p" variant="fade-up" delay={700} className="text-[14px] leading-[1.7] text-ink/70">
              Nothing is needed from you right now.<br />
              The next move is ours.
            </Reveal>
            <Reveal as="p" variant="fade-up" delay={800} className="mt-8 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink/45">
              <LockMark />
              Complete. We will be in touch.
            </Reveal>
          </div>
        </div>

        {/* RIGHT - reassurance (preserved) */}
        <div>
          <Reveal as="h2" variant="fade-up" className="font-display text-[clamp(1.6rem,2.6vw,2rem)] text-ink">
            Before you wonder.
          </Reveal>
          <ul className="mt-8 divide-y divide-ink/10">
            <ReassureItem
              mark={<RouteMarkA />}
              title="You will not be hounded."
              body="One reply, from a person. If you go quiet, we leave you be."
            />
            <ReassureItem
              mark={<RouteMarkB />}
              title="You will not be pitched."
              body="The first conversation has no slides and no close. We listen."
            />
            <ReassureItem
              mark={<RouteMarkC />}
              title="You will not be the wrong fit in silence."
              body="If we are not right for you, we say so on the call, and point you somewhere better."
            />
          </ul>
        </div>
      </div>
    </section>
  );
}

/* Hairline marks for the success steps - vertical timeline feel */
function SuccessMarkA() {
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <circle cx={22} cy={10} r={2.4} fill={ROYAL} stroke="none" />
        <path d="M 22 14 L 22 36" strokeWidth={0.9} strokeDasharray="1.3 4" />
      </g>
    </svg>
  );
}
function SuccessMarkB() {
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <path d="M 22 4 L 22 16" strokeWidth={0.9} strokeDasharray="1.3 4" />
        <circle cx={22} cy={20} r={2.4} fill={ROYAL} stroke="none" />
        <path d="M 22 24 L 22 40" strokeWidth={0.9} strokeDasharray="1.3 4" />
      </g>
    </svg>
  );
}
function SuccessMarkC() {
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <path d="M 22 4 L 22 26" strokeWidth={0.9} strokeDasharray="1.3 4" />
        <path d="M 14 30 L 30 30" strokeWidth={1} />
        <path d="M 22 26 L 22 34" strokeWidth={1} />
        <circle cx={22} cy={30} r={1.8} fill={ROYAL} stroke="none" />
      </g>
    </svg>
  );
}
function LockMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
        <rect x={3.5} y={7} width={9} height={6.5} rx={1} />
        <path d="M 5.5 7 L 5.5 5 a 2.5 2.5 0 0 1 5 0 L 10.5 7" />
      </g>
    </svg>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-[13px] text-ink/75">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-[12px] text-[#B91C1C]">{error}</p>}
    </div>
  );
}

function ReassureItem({
  mark,
  title,
  body,
}: {
  mark: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-5 py-6">
      <div className="mt-1 shrink-0">{mark}</div>
      <div>
        <p className="text-[14.5px] font-medium text-ink">{title}</p>
        <p className="mt-1.5 max-w-[44ch] text-[13.5px] leading-[1.7] text-ink/65">{body}</p>
      </div>
    </li>
  );
}

/* Hairline route-marks: dotted course + survey tick. No icon glyphs. */
function RouteMarkA() {
  // Dotted route arriving at a single waypoint dot
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <path d="M 4 30 C 12 26, 18 22, 26 22" strokeWidth={1} strokeDasharray="1.3 4" />
        <circle cx={28} cy={22} r={2.4} fill={ROYAL} stroke="none" />
        <path d="M 28 14 L 28 18" strokeOpacity={0.5} strokeWidth={0.9} />
      </g>
    </svg>
  );
}
function RouteMarkB() {
  // Two waypoints joined by a dotted bearing line
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <circle cx={9} cy={30} r={2.2} fill={ROYAL} stroke="none" />
        <path d="M 11 28 C 18 22, 24 18, 33 14" strokeWidth={1} strokeDasharray="1.3 4" />
        <circle cx={34} cy={14} r={2.2} fill={ROYAL} stroke="none" />
        <path d="M 6 34 L 38 34" strokeOpacity={0.25} strokeWidth={0.8} />
      </g>
    </svg>
  );
}
function RouteMarkC() {
  // Survey tick: hairline rule with three engraved ticks and a center mark
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeLinecap="round">
        <path d="M 4 24 L 40 24" strokeWidth={1} strokeOpacity={0.5} />
        <path d="M 10 20 L 10 28" strokeWidth={0.9} strokeOpacity={0.55} />
        <path d="M 22 16 L 22 32" strokeWidth={1} />
        <path d="M 34 20 L 34 28" strokeWidth={0.9} strokeOpacity={0.55} />
        <circle cx={22} cy={24} r={1.8} fill={ROYAL} stroke="none" />
      </g>
    </svg>
  );
}


function CalendarMark() {
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.2} strokeLinecap="round">
        <rect x={6} y={9} width={24} height={20} rx={2} strokeOpacity={0.55} />
        <path d="M 6 15 L 30 15" strokeOpacity={0.55} />
        <path d="M 12 7 L 12 11" />
        <path d="M 24 7 L 24 11" />
        <circle cx={18} cy={22} r={1.6} fill={ROYAL} stroke="none" />
      </g>
    </svg>
  );
}

/* -------------------- SECTION 4 - Fit list -------------------- */
function FitList() {
  const fits = [
    "The business works, but it works because of you.",
    "You have bought builds before and they did not change how the company runs.",
    "You want to know what to build next, in what order, and why.",
  ];
  const notFits = [
    "You want the cheapest option.",
    "You want execution without a map.",
    "You want it fast more than you want it right.",
  ];
  return (
    <section className="bg-paper">
      <div className={`${container} py-24 lg:py-28`}>
        <Reveal
          as="h2"
          variant="fade-up"
          className="text-center font-display text-[clamp(1.6rem,3vw,2.1rem)] text-ink"
        >
          This conversation is for founders who&hellip;
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-[1000px] grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <CheckMark />
              <h3 className="font-display text-[1.25rem] text-ink">It fits if:</h3>
            </div>
            <ul className="space-y-4">
              {fits.map((t) => (
                <li key={t} className="flex items-start gap-3 text-[14px] leading-[1.7] text-ink/75">
                  <span className="mt-[6px] shrink-0"><CheckMark small /></span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:border-l md:border-rule md:pl-12">
            <div className="mb-6 flex items-center gap-3">
              <CrossMark />
              <h3 className="font-display text-[1.25rem] text-ink">It does not fit if:</h3>
            </div>
            <ul className="space-y-4">
              {notFits.map((t) => (
                <li key={t} className="flex items-start gap-3 text-[14px] leading-[1.7] text-ink/75">
                  <span className="mt-[6px] shrink-0"><CrossMark small /></span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Reveal
          as="p"
          variant="fade-up"
          delay={300}
          className="mx-auto mt-16 max-w-[60ch] text-center text-[14px] leading-[1.8] text-ink/70"
        >
          If that first list sounded like you, the conversation is worth 30 minutes.
        </Reveal>
      </div>
    </section>
  );
}

function CheckMark({ small }: { small?: boolean }) {
  const s = small ? 16 : 26;
  return (
    <svg viewBox="0 0 32 32" width={s} height={s} aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
        {!small && <circle cx={16} cy={16} r={13} strokeOpacity={0.5} />}
        <path d="M 9 17 L 14 22 L 23 11" />
      </g>
    </svg>
  );
}
function CrossMark({ small }: { small?: boolean }) {
  const s = small ? 16 : 26;
  return (
    <svg viewBox="0 0 32 32" width={s} height={s} aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.2} strokeLinecap="round">
        {!small && <circle cx={16} cy={16} r={13} strokeOpacity={0.5} />}
        <path d="M 11 11 L 21 21" />
        <path d="M 21 11 L 11 21" />
      </g>
    </svg>
  );
}

/* -------------------- SECTION 5 - Close (cream) -------------------- */
function CloseSection() {
  return (
    <section className="relative bg-paper">
      <div className={`${container} grid grid-cols-1 items-center gap-12 pt-24 pb-28 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-28 lg:pb-36`}>
        <div className="text-center lg:text-left">
          <Reveal
            as="h2"
            variant="fade-up"
            className="font-display text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.18] tracking-[-0.018em] text-ink"
          >
            Where you are is where you are.<br />
            Where you need to be is{" "}
            <em className="italic font-normal" style={{ color: "oklch(0.55 0.13 75)" }}>
              what we map next
            </em>
            .
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={160} className="mx-auto mt-6 max-w-[52ch] text-[14.5px] leading-[1.8] text-ink/70 lg:mx-0">
            The first step is small. A conversation. No pitch, no pressure, no obligation. Everything after it is your choice.
          </Reveal>
          <Reveal as="div" variant="fade-up" delay={260} className="mt-8">
            <a
              href="#cta"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3 text-[13.5px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_30px_-12px_rgba(10,15,31,0.45)]"
            >
              Start the conversation
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </a>
          </Reveal>
          <Reveal as="p" variant="fade-up" delay={340} className="mx-auto mt-6 max-w-[52ch] text-[12.5px] italic leading-[1.7] text-ink/55 lg:mx-0">
            If the timing is right, we should talk. If it is not, the work is waiting when it is.
          </Reveal>
        </div>
        <Reveal as="div" variant="fade-up" delay={200} className="relative">
          <img
            src={notebookImg.url}
            alt="A cream Roadmap journal embossed with the Trust Tai paper-plane mark, beside a navy notebook on a warm desk."
            className="block h-auto w-full rounded-md object-cover shadow-[0_30px_60px_-30px_rgba(10,15,31,0.25)]"
            loading="lazy"
          />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------- CAL.COM POPUP -------------------- */
const CAL_LINK = "tai-shobajo-uzxa1b";

function useCalEmbed(calLink: string) {
  const loadedRef = React.useRef(false);

  const ensureBootstrap = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    if (loadedRef.current) return true;
    // Official Cal.com embed queue bootstrap (loads embed.js lazily).
    /* eslint-disable */
    (function (C: any, A: string, L: string) {
      const p = function (a: any, ar: any) { a.q.push(ar); };
      const d = C.document;
      C.Cal = C.Cal || function () {
        const cal = C.Cal; const ar = arguments;
        if (!cal.loaded) {
          cal.ns = {}; cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api: any = function () { p(api, arguments); };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]);
          } else { p(cal, ar); }
          return;
        }
        p(cal, ar);
      };
    })(window as any, "https://app.cal.com/embed/embed.js", "init");
    /* eslint-enable */
    loadedRef.current = true;
    return true;
  }, []);

  const open = React.useCallback(() => {
    try {
      ensureBootstrap();
      const w = window as unknown as { Cal?: (cmd: string, opts?: unknown) => void };
      if (!w.Cal) throw new Error("Cal not initialized");
      w.Cal("init", { origin: "https://cal.com" });
      w.Cal("modal", { calLink });
    } catch {
      if (typeof window !== "undefined") {
        window.open(`https://cal.com/${calLink}`, "_blank", "noopener,noreferrer");
      }
    }
  }, [calLink, ensureBootstrap]);

  return { open };
}

/* -------------------- INTAKE OVERLAY -------------------- */
function IntakeOverlay({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  const [mounted, setMounted] = React.useState(open);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), reduce ? 0 : 260);
    return () => window.clearTimeout(t);
  }, [open, reduce]);

  React.useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Leave a Roadmap note"
      className="fixed inset-0 z-[80] overflow-y-auto"
      style={{
        backgroundColor: "rgba(10,15,31,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: reduce ? 1 : visible ? 1 : 0,
        transition: reduce ? "none" : "opacity 320ms cubic-bezier(0.32,0.72,0,1)",
      }}
      onMouseDown={(e) => {
        // Click outside the room closes the overlay (clicks inside the card stop propagation).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mx-auto my-5 w-[min(100%-20px,1100px)] sm:my-10"
        style={{
          opacity: reduce ? 1 : visible ? 1 : 0,
          transform: reduce ? "none" : visible ? "translateY(0)" : "translateY(14px)",
          transition: reduce
            ? "none"
            : "opacity 420ms cubic-bezier(0.32,0.72,0,1) 60ms, transform 420ms cubic-bezier(0.32,0.72,0,1) 60ms",
        }}
      >
        <div
          className="relative rounded-[28px] border px-6 py-8 sm:px-12 sm:py-12 lg:px-16 lg:py-14"
          style={{
            backgroundColor: "oklch(0.97 0.02 255)",
            borderColor: "rgba(10,15,31,0.10)",
            boxShadow:
              "0 40px 90px -30px rgba(10,15,31,0.55), 0 12px 28px -14px rgba(10,15,31,0.22), inset 0 1px 0 rgba(255,255,255,0.55)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}


/* -------------------- PAGE -------------------- */
function BuildMyRoadmapPage() {
  const [intakeOpen, setIntakeOpen] = React.useState(false);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const intakeRef = React.useRef<HTMLDivElement | null>(null);
  const cal = useCalEmbed(CAL_LINK);

  const openIntake = React.useCallback((opener: HTMLElement | null) => {
    if (opener) openerRef.current = opener;
    setIntakeOpen(true);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("write") !== "open") {
      url.searchParams.set("write", "open");
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const closeIntake = React.useCallback(() => {
    setIntakeOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("write")) {
        url.searchParams.delete("write");
        window.history.replaceState({}, "", url.toString());
      }
    }
    const o = openerRef.current;
    if (o && typeof o.focus === "function") {
      window.setTimeout(() => o.focus(), 50);
    }
  }, []);

  // Initial mount: open the overlay if URL says so, or if a draft token exists.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const writeParam = url.searchParams.get("write");
      const fromUrl = url.searchParams.get("draft");
      const fromLs = window.localStorage.getItem(STORAGE_KEY);
      const hasDraft =
        (fromUrl && UUID_RE.test(fromUrl)) || (fromLs && UUID_RE.test(fromLs));
      if (writeParam === "open" || hasDraft) {
        setIntakeOpen(true);
        if (writeParam !== "open") {
          url.searchParams.set("write", "open");
          window.history.replaceState({}, "", url.toString());
        }
      }
    } catch { /* noop */ }
  }, []);

  // Browser back syncs to the URL: if ?write=open disappears, close the overlay.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const writeParam = new URL(window.location.href).searchParams.get("write");
      setIntakeOpen(writeParam === "open");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        {/* Reassurance band removed — the hero and the conversation card already carry it. */}
        <TwoDoors
          onOpenWriteDoor={openIntake}
          onOpenCallDoor={cal.open}
        />
        <FitList />
        <CloseSection />
      </main>
      <SiteFooter />
      <IntakeOverlay open={intakeOpen} onClose={closeIntake}>
        <IntakeExperience open={intakeOpen} intakeRef={intakeRef} onExit={closeIntake} />
      </IntakeOverlay>
    </div>
  );
}


/* -------------------- TWO DOORS -------------------- */
function TwoDoors({
  onOpenWriteDoor,
  onOpenCallDoor,
}: {
  onOpenWriteDoor: (opener: HTMLElement | null) => void;
  onOpenCallDoor: () => void;
}) {

  return (
    <section className="bg-paper">
      <div className={`${container} pb-4 pt-2 lg:pb-6`}>
        <div
          className="rounded-2xl border px-6 py-12 lg:px-12 lg:py-16"
          style={{
            background: "linear-gradient(to right, #F6F9FE, #EEF5FF)",
            borderColor: "rgba(37,99,255,0.18)",
          }}
        >
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
            <div>
              <div className="flex items-baseline gap-3">
                <SparkGlyph />
                <h2 className="font-display text-[clamp(1.4rem,2.4vw,1.85rem)] tracking-[-0.012em] text-ink">
                  Two ways to begin.
                </h2>
              </div>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.24em] text-ink/55">
                Choose what feels easiest right now.
              </p>

              <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Door 1 - conversation (recommended, unchanged) */}
                <div
                  className="relative rounded-xl border-2 bg-white/80 p-7 text-center shadow-[0_20px_50px_-30px_rgba(10,15,31,0.25)]"
                  style={{ borderColor: ROYAL }}
                >
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-paper"
                    style={{ backgroundColor: ROYAL }}
                  >
                    Recommended
                  </span>
                  <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(37,99,255,0.10)" }}>
                    <CalendarMark />
                  </div>
                  <h3 className="mt-5 font-display text-[1.2rem] text-ink">Start with a conversation.</h3>
                  <p className="mt-3 text-[13.5px] leading-[1.7] text-ink/70">
                    Thirty minutes. No pitch.<br />
                    We listen first, then tell you<br />honestly what we see.
                  </p>
                  <ul className="mt-6 space-y-2.5 text-left">
                    {[
                      "Live conversation with a person",
                      "No slides, no pitch deck",
                      "You leave with clarity either way",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2.5 text-[13px] leading-[1.6] text-ink/75">
                        <span className="mt-[5px] shrink-0"><CheckMark small /></span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={onOpenCallDoor}
                    className="group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)]"
                  >
                    Book a 30-minute call
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </button>

                  <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/45">
                    View availability and pick a time
                  </p>
                </div>

                {/* Door 2 - write (statement heading + honest bullets) */}
                <div className="rounded-xl border border-rule bg-white/60 p-7 text-center">
                  <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(37,99,255,0.08)" }}>
                    <PencilGlyph />
                  </div>
                  <h3 className="mt-5 font-display text-[1.2rem] text-ink">Or write it first.</h3>
                  <p className="mt-3 text-[13.5px] leading-[1.7] text-ink/70">
                    Answer a few questions in your<br />own words. You can keep it rough.<br />A person will read it.
                  </p>
                  <ul className="mt-6 space-y-2.5 text-left">
                    {[
                      "Four questions, four more if you want",
                      "Keep it rough, we read with care",
                      "Save and come back anytime",
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2.5 text-[13px] leading-[1.6] text-ink/75">
                        <span className="mt-[5px] shrink-0"><CheckMark small /></span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={(e) => onOpenWriteDoor(e.currentTarget)}

                    className="group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full border-2 px-5 py-3 text-[13px] font-semibold transition-all duration-300 ease-out hover:-translate-y-[1px]"
                    style={{ borderColor: ROYAL, color: ROYAL }}
                  >
                    Leave a Roadmap note
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </button>
                  <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink/45">
                    We will read it with care
                  </p>
                </div>
              </div>
            </div>

            {/* Right rail - before you wonder */}
            <aside className="lg:border-l lg:border-ink/10 lg:pl-12">
              <h3 className="font-display text-[clamp(1.25rem,1.9vw,1.5rem)] text-ink">Before you wonder.</h3>
              <ul className="mt-7 space-y-7">
                <ReassureRow
                  icon={<PersonGlyph />}
                  title="You will not be hounded."
                  body={<>One reply, from a person.<br />If you go quiet, we leave you be.</>}
                />
                <ReassureRow
                  icon={<NoPitchGlyph />}
                  title="You will not be pitched."
                  body={<>The first conversation has<br />no slides and no close.<br />We listen.</>}
                />
                <ReassureRow
                  icon={<LeafGlyph />}
                  title="You will not be the wrong fit in silence."
                  body={<>If we are not right for you,<br />we say so on the call, and<br />point you somewhere better.</>}
                />
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReassureRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span
        className="mt-[2px] inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
        style={{ borderColor: "rgba(37,99,255,0.25)" }}
      >
        {icon}
      </span>
      <div>
        <p className="text-[13.5px] font-medium leading-[1.5]" style={{ color: ROYAL }}>{title}</p>
        <p className="mt-1.5 text-[13px] leading-[1.7] text-ink/65">{body}</p>
      </div>
    </li>
  );
}

function SparkGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path d="M10 2 L11.2 8.8 L18 10 L11.2 11.2 L10 18 L8.8 11.2 L2 10 L8.8 8.8 Z" fill={ROYAL} />
    </svg>
  );
}
function PencilGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20 L8 19 L20 7 L17 4 L5 16 Z" />
        <path d="M14 7 L17 10" />
      </g>
    </svg>
  );
}
function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.3} strokeLinecap="round">
        <circle cx={12} cy={9} r={3.2} />
        <path d="M5 19 C 6 15.5, 9 14, 12 14 C 15 14, 18 15.5, 19 19" />
      </g>
    </svg>
  );
}
function NoPitchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.3} strokeLinecap="round">
        <rect x={4} y={6} width={16} height={11} rx={1.5} />
        <path d="M5 7 L19 16" />
      </g>
    </svg>
  );
}
function LeafGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19 C 5 11, 11 5, 19 5 C 19 13, 13 19, 5 19 Z" />
        <path d="M5 19 L13 11" />
      </g>
    </svg>
  );
}
