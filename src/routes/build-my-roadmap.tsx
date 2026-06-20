import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import * as React from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal } from "@/hooks/use-reveal";
import notebookImg from "@/assets/cta-book-cover-desk.png.asset.json";

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
    <section className="relative w-full overflow-hidden bg-paper">
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

/* Hairline engraved illustration: layered ridges, a detailed engraved pine,
   and a winding dotted route descending from POINT A through the valley.
   No fills, no glow — pure cartographer's pen. */
function EngravedWorld() {
  return (
    <svg
      viewBox="0 0 640 420"
      className="block w-full h-auto"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="#0A0F1F"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Far back range — softest */}
        <g strokeOpacity={0.16} strokeWidth={0.8}>
          <path d="M 30 200 L 80 168 L 110 184 L 150 150 L 190 176 L 225 156 L 265 182 L 305 160 L 345 188 L 385 166 L 425 192 L 465 172 L 505 196 L 545 178 L 585 200 L 615 188" />
          <path d="M 50 218 L 95 188 L 130 210 L 170 174 L 210 204 L 250 180 L 290 208 L 335 186 L 375 212 L 420 190 L 460 216 L 500 196 L 540 220" />
        </g>

        {/* Mid range with light hatching */}
        <g strokeOpacity={0.3} strokeWidth={0.9}>
          <path d="M 40 244 L 100 198 L 140 232 L 185 178 L 225 222 L 265 192 L 310 232 L 355 196 L 400 236 L 445 204 L 490 240 L 535 212 L 580 244" />
          <g strokeOpacity={0.45}>
            <path d="M 178 200 L 196 226" />
            <path d="M 188 196 L 206 222" />
            <path d="M 198 198 L 214 222" />
            <path d="M 258 210 L 274 232" />
            <path d="M 268 206 L 284 228" />
            <path d="M 348 214 L 366 240" />
            <path d="M 358 210 L 374 234" />
            <path d="M 368 214 L 382 238" />
            <path d="M 438 220 L 454 244" />
            <path d="M 448 218 L 462 240" />
          </g>
        </g>

        {/* Front ridge — strongest line + dense hatching */}
        <g strokeOpacity={0.55} strokeWidth={1}>
          <path d="M 20 286 L 70 246 L 110 274 L 152 220 L 200 268 L 245 234 L 290 280 L 335 244 L 380 286 L 425 252 L 470 290 L 515 262 L 560 296 L 600 272" />
          <g strokeOpacity={0.5} strokeWidth={0.7}>
            <path d="M 142 240 L 162 268" />
            <path d="M 152 234 L 172 262" />
            <path d="M 162 240 L 180 266" />
            <path d="M 232 252 L 252 278" />
            <path d="M 242 248 L 262 274" />
            <path d="M 252 252 L 270 278" />
            <path d="M 322 258 L 342 282" />
            <path d="M 332 254 L 350 278" />
            <path d="M 412 268 L 430 292" />
            <path d="M 422 264 L 440 288" />
            <path d="M 502 276 L 520 298" />
          </g>
        </g>

        {/* Valley floor — broken horizon */}
        <g strokeOpacity={0.22} strokeWidth={0.8}>
          <path d="M 20 326 C 110 322, 220 326, 340 326 S 560 330, 620 326" />
          <path d="M 30 338 C 140 336, 260 340, 380 338 S 580 340, 615 338" strokeOpacity={0.14} />
          <g strokeOpacity={0.18}>
            <path d="M 70 332 L 78 332" />
            <path d="M 130 332 L 140 332" />
            <path d="M 200 332 L 212 332" />
            <path d="M 280 332 L 292 332" />
            <path d="M 360 332 L 372 332" />
            <path d="M 440 332 L 452 332" />
          </g>
        </g>

        {/* Detailed engraved pine — lower right */}
        <g transform="translate(545 222)" strokeOpacity={0.7} strokeWidth={0.9}>
          {/* trunk */}
          <path d="M 0 110 L 0 62" />
          <path d="M -2 108 L -2 70" strokeOpacity={0.4} />
          {/* foliage tiers */}
          <path d="M -10 62 L 0 42 L 10 62" />
          <path d="M -16 78 L 0 50 L 16 78" />
          <path d="M -22 94 L 0 58 L 22 94" />
          <path d="M -28 108 L 0 66 L 28 108" />
          {/* inner shading hatching */}
          <g strokeOpacity={0.4} strokeWidth={0.6}>
            <path d="M -6 60 L -2 56" />
            <path d="M -10 72 L -4 66" />
            <path d="M -14 86 L -6 78" />
            <path d="M -18 100 L -8 90" />
            <path d="M 6 60 L 2 56" />
            <path d="M 10 72 L 4 66" />
            <path d="M 14 86 L 6 78" />
            <path d="M 18 100 L 8 90" />
          </g>
          {/* base ground tick */}
          <path d="M -14 112 L 14 112" strokeOpacity={0.45} />
        </g>

        {/* Small accompanying shrubs */}
        <g strokeOpacity={0.35} strokeWidth={0.7}>
          <path d="M 470 322 L 470 312 M 466 320 L 470 314 L 474 320" />
          <path d="M 420 326 L 420 318 M 417 324 L 420 320 L 423 324" />
        </g>
      </g>

      {/* Winding dotted route from POINT A pin, curving down through the valley */}
      <path
        d="M 558 96
           C 540 130, 510 138, 478 132
           S 430 116, 398 138
           S 350 188, 320 200
           S 250 198, 222 224
           S 158 268, 130 286
           S 80 314, 60 324"
        fill="none"
        stroke={ROYAL}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray="1.6 6"
        opacity={0.9}
      />

      {/* POINT A pin */}
      <g transform="translate(560 96)">
        <text
          x={-6}
          y={-22}
          textAnchor="end"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 3,
            fill: ROYAL,
            textTransform: "uppercase",
          }}
        >
          POINT A
        </text>
        <path
          d="M 0 -16 C 8 -16, 14 -10, 14 -2 C 14 8, 0 18, 0 18 C 0 18, -14 8, -14 -2 C -14 -10, -8 -16, 0 -16 Z"
          fill={ROYAL}
        />
        <circle cx={0} cy={-2} r={3.5} fill="#FBF9F4" />
      </g>
    </svg>
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

