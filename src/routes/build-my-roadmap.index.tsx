import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, SkipForward } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { VoiceRecorder } from "@/components/intake/VoiceRecorder";
import { Reveal } from "@/hooks/use-reveal";
import heroMountain from "@/assets/roadmap-hero-mountain.png.asset.json";
import {
  completeIntakeSession,
  loadIntakeSession,
  saveIntakeProgress,
  startIntakeSession,
  transcribeIntakeVoiceAnswer,
} from "@/lib/website-intake.functions";
import { readAttribution, recordFirstTouch } from "@/lib/website-intake/attribution";
import {
  CONTACT_PROMPT,
  EARLY_EXIT_PROMPT,
  canOfferEarlyExit,
  completeness,
  nextStep,
  objectiveCoverage,
  type ConversationState,
} from "@/lib/website-intake/adaptive";
import type { FollowUpKey, IntakeObjectiveKey } from "@/lib/website-intake/questions";
import type { VerbatimAnswer } from "@/lib/website-intake/types";

const RESUME_KEY = "tt_intake_resume_v1";

export const Route = createFileRoute("/build-my-roadmap/")({
  head: () => {
    const title = "Build My Roadmap | Trust Tai";
    const description =
      "A conversation, not a form. Tell us about your business in your own words — by typing or speaking — and we'll come back with what we see.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://trusttai.com/build-my-roadmap" },
        { property: "og:site_name", content: "Trust Tai" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: "https://trusttai.com/build-my-roadmap" }],
    };
  },
  component: BuildMyRoadmap,
});

