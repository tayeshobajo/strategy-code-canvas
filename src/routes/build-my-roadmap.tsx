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
        { property: "og:url", content: "/build-my-roadmap" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "/build-my-roadmap" }],
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
      <div className={`${container} grid grid-cols-1 items-center gap-10 pt-[140px] pb-10 lg:grid-cols-[1.05fr_1fr] lg:pt-[160px] lg:pb-12`}>
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


/* -------------------- SECTION 2 — What the conversation is -------------------- */
function ConversationSteps() {
  const steps = [
    {
      n: "One.",
      title: "We talk for 30 minutes.",
      body:
        "You describe where the business is and where it feels stuck. We listen more than we talk. No slides, no pitch deck.",
    },
    {
      n: "Two.",
      title: "We tell you what we see.",
      body:
        "Where your business stands, and whether a Roadmap fits. If it does not, we say so. You leave with a clearer view either way.",
    },
    {
      n: "Three.",
      title: "If it fits, we map.",
      body:
        "Only if it makes sense for you. The Roadmap engagement comes after the conversation, never before, and never as a surprise.",
    },
  ];
  return (
    <section className="bg-paper">
      <div className={`${container} pt-16 pb-24 lg:pt-20 lg:pb-28`}>
        <Reveal
          as="h2"
          variant="fade-up"
          className="text-center font-display text-[clamp(1.6rem,3vw,2.1rem)] leading-tight text-ink"
        >
          What the conversation is.
        </Reveal>

        <div className="relative mx-auto mt-14 max-w-[1080px]">
          {/* Hairline dotted joiner across the three circles, behind them */}
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-[22px] hidden h-px md:block"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(10,15,31,0.22) 0 4px, transparent 4px 10px)",
              backgroundSize: "10px 1px",
              backgroundRepeat: "repeat-x",
            }}
            aria-hidden="true"
          />
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <Reveal
                key={s.n}
                variant="fade-up"
                delay={i * 120}
                className="relative flex flex-col items-center text-center"
              >
                <div
                  className="relative z-[1] flex h-11 w-11 items-center justify-center rounded-full border bg-paper font-mono text-[13px]"
                  style={{ borderColor: ROYAL, color: ROYAL }}
                >
                  {i + 1}
                </div>
                <p className="mt-6 font-display text-[1.35rem]" style={{ color: ROYAL }}>
                  {s.n}
                </p>
                <p className="mt-1 font-display text-[1.15rem] text-ink">{s.title}</p>
                <p className="mt-3 max-w-[28ch] text-[13.5px] leading-[1.7] text-ink/65">
                  {s.body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal
          as="p"
          variant="fade-up"
          delay={420}
          className="mx-auto mt-16 max-w-[60ch] text-center text-[14px] leading-[1.8] text-ink/70"
        >
          No pressure to decide on the call. No follow-up hounding. If the timing is right, we keep talking. If it is not, the work is waiting when it is.
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------- SECTION 3 — Form + Reassurance -------------------- */
const NAME_MAX = 100;
const EMAIL_MAX = 255;
const STUCK_MAX = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_EMAIL = "tai@trusttai.com";

type FieldErrors = { name?: string; email?: string; stuck?: string };

function StartConversation() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [stuck, setStuck] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [status, setStatus] = React.useState<"idle" | "submitting" | "submitted" | "error">("idle");

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    const n = name.trim();
    const em = email.trim();
    const s = stuck.trim();
    if (!n) e.name = "Please enter your name.";
    else if (n.length > NAME_MAX) e.name = `Keep it under ${NAME_MAX} characters.`;
    if (!em) e.email = "Please enter your email.";
    else if (em.length > EMAIL_MAX) e.email = `Keep it under ${EMAIL_MAX} characters.`;
    else if (!EMAIL_RE.test(em)) e.email = "That email does not look right.";
    if (s.length > STUCK_MAX) e.stuck = `Keep it under ${STUCK_MAX} characters.`;
    return e;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setStatus("submitting");
    const correlationId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `roadmap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const res = await fetch("/api/public/hooks/build-roadmap-contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          stuck: stuck.trim(),
          correlationId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("submitted");
    } catch (err) {
      console.error("[build-my-roadmap] submit failed", { correlationId, err });
      setStatus("error");
    }
  };

  if (status === "submitted") {
    return <SuccessSection />;
  }

  return (
    <section
      id="cta"
      className="relative"
      style={{ background: "linear-gradient(to right, #F6F9FE, #EEF5FF)" }}
    >
      <div className={`${container} grid grid-cols-1 gap-14 py-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:py-28`}>
        {/* LEFT — form */}
        <div>
          <Reveal as="h2" variant="fade-up" className="font-display text-[clamp(1.6rem,2.6vw,2rem)] text-ink">
            Start the conversation.
          </Reveal>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            <Field label="Name" error={errors.name}>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
                maxLength={NAME_MAX}
                aria-invalid={!!errors.name}
                placeholder="Your name"
                className={`w-full rounded-md border bg-white px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-royal ${errors.name ? "border-[#B91C1C]" : "border-rule"}`}
              />
            </Field>
            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                maxLength={EMAIL_MAX}
                aria-invalid={!!errors.email}
                placeholder="you@example.com"
                className={`w-full rounded-md border bg-white px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-royal ${errors.email ? "border-[#B91C1C]" : "border-rule"}`}
              />
            </Field>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-[13px] text-ink/75">
                  In a sentence or two, where does your business feel stuck right now?
                </label>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink/45">
                  (optional)
                </span>
              </div>
              <textarea
                value={stuck}
                onChange={(e) => {
                  setStuck(e.target.value);
                  if (errors.stuck) setErrors((p) => ({ ...p, stuck: undefined }));
                }}
                rows={4}
                maxLength={STUCK_MAX}
                aria-invalid={!!errors.stuck}
                placeholder="Tell us what is on your mind"
                className={`w-full rounded-md border bg-white px-4 py-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-royal ${errors.stuck ? "border-[#B91C1C]" : "border-rule"}`}
              />
              <div className="mt-1.5 flex items-center justify-between">
                {errors.stuck ? (
                  <p className="text-[12px] text-[#B91C1C]">{errors.stuck}</p>
                ) : <span />}
                <span className="font-mono text-[10.5px] text-ink/40">{stuck.length}/{STUCK_MAX}</span>
              </div>
            </div>


            {/* Divider */}
            <div className="relative pt-2 pb-1 text-center">
              <span className="relative z-[1] inline-block px-4 font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink/55" style={{ backgroundColor: "#F2F5F8" }}>
                Or book a time that works
              </span>
              <span className="absolute left-0 right-0 top-1/2 -z-0 h-px bg-ink/10" aria-hidden="true" />
            </div>

            {/* Calendar block */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-md border border-rule bg-white px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <CalendarMark />
                <div>
                  <p className="text-[14px] text-ink">Find a time on our calendar</p>
                  <p className="text-[12.5px] text-ink/60">Choose a 30-minute slot that works for you.</p>
                </div>
              </div>
              <a
                href="#availability"
                className="group inline-flex items-center gap-2 rounded-full border border-royal px-4 py-2 text-[12.5px] font-medium text-royal transition-colors hover:bg-royal hover:text-white"
              >
                View Availability
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>

            <button
              type="submit"
              disabled={status === "submitting"}
              aria-busy={status === "submitting"}
              className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[13.5px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {status === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <span>Start the conversation</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            {status === "error" ? (
              <p className="text-[12.5px] leading-[1.7] text-ink/70">
                That did not send. Your words are still here. Try once more, or email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-ink/30 underline-offset-2 hover:text-ink">
                  {CONTACT_EMAIL}
                </a>{" "}
                directly.
              </p>
            ) : (
              <p className="text-[12.5px] leading-[1.7] text-ink/55">
                We reply within one business day. A real person, not a sequence.
              </p>
            )}
          </form>
        </div>

        {/* RIGHT — reassurance */}
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

/* -------------------- SUCCESS STATE -------------------- */
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
        {/* LEFT — confirmation */}
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

        {/* RIGHT — reassurance (preserved) */}
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

/* Hairline marks for the success steps — vertical timeline feel */
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

/* -------------------- SECTION 4 — Fit list -------------------- */
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

/* -------------------- SECTION 5 — Close (cream) -------------------- */
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
        <ConversationSteps />
        <StartConversation />
        <FitList />
        <CloseSection />
      </main>
      <SiteFooter />
    </div>
  );
}