type FieldErrors = { name?: string; email?: string; stuck?: string };

function StartConversation() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [stuck, setStuck] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [status, setStatus] = React.useState<"idle" | "submitting" | "submitted">("idle");

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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setStatus("submitting");
    // Local-only handler. A real submission endpoint can be wired here.
    window.setTimeout(() => setStatus("submitted"), 250);
  };
  const submitted = status === "submitted";

  return (
    <section
      id="cta"
      className="relative"
      style={{ backgroundColor: "color-mix(in oklch, var(--royal) 8%, var(--paper))" }}
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
              <span className="relative z-[1] inline-block bg-[color:color-mix(in_oklch,var(--royal)_8%,var(--paper))] px-4 font-mono text-[10.5px] uppercase tracking-[0.28em] text-ink/55">
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
              className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[13.5px] font-semibold text-paper transition-all duration-300 ease-out hover:-translate-y-[1px] hover:shadow-[0_10px_28px_-12px_rgba(10,15,31,0.45)]"
            >
              {submitted ? "Thank you — we'll reply shortly." : "Start the conversation"}
              {!submitted && (
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              )}
            </button>

            <p className="text-[12.5px] leading-[1.7] text-ink/55">
              We reply within one business day. A real person, not a sequence.
            </p>
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
        <p className="text-[14.5px] font-medium" style={{ color: ROYAL }}>{title}</p>
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

function RouteMarkB() {
  // Milestone post: a numbered cairn-stone marker on a route line
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M 4 32 C 14 32, 18 32, 22 32 S 34 32, 40 32" strokeOpacity={0.45} />
        <rect x={17} y={14} width={10} height={18} rx={1.5} />
        <path d="M 17 21 L 27 21" strokeOpacity={0.45} />
        <path d="M 22 10 L 22 14" />
        <circle cx={22} cy={9} r={1.4} fill={ROYAL} stroke="none" />
      </g>
    </svg>
  );
}
function RouteMarkC() {
  // Route bearing: dotted course toward a destination cross
  return (
    <svg viewBox="0 0 44 44" className="h-9 w-9" aria-hidden="true">
      <g fill="none" stroke={ROYAL} strokeWidth={1} strokeLinecap="round">
        <circle cx={10} cy={32} r={2.2} fill={ROYAL} stroke="none" />
        <path d="M 12 30 L 32 12" strokeDasharray="1.4 4" />
        <path d="M 28 12 L 34 12 L 34 18" strokeOpacity={0.7} />
        <path d="M 30 8 L 36 14 M 36 8 L 30 14" strokeOpacity={0.55} />
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