type Phase = "intro" | "conversation" | "contact" | "done";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function BuildMyRoadmap() {
  const start = useServerFn(startIntakeSession);
  const load = useServerFn(loadIntakeSession);
  const save = useServerFn(saveIntakeProgress);
  const transcribe = useServerFn(transcribeIntakeVoiceAnswer);
  const complete = useServerFn(completeIntakeSession);

  const [phase, setPhase] = React.useState<Phase>("intro");
  const [resumeToken, setResumeToken] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<VerbatimAnswer[]>([]);
  const [skipped, setSkipped] = React.useState<IntakeObjectiveKey[]>([]);
  const [followUpsAsked, setFollowUpsAsked] = React.useState<FollowUpKey[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [resuming, setResuming] = React.useState(false);
  const [wrapUp, setWrapUp] = React.useState(false);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [contactOk, setContactOk] = React.useState(true);

  React.useEffect(() => {
    recordFirstTouch();
  }, []);

  const state: ConversationState = React.useMemo(
    () => ({ answers, skipped, followUpsAsked }),
    [answers, skipped, followUpsAsked],
  );
  const step = React.useMemo(() => nextStep(state), [state]);
  const coverage = React.useMemo(() => objectiveCoverage(state), [state]);
  const progress = React.useMemo(() => completeness(state), [state]);
  const offerExit = React.useMemo(() => canOfferEarlyExit(state), [state]);

  // Resume anything left behind in this browser.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem(RESUME_KEY);
    if (!token) return;
    setResuming(true);
    void (async () => {
      try {
        const session = (await load({ data: { resumeToken: token } })) as Awaited<
          ReturnType<typeof loadIntakeSession>
        >;
        if (!session || session.status === "completed") {
          window.localStorage.removeItem(RESUME_KEY);
          return;
        }
        setResumeToken(token);
        setAnswers(session.verbatim as VerbatimAnswer[]);
        setSkipped(session.skipped as IntakeObjectiveKey[]);
        setFollowUpsAsked(session.followUpsAsked as FollowUpKey[]);
        setName((session.person as { name?: string | null })?.name ?? "");
        setEmail((session.person as { email?: string | null })?.email ?? "");
        if ((session.verbatim as VerbatimAnswer[]).length > 0) setPhase("conversation");
      } catch {
        window.localStorage.removeItem(RESUME_KEY);
      } finally {
        setResuming(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureSession = React.useCallback(async () => {
    if (resumeToken) return resumeToken;
    const created = (await start({ data: { attribution: readAttribution() } })) as {
      resumeToken: string;
    };
    setResumeToken(created.resumeToken);
    try {
      window.localStorage.setItem(RESUME_KEY, created.resumeToken);
    } catch {
      /* private browsing — resume simply won't be available */
    }
    return created.resumeToken;
  }, [resumeToken, start]);

  const persist = React.useCallback(
    async (next: {
      verbatim: VerbatimAnswer[];
      skipped: IntakeObjectiveKey[];
      followUpsAsked: FollowUpKey[];
    }) => {
      const token = await ensureSession();
      await save({
        data: {
          resumeToken: token,
          verbatim: next.verbatim,
          skipped: next.skipped,
          followUpsAsked: next.followUpsAsked,
        },
      });
    },
    [ensureSession, save],
  );

  const currentPrompt =
    step.kind === "contact"
      ? CONTACT_PROMPT
      : step.kind === "followup"
        ? step.prompt
        : step.prompt;

  const recordAnswer = React.useCallback(
    async (text: string, modality: "text" | "voice", mediaRef?: string | null) => {
      if (step.kind === "contact") return;
      const key =
        step.kind === "followup"
          ? (`${step.forKey}__followup_${step.key}` as VerbatimAnswer["key"])
          : step.key;
      const answer: VerbatimAnswer = {
        key,
        question: currentPrompt,
        answer: text,
        modality,
        media_ref: mediaRef ?? null,
        answered_at: new Date().toISOString(),
      };
      const nextAnswers = [...answers, answer];
      const nextFollowUps =
        step.kind === "followup" ? [...followUpsAsked, step.key] : followUpsAsked;
      setAnswers(nextAnswers);
      setFollowUpsAsked(nextFollowUps);
      setDraft("");
      await persist({ verbatim: nextAnswers, skipped, followUpsAsked: nextFollowUps });
    },
    [answers, currentPrompt, followUpsAsked, persist, skipped, step],
  );

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await recordAnswer(text, "text");
    } catch {
      toast.error("That didn't save. Try once more.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (step.kind === "contact") return;
    setBusy(true);
    try {
      if (step.kind === "followup") {
        const nextFollowUps = [...followUpsAsked, step.key];
        setFollowUpsAsked(nextFollowUps);
        await persist({ verbatim: answers, skipped, followUpsAsked: nextFollowUps });
      } else {
        const nextSkipped = [...skipped, step.key];
        setSkipped(nextSkipped);
        await persist({ verbatim: answers, skipped: nextSkipped, followUpsAsked });
      }
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function handleVoice(file: File) {
    if (step.kind === "contact") return;
    setTranscribing(true);
    try {
      const token = await ensureSession();
      const base64 = await fileToBase64(file);
      const key = step.kind === "followup" ? step.forKey : step.key;
      const result = (await transcribe({
        data: { resumeToken: token, questionKey: key, mimeType: file.type || "audio/webm", base64 },
      })) as { transcript: string; mediaRef: string };
      await recordAnswer(result.transcript, "voice", result.mediaRef);
    } catch {
      toast.error("I couldn't hear that clearly. Try again, or type it instead.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleFinish() {
    if (!email.trim()) {
      toast.error("An email address is the one thing I need.");
      return;
    }
    setBusy(true);
    try {
      const token = await ensureSession();
      await complete({
        data: {
          resumeToken: token,
          person: {
            name: name.trim() || null,
            email: email.trim(),
            phone: null,
            role: null,
          },
          company: { name: company.trim() || null, website: website.trim() || null },
          consent: {
            contact_ok: contactOk,
            marketing_ok: false,
            agreed_at: new Date().toISOString(),
          },
        },
      });
      try {
        window.localStorage.removeItem(RESUME_KEY);
      } catch {
        /* ignore */
      }
      setPhase("done");
    } catch {
      toast.error("Something went wrong sending that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const answeredCount = answers.filter((a) => !a.key.includes("__followup_")).length;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />

      <main>
        {phase === "intro" && (
          <section className="mx-auto max-w-3xl px-6 pb-24 pt-16 md:pt-24">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                Build my roadmap
              </p>
              <h1 className="mt-4 font-display text-4xl leading-[1.1] md:text-6xl">
                Tell me about your business.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
                This is a conversation, not a form. One question at a time, in plain
                language. Type or speak — whichever is easier. Skip anything you'd
                rather not answer. It takes about fifteen minutes, and you can stop
                and come back.
              </p>
              <button
                type="button"
                disabled={resuming}
                onClick={() => setPhase("conversation")}
                className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-sm uppercase tracking-[0.18em] text-cream transition hover:bg-royal disabled:opacity-60"
              >
                {answeredCount > 0 ? "Pick up where we left off" : "Start the conversation"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </Reveal>
            <img
              src={heroMountain.url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="mt-16 w-full rounded-lg opacity-90"
            />
          </section>
        )}

        {phase === "conversation" && (
          <section className="mx-auto max-w-3xl px-6 pb-24 pt-12 md:pt-16">
            <div className="mb-8">
              <div className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full bg-royal transition-all duration-500"
                  style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
                {answeredCount === 0 ? "Let's begin" : `${answeredCount} answered`}
              </p>
            </div>

            {step.kind === "contact" || wrapUp ? (
              <ContactBlock
                name={name}
                email={email}
                company={company}
                website={website}
                contactOk={contactOk}
                busy={busy}
                onChange={{ setName, setEmail, setCompany, setWebsite, setContactOk }}
                onFinish={handleFinish}
              />
            ) : (
              <div>
                <h2 className="font-display text-3xl leading-snug md:text-[2.6rem]">
                  {currentPrompt}
                </h2>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={7}
                  placeholder="Take your time. There's no right answer."
                  className="mt-8 w-full resize-y rounded-lg border border-ink/15 bg-white p-5 text-base leading-relaxed text-ink outline-none transition focus:border-royal"
                />

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={busy || transcribing || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm uppercase tracking-[0.16em] text-cream transition hover:bg-royal disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Continue
                  </button>

                  <VoiceRecorder disabled={busy || transcribing} onRecorded={handleVoice} />
                  {transcribing && (
                    <span className="inline-flex items-center gap-2 text-sm text-ink/60">
                      <Loader2 className="h-4 w-4 animate-spin" /> Listening back…
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={busy || transcribing}
                    className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-3 text-sm text-ink/60 transition hover:text-ink disabled:opacity-40"
                  >
                    <SkipForward className="h-4 w-4" /> Skip this one
                  </button>
                </div>

                {offerExit && (
                  <div className="mt-10 rounded-lg border border-royal/25 bg-royal/5 p-5">
                    <p className="text-base text-ink/80">{EARLY_EXIT_PROMPT}</p>
                    <button
                      type="button"
                      onClick={() => setWrapUp(true)}
                      className="mt-3 inline-flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-royal hover:underline"
                    >
                      Wrap up here <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {answers.length > 0 && (
                  <details className="mt-12 border-t border-ink/10 pt-6">
                    <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
                      What you've told me so far
                    </summary>
                    <ul className="mt-5 space-y-5">
                      {answers.map((a, i) => (
                        <li key={`${a.key}-${i}`}>
                          <p className="text-sm text-ink/50">{a.question}</p>
                          <p className="mt-1 whitespace-pre-wrap text-base text-ink/85">
                            {a.answer}
                          </p>
                          {a.modality === "voice" && (
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
                              Spoken
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <p className="sr-only" data-testid="coverage">
                  {coverage}
                </p>
              </div>
            )}
          </section>
        )}

        {phase === "done" && (
          <section className="mx-auto max-w-2xl px-6 pb-28 pt-20 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-royal/10">
              <Check className="h-6 w-6 text-royal" />
            </div>
            <h1 className="mt-8 font-display text-4xl">Thank you. I have it.</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink/75">
              I'll read every word of what you wrote, and come back to you at{" "}
              <span className="text-ink">{email}</span> with what I see. Look out for a
              short confirmation in your inbox in the meantime.
            </p>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function ContactBlock(props: {
  name: string;
  email: string;
  company: string;
  website: string;
  contactOk: boolean;
  busy: boolean;
  onChange: {
    setName: (v: string) => void;
    setEmail: (v: string) => void;
    setCompany: (v: string) => void;
    setWebsite: (v: string) => void;
    setContactOk: (v: boolean) => void;
  };
  onFinish: () => void;
}) {
  const { onChange } = props;
  return (
    <div>
      <h2 className="font-display text-3xl leading-snug md:text-[2.6rem]">{CONTACT_PROMPT}</h2>
      <p className="mt-4 text-base text-ink/65">
        Just enough to reach you. Nothing more.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field label="Your name" value={props.name} onChange={onChange.setName} />
        <Field
          label="Email"
          type="email"
          required
          value={props.email}
          onChange={onChange.setEmail}
        />
        <Field label="Business name" value={props.company} onChange={onChange.setCompany} />
        <Field label="Website" value={props.website} onChange={onChange.setWebsite} />
      </div>

      <label className="mt-6 flex items-start gap-3 text-sm text-ink/70">
        <input
          type="checkbox"
          checked={props.contactOk}
          onChange={(e) => onChange.setContactOk(e.target.checked)}
          className="mt-1"
        />
        You can reply to me about what I shared here.
      </label>

      <button
        type="button"
        onClick={props.onFinish}
        disabled={props.busy}
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-sm uppercase tracking-[0.16em] text-cream transition hover:bg-royal disabled:opacity-50"
      >
        {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Send it to Tai
      </button>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/45">
        {props.label}
        {props.required ? " *" : ""}
      </span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-ink/15 bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-royal"
      />
    </label>
  );
}
