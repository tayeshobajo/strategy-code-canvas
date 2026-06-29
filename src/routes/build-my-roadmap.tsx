import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
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
const REFLECT_DEBOUNCE_MS = 1500;
const REFLECT_TIMEOUT_MS = 12000;
const STORAGE_KEY = "tt:intake:token:v1";
const PATH_D = "M22,64 C 200,30 300,82 400,52 S 560,24 658,34";

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

function IntakeExperience({ open, intakeRef }: { open: boolean; intakeRef: React.RefObject<HTMLDivElement | null> }) {
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
            try { window.localStorage.setItem(STORAGE_KEY, token); } catch { /* noop */ }
            // Ensure ?draft= is on the URL for shareability
            if (!url.searchParams.get("draft")) {
              url.searchParams.set("draft", token);
              window.history.replaceState({}, "", url.toString());
            }
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
        } catch (err) {
          console.warn("[intake] autosave failed (non-blocking)", err);
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
  };

  // When the door opens, scroll the intake into view.
  React.useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      intakeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [open, intakeRef]);


  // Reflection debouncing per-question (with timeout + abort)
  const reflectTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const reflectAborts = React.useRef<Record<string, AbortController | undefined>>({});
  React.useEffect(() => {
    if (step < 0 || step >= total) return;
    const q = QUESTIONS[step];
    const value = answers[q.key]?.response ?? "";
    const trimmed = value.trim();

    const existing = reflectTimers.current[q.key];
    if (existing) clearTimeout(existing);
    reflectAborts.current[q.key]?.abort();

    if (trimmed.length < REFLECT_MIN) {
      setReflections((prev) => ({ ...prev, [q.key]: { state: "idle", text: "" } }));
      return;
    }

    reflectTimers.current[q.key] = setTimeout(async () => {
      const ctrl = new AbortController();
      reflectAborts.current[q.key] = ctrl;
      const to = setTimeout(() => ctrl.abort(), REFLECT_TIMEOUT_MS);
      setReflections((prev) => ({ ...prev, [q.key]: { state: "loading", text: prev[q.key]?.text ?? "" } }));
      try {
        const mod = await import("@/lib/intake.functions");
        const res = await mod.reflectAnswer({
          data: { question: `${q.before}${q.accent}${q.after}`, answer: trimmed },
          signal: ctrl.signal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        const text = (res?.text ?? "").trim();
        if (!text) {
          setReflections((prev) => ({ ...prev, [q.key]: { state: "idle", text: "" } }));
          return;
        }
        setReflections((prev) => ({ ...prev, [q.key]: { state: "ready", text } }));
        setAnswers((prev) => ({
          ...prev,
          [q.key]: { response: prev[q.key]?.response ?? trimmed, reflected_offered: text },
        }));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.warn("[intake] reflect failed (non-blocking)", err);
        setReflections((prev) => ({ ...prev, [q.key]: { state: "error", text: "" } }));
      } finally {
        clearTimeout(to);
      }
    }, REFLECT_DEBOUNCE_MS);

    return () => {
      const t = reflectTimers.current[q.key];
      if (t) clearTimeout(t);
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
    if (step < total - 1) setStep(step + 1);
    else setStep(total); // to review
  };
  const back = () => {
    if (step > -1) setStep(step - 1);
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
    if (Object.keys(ce).length > 0) return;

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
    } catch (err) {
      console.error("[intake] submit failed", err);
      setStatus("error");
    }
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
      } else {
        setResumeNote({ kind: "saved", text: "your progress is saved to this link. bookmark it and come back anytime." });
      }
    } catch (err) {
      console.warn("[intake] save and come back failed", err);
      setResumeNote({ kind: "error", text: "we could not save just yet. your words are still on this page." });
    }
  };


  const firstName = contact.name.trim().split(/\s+/)[0] || "there";
  const currentQuestion = step >= 0 && step < total ? QUESTIONS[step] : null;
  const currentAnswerValue = currentQuestion ? answers[currentQuestion.key]?.response ?? "" : "";
  const currentReflection = currentQuestion ? reflections[currentQuestion.key] : undefined;

  if (!open) return null;

  return (
    <section
      id="intake"
      ref={intakeRef}
      className="relative scroll-mt-24"
      style={{ background: "linear-gradient(to right, #F6F9FE, #EEF5FF)" }}
    >
      <div className={`${container} py-20 lg:py-24`}>
        {/* Journey path */}
        <JourneyPath progress={progress} reachedReview={step >= total} />

        <div className="mx-auto mt-10 max-w-[760px]">
          {step === -1 && (
            <IntakeIntro onBegin={() => setStep(0)} />
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
            />
          )}

          {step === total + 1 && <IntakeConfirmation firstName={firstName} />}
        </div>

        {step >= 0 && step < total && (
          <div className="mx-auto mt-12 max-w-[760px] text-center">
            <button
              type="button"
              onClick={onSaveAndComeBack}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/55 underline decoration-ink/20 underline-offset-[5px] hover:text-ink hover:decoration-ink/60"
            >
              save and come back later
            </button>
            {resumeNote && (
              <p className="mt-3 font-mono text-[11px] normal-case tracking-[0.04em] text-ink/55">
                {resumeNote.text}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function JourneyPath({ progress, reachedReview }: { progress: number; reachedReview: boolean }) {
  const reduce = usePrefersReducedMotion();
  // path length approx 680; draw stroke-dashoffset for progress
  const LENGTH = 680;
  const offset = reduce ? 0 : LENGTH * (1 - progress);
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <svg viewBox="0 0 680 100" className="block h-[80px] w-full" aria-hidden="true">
        <defs>
          <pattern id="intake-dotted" x="0" y="0" width="6" height="2" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" fill="rgba(10,15,31,0.18)" />
          </pattern>
        </defs>
        {/* Faint dotted base */}
        <path d={PATH_D} fill="none" stroke="rgba(10,15,31,0.18)" strokeWidth={1} strokeDasharray="2 5" />
        {/* Drawn blue line */}
        <path
          d={PATH_D}
          fill="none"
          stroke={ROYAL}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={offset}
          style={{ transition: reduce ? "none" : "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {/* Point A */}
        <g transform="translate(22,64)">
          <circle r="5.5" fill={ROYAL} />
          <circle r="11" fill="none" stroke={ROYAL} strokeOpacity="0.25" />
        </g>
        {/* Point B */}
        <g
          transform="translate(658,34)"
          style={{
            opacity: reachedReview ? 1 : 0,
            transition: reduce ? "none" : "opacity 500ms ease-out",
          }}
        >
          <circle r="5.5" fill="#0A0F1F" />
          <circle r="11" fill="none" stroke="#0A0F1F" strokeOpacity="0.25" />
        </g>
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-ink/45">
        <span>Point A</span>
        <span style={{ opacity: reachedReview ? 1 : 0.35 }}>Point B</span>
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
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink/55">
        {q.eyebrow}
        {isOptional && <span className="ml-3 text-ink/35 normal-case tracking-[0.04em]">optional</span>}
      </p>
      <h2 className="mt-4 font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.25] tracking-[-0.015em] text-ink">
        {q.before}
        <em className="italic font-normal" style={{ color: ROYAL }}>{q.accent}</em>
        {q.after}
      </h2>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={q.placeholder}
        className="mt-8 w-full resize-none rounded-md border border-rule bg-white/70 px-5 py-4 text-[15px] leading-[1.7] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-royal"
        autoFocus
      />

      <div className="min-h-[64px] mt-3">
        {reflection?.state === "loading" && (
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/45">
            reading that back&hellip;
          </p>
        )}
        {reflection?.state === "ready" && reflection.text && (
          <div>
            <p
              className="font-display italic text-[15px] leading-[1.7]"
              style={{ color: "rgba(10,15,31,0.42)" }}
            >
              {reflection.text}
            </p>
            <button
              type="button"
              onClick={onUseReflected}
              className="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] underline decoration-royal/30 underline-offset-[5px] hover:decoration-royal"
              style={{ color: ROYAL }}
            >
              use these words
            </button>
          </div>
        )}
        {reflection?.state === "error" && (
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/45">
            we could not read that back. your words are fine as written.
          </p>
        )}
      </div>


      <div className="mt-6 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink/55 hover:text-ink"
          >
            ← back
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[13px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <span>{isLast ? "Review" : "Next"}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>

      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink/40">
        {String(index + 1).padStart(2, "0")} of {String(total).padStart(2, "0")}
      </p>
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
          <p className="mt-6 text-[13px] leading-[1.7] text-ink/70">
            That did not send. Your words are still here. Try once more, or email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-ink/30 underline-offset-2 hover:text-ink">
              {CONTACT_EMAIL}
            </a>{" "}
            directly.
          </p>
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

/* -------------------- PAGE -------------------- */
function BuildMyRoadmapPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main>
        <Hero />
        <ConversationLead />
        <IntakeExperience />
        <FitList />
        <CloseSection />
      </main>
      <SiteFooter />
    </div>
  );
}
