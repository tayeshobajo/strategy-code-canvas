/**
 * The adaptive roadmap intake — /build-my-roadmap/write
 *
 * Stage 1 of the paradigm from THE_ADAPTIVE_ROADMAP_INTAKE_v2.
 *
 * Shape:
 *   1. Open first question, no numbered progress. "We are finding your starting point."
 *   2. On answer submit → classify the frame, show one confirmation line.
 *   3. Iterate anchor questions for the frame's objective set until the
 *      required objectives are met or the hard cap is hit, then review.
 *   4. Review → contact details → send to Trust Tai.
 *
 * Autosave: every answer round-trips through `saveDraft` (existing server fn)
 * with a resume_token stored in localStorage.
 *
 * Submit: uses existing `submitIntake` server fn. Frame + confirmation are
 * carried as `_frame` and `_open` answer entries so no schema migration is
 * needed for Stage 1. The engine intake-bridge can read them from `answers`.
 *
 * The stopping rule, the anchor library, and the classifier are the reliability
 * floor. Generative next-question and completeness scoring are Stage 2.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Loader2, Pencil } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FRAME_DEFINITIONS,
  getFrame,
  HARD_CAP_QUESTIONS,
  type FrameDefinition,
  type IntakeFrame,
  type IntakeObjective,
} from "@/lib/intake-frames";

const STORAGE_KEY = "tt:intake:write:token:v1";
const OPEN_KEY = "_open"; // stable answers[] key for the first open answer
const FRAME_KEY = "_frame"; // stable answers[] key for the confirmed frame

export const Route = createFileRoute("/build-my-roadmap/write")({
  head: () => {
    const title = "Build my roadmap | Trust Tai";
    const description =
      "A conversation with the roadmap engine. One question at a time, in your own words. We are finding your starting point.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://trusttai.com/build-my-roadmap/write" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [{ rel: "canonical", href: "https://trusttai.com/build-my-roadmap/write" }],
    };
  },
  component: WriteIntakeRoute,
});

/* ---------- Types ---------- */

type AnswerRow = {
  key: string;
  question: string;
  response: string;
  reflected_offered: string | null;
};

type ContactFields = {
  name: string;
  business: string;
  website: string;
  email: string;
  role: string;
  timeline: string;
  decision_makers: string;
  reply_preference: string;
};

const EMPTY_CONTACT: ContactFields = {
  name: "",
  business: "",
  website: "",
  email: "",
  role: "",
  timeline: "",
  decision_makers: "",
  reply_preference: "",
};

type Phase =
  | "open"
  | "confirm-frame"
  | "reclassify"
  | "objectives"
  | "not-a-fit"
  | "contact"
  | "review"
  | "submitted";

/* ---------- Root ---------- */

function WriteIntakeRoute() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <WriteIntake />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------- Main experience ---------- */

function WriteIntake() {
  const [phase, setPhase] = React.useState<Phase>("open");
  const [resumeToken, setResumeToken] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, AnswerRow>>({});
  const [contact, setContact] = React.useState<ContactFields>(EMPTY_CONTACT);
  const [authorizesScan, setAuthorizesScan] = React.useState(false);

  // Frame state
  const [frame, setFrame] = React.useState<IntakeFrame | null>(null);
  const [frameLabel, setFrameLabel] = React.useState<string>("");
  const [classifying, setClassifying] = React.useState(false);

  // Objective walk
  const [objectiveIdx, setObjectiveIdx] = React.useState(0);

  // Submit state
  const [submitting, setSubmitting] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");

  // ---------- Restore prior draft on mount ----------
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (!token) return;
        const mod = await import("@/lib/intake.functions");
        const res = await mod.loadDraft({ data: { resume_token: token } });
        if (cancelled) return;
        if (!res.found) return;

        setResumeToken(token);

        // Rebuild answer map
        const map: Record<string, AnswerRow> = {};
        for (const a of res.answers) {
          map[a.key] = {
            key: a.key,
            question: a.question,
            response: a.response,
            reflected_offered: a.reflected_offered,
          };
        }
        setAnswers(map);
        setContact({ ...EMPTY_CONTACT, ...(res.contact as Partial<ContactFields>) });

        // Restore frame if the draft carried it
        const frameRow = map[FRAME_KEY];
        if (frameRow?.response) {
          try {
            const parsed = JSON.parse(frameRow.response) as { frame: IntakeFrame; label: string };
            if (parsed.frame && FRAME_DEFINITIONS[parsed.frame]) {
              setFrame(parsed.frame);
              setFrameLabel(parsed.label || FRAME_DEFINITIONS[parsed.frame].label);
              if (parsed.frame === "not_a_fit") {
                setPhase("not-a-fit");
              } else {
                // Determine next objective index by first unmet.
                const def = getFrame(parsed.frame);
                const firstUnmet = def.objectives.findIndex((o) => !map[o.key]?.response);
                setObjectiveIdx(firstUnmet === -1 ? def.objectives.length : firstUnmet);
                setPhase(firstUnmet === -1 ? "contact" : "objectives");
              }
              return;
            }
          } catch {
            /* fall through */
          }
        }
        if (map[OPEN_KEY]?.response) {
          setPhase("confirm-frame");
        }
      } catch (err) {
        console.warn("[intake/write] restore failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Autosave (debounced) ----------
  const persist = React.useCallback(
    async (next: {
      answers: Record<string, AnswerRow>;
      contact: ContactFields;
      tokenOverride?: string | null;
    }) => {
      try {
        setSaveStatus("saving");
        const mod = await import("@/lib/intake.functions");
        const list = Object.values(next.answers).map((a) => ({
          key: a.key,
          question: a.question,
          response: a.response,
          reflected_offered: a.reflected_offered,
        }));
        const token = next.tokenOverride ?? resumeToken ?? undefined;
        const res = await mod.saveDraft({
          data: { resume_token: token, answers: list, contact: next.contact },
        });
        if (!resumeToken && res?.resume_token) {
          setResumeToken(res.resume_token);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, res.resume_token);
          }
        }
        setSaveStatus("saved");
      } catch (err) {
        console.warn("[intake/write] autosave failed", err);
        setSaveStatus("idle");
      }
    },
    [resumeToken],
  );

  const saveTimer = React.useRef<number | null>(null);
  const scheduleSave = React.useCallback(
    (next: { answers: Record<string, AnswerRow>; contact: ContactFields }) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 700);
    },
    [persist],
  );

  const upsertAnswer = React.useCallback(
    (row: AnswerRow) => {
      setAnswers((prev) => {
        const next = { ...prev, [row.key]: row };
        scheduleSave({ answers: next, contact });
        return next;
      });
    },
    [contact, scheduleSave],
  );

  const updateContact = React.useCallback(
    (patch: Partial<ContactFields>) => {
      setContact((prev) => {
        const next = { ...prev, ...patch };
        scheduleSave({ answers, contact: next });
        return next;
      });
    },
    [answers, scheduleSave],
  );

  // ---------- First open answer ----------
  const handleOpenSubmit = React.useCallback(
    async (openText: string) => {
      const text = openText.trim();
      if (!text) return;

      // Persist the open answer first (this also mints the resume_token).
      const row: AnswerRow = {
        key: OPEN_KEY,
        question: "Tell us what you are trying to build, fix, launch, or improve.",
        response: text,
        reflected_offered: null,
      };
      const nextAnswers = { ...answers, [OPEN_KEY]: row };
      setAnswers(nextAnswers);
      await persist({ answers: nextAnswers, contact });

      // Classify. If it fails (network etc.), fall back client-side to a
      // safe default. The server has its own fallback too.
      try {
        setClassifying(true);
        // Wait one tick so the token from persist() is in state.
        const token =
          resumeToken ??
          (typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null);
        if (!token) throw new Error("No resume_token after save");
        const mod = await import("@/lib/intake-classify.functions");
        const res = await mod.classifyIntakeFrame({
          data: { resume_token: token, open_answer: text },
        });
        setFrame(res.frame);
        setFrameLabel(res.label);
        setPhase("confirm-frame");
      } catch (err) {
        console.warn("[intake/write] classify failed", err);
        // Silent fallback to generic project so the person never sees a dead end.
        setFrame("project.generic");
        setFrameLabel(FRAME_DEFINITIONS["project.generic"].label);
        setPhase("confirm-frame");
      } finally {
        setClassifying(false);
      }
    },
    [answers, contact, persist, resumeToken],
  );

  const commitFrame = React.useCallback(
    (f: IntakeFrame, label: string) => {
      setFrame(f);
      setFrameLabel(label);
      const row: AnswerRow = {
        key: FRAME_KEY,
        question: "Confirmed frame",
        response: JSON.stringify({ frame: f, label }),
        reflected_offered: null,
      };
      upsertAnswer(row);
      if (f === "not_a_fit") {
        setPhase("not-a-fit");
      } else {
        setObjectiveIdx(0);
        setPhase("objectives");
      }
    },
    [upsertAnswer],
  );

  const handleFrameConfirmed = React.useCallback(() => {
    if (!frame) return;
    commitFrame(frame, frameLabel);
  }, [commitFrame, frame, frameLabel]);

  const handleFrameCorrected = React.useCallback(
    async (correction: string) => {
      const text = correction.trim();
      if (!text) return;
      // Store the correction as its own answer for the review screen.
      const row: AnswerRow = {
        key: "_frame_correction",
        question: "What would you call this in your own words.",
        response: text,
        reflected_offered: null,
      };
      const nextAnswers = { ...answers, [row.key]: row };
      setAnswers(nextAnswers);
      await persist({ answers: nextAnswers, contact });

      try {
        setClassifying(true);
        const token = resumeToken;
        if (!token) throw new Error("No resume_token");
        const openText = answers[OPEN_KEY]?.response ?? "";
        const mod = await import("@/lib/intake-classify.functions");
        // Feed both the original open answer and the correction so the model
        // uses the person's own label to disambiguate.
        const res = await mod.classifyIntakeFrame({
          data: {
            resume_token: token,
            open_answer: `${openText}\n\nWhat I would call this: ${text}`,
          },
        });
        setFrame(res.frame);
        setFrameLabel(res.label);
        setPhase("confirm-frame");
      } catch (err) {
        console.warn("[intake/write] reclassify failed", err);
        setFrame("project.generic");
        setFrameLabel(FRAME_DEFINITIONS["project.generic"].label);
        setPhase("confirm-frame");
      } finally {
        setClassifying(false);
      }
    },
    [answers, contact, persist, resumeToken],
  );

  const activeFrameDef: FrameDefinition | null = frame ? getFrame(frame) : null;

  // Advance through the objective list. We do not skip past answered ones on
  // Next, but the walker naturally moves forward. The review screen lets the
  // person come back and edit anything.
  const goNextObjective = React.useCallback(() => {
    if (!activeFrameDef) return;
    const next = objectiveIdx + 1;
    const answeredCount = Object.keys(answers).filter(
      (k) => activeFrameDef.objectives.some((o) => o.key === k) && answers[k]?.response.trim(),
    ).length;
    if (next >= activeFrameDef.objectives.length || answeredCount + 1 >= HARD_CAP_QUESTIONS) {
      setPhase("contact");
      return;
    }
    setObjectiveIdx(next);
  }, [activeFrameDef, answers, objectiveIdx]);

  const goPrevObjective = React.useCallback(() => {
    if (objectiveIdx > 0) {
      setObjectiveIdx(objectiveIdx - 1);
    } else {
      setPhase("confirm-frame");
    }
  }, [objectiveIdx]);

  // ---------- Submit ----------
  const handleSubmit = React.useCallback(async () => {
    if (submitting) return;
    if (!contact.name.trim() || !contact.email.trim()) {
      toast.error("Add your name and email so we can send this to Trust Tai.");
      setPhase("contact");
      return;
    }
    try {
      setSubmitting(true);
      const mod = await import("@/lib/intake.functions");
      // Filter to non-empty answers, ordered by frame objectives then extras.
      const orderedKeys: string[] = [];
      orderedKeys.push(OPEN_KEY);
      if (answers[FRAME_KEY]) orderedKeys.push(FRAME_KEY);
      if (answers["_frame_correction"]) orderedKeys.push("_frame_correction");
      if (activeFrameDef) {
        for (const o of activeFrameDef.objectives) {
          if (answers[o.key]?.response.trim()) orderedKeys.push(o.key);
        }
      }
      const seen = new Set(orderedKeys);
      for (const k of Object.keys(answers)) {
        if (!seen.has(k) && answers[k]?.response.trim()) orderedKeys.push(k);
      }
      const list = orderedKeys
        .map((k) => answers[k])
        .filter(Boolean)
        .map((a) => ({
          key: a.key,
          question: a.question,
          response: a.response,
          reflected_offered: a.reflected_offered,
        }));

      await mod.submitIntake({
        data: {
          name: contact.name,
          business: contact.business,
          website: contact.website,
          email: contact.email,
          authorizes_scan: authorizesScan,
          role: contact.role,
          timeline: contact.timeline,
          decision_makers: contact.decision_makers,
          reply_preference: contact.reply_preference,
          answers: list,
          resume_token: resumeToken ?? undefined,
        },
      });

      // Clear the local token so a return visit begins fresh.
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
      setPhase("submitted");
    } catch (err) {
      console.error("[intake/write] submit failed", err);
      toast.error("We could not send that. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }, [activeFrameDef, answers, authorizesScan, contact, resumeToken, submitting]);

  /* ---------- Render ---------- */

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
      <IntakeHeader phase={phase} saveStatus={saveStatus} />

      {phase === "open" && (
        <OpenScreen classifying={classifying} initial={answers[OPEN_KEY]?.response ?? ""} onSubmit={handleOpenSubmit} />
      )}

      {phase === "confirm-frame" && frame && (
        <ConfirmFrameScreen
          label={frameLabel || FRAME_DEFINITIONS[frame].label}
          confirmSuffix={FRAME_DEFINITIONS[frame].confirmSuffix}
          onYes={handleFrameConfirmed}
          onNotQuite={() => setPhase("reclassify")}
          onNotSure={() => setPhase("reclassify")}
        />
      )}

      {phase === "reclassify" && (
        <ReclassifyScreen
          classifying={classifying}
          initial={answers["_frame_correction"]?.response ?? ""}
          onSubmit={handleFrameCorrected}
          onBack={() => setPhase("confirm-frame")}
        />
      )}

      {phase === "objectives" && activeFrameDef && (
        <ObjectiveScreen
          frameDef={activeFrameDef}
          objective={activeFrameDef.objectives[objectiveIdx]}
          value={answers[activeFrameDef.objectives[objectiveIdx].key]?.response ?? ""}
          onChange={(v) => {
            const q = activeFrameDef.objectives[objectiveIdx];
            upsertAnswer({
              key: q.key,
              question: q.anchor,
              response: v,
              reflected_offered: null,
            });
          }}
          onNext={goNextObjective}
          onPrev={goPrevObjective}
          onSkip={goNextObjective}
          onReview={() => setPhase("review")}
          answeredCount={
            activeFrameDef.objectives.filter((o) => answers[o.key]?.response.trim()).length
          }
        />
      )}

      {phase === "not-a-fit" && (
        <NotAFitScreen
          onReconsider={() => {
            // Reopen the frame confirmation as generic project.
            commitFrame("project.generic", FRAME_DEFINITIONS["project.generic"].label);
          }}
        />
      )}

      {phase === "contact" && activeFrameDef && (
        <ContactScreen
          contact={contact}
          onChange={updateContact}
          authorizesScan={authorizesScan}
          onAuthorizesScan={setAuthorizesScan}
          onBack={() => setPhase("objectives")}
          onReview={() => setPhase("review")}
        />
      )}

      {phase === "review" && activeFrameDef && (
        <ReviewScreen
          frameDef={activeFrameDef}
          answers={answers}
          contact={contact}
          openAnswer={answers[OPEN_KEY]?.response ?? ""}
          onEditObjective={(idx) => {
            setObjectiveIdx(idx);
            setPhase("objectives");
          }}
          onEditContact={() => setPhase("contact")}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {phase === "submitted" && <SubmittedScreen />}
    </div>
  );
}

/* ---------- Header (progress language) ---------- */

function IntakeHeader({ phase, saveStatus }: { phase: Phase; saveStatus: "idle" | "saving" | "saved" }) {
  const line = React.useMemo(() => {
    switch (phase) {
      case "open":
        return "We are finding your starting point.";
      case "confirm-frame":
        return "One quick read, then we continue.";
      case "reclassify":
        return "In your own words.";
      case "objectives":
        return "One question at a time.";
      case "not-a-fit":
        return "An honest read.";
      case "contact":
        return "So we can send this back to you.";
      case "review":
        return "Here is what we understood.";
      case "submitted":
        return "Sent to Trust Tai.";
    }
  }, [phase]);

  return (
    <div className="mb-10 flex items-start justify-between gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trust Tai</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight text-foreground sm:text-4xl">{line}</h1>
      </div>
      {phase !== "open" && phase !== "submitted" && (
        <div className="mt-1 text-xs text-muted-foreground">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> saving</span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> saved</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Open screen ---------- */

function OpenScreen({
  initial,
  classifying,
  onSubmit,
}: {
  initial: string;
  classifying: boolean;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <section className="space-y-6">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        Tell us what you are trying to build, fix, launch, or improve.
      </p>
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="In your own words. Messy is fine."
        className="min-h-[160px] text-base"
      />
      <p className="text-sm text-muted-foreground">
        Your words are preserved exactly as written. Nothing is cleaned or replaced without you.
      </p>
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => onSubmit(text)}
          disabled={!text.trim() || classifying}
          className="gap-2"
        >
          {classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Continue
        </Button>
      </div>
    </section>
  );
}

/* ---------- Confirm-frame screen ---------- */

function ConfirmFrameScreen({
  label,
  confirmSuffix,
  onYes,
  onNotQuite,
  onNotSure,
}: {
  label: string;
  confirmSuffix: string;
  onYes: () => void;
  onNotQuite: () => void;
  onNotSure: () => void;
}) {
  return (
    <section className="space-y-8">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        This sounds like {label}. {confirmSuffix ? `${confirmSuffix.charAt(0).toUpperCase()}${confirmSuffix.slice(1)}.` : ""} Is that right?
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onYes} className="gap-2">
          Yes, continue <ArrowRight className="h-4 w-4" />
        </Button>
        <Button size="lg" variant="secondary" onClick={onNotQuite}>
          Not quite
        </Button>
        <Button size="lg" variant="ghost" onClick={onNotSure}>
          I am not sure
        </Button>
      </div>
    </section>
  );
}

/* ---------- Reclassify screen ---------- */

function ReclassifyScreen({
  initial,
  classifying,
  onSubmit,
  onBack,
}: {
  initial: string;
  classifying: boolean;
  onSubmit: (text: string) => void | Promise<void>;
  onBack: () => void;
}) {
  const [text, setText] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <section className="space-y-6">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        What would you call this in your own words?
      </p>
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="A line or two is enough."
      />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={() => onSubmit(text)} disabled={!text.trim() || classifying} className="gap-2">
          {classifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Read again
        </Button>
      </div>
    </section>
  );
}

/* ---------- Objective (anchor question) screen ---------- */

function ObjectiveScreen({
  frameDef,
  objective,
  value,
  answeredCount,
  onChange,
  onNext,
  onPrev,
  onSkip,
  onReview,
}: {
  frameDef: FrameDefinition;
  objective: IntakeObjective;
  value: string;
  answeredCount: number;
  onChange: (v: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onReview: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, [objective.key]);

  const required = frameDef.objectives.filter((o) => o.required);
  const requiredMet = required.every((o) => o.key === objective.key ? value.trim() : true);
  const canReview =
    required.filter((o) => o.key !== objective.key).every((o) => o) && answeredCount >= required.length;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{frameDef.label}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {objective.label}{objective.required ? "" : ", if it helps"}
        </p>
      </div>
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">{objective.anchor}</p>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="In your own words."
        className="min-h-[140px] text-base"
      />
      <ObjectiveDots frameDef={frameDef} currentKey={objective.key} answeredKeys={Object.keys({ [objective.key]: value.trim() })} filledAnswers={value.trim()} />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {!objective.required && (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          )}
          {canReview && (
            <Button variant="secondary" onClick={onReview}>
              Go to review
            </Button>
          )}
          <Button onClick={onNext} disabled={objective.required && !requiredMet} className="gap-2">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function ObjectiveDots({
  frameDef,
  currentKey,
}: {
  frameDef: FrameDefinition;
  currentKey: string;
  answeredKeys?: Record<string, boolean> | string[];
  filledAnswers?: string;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {frameDef.objectives.map((o) => {
        const active = o.key === currentKey;
        return (
          <span
            key={o.key}
            className={`h-1.5 rounded-full transition-all ${active ? "w-6 bg-foreground" : "w-1.5 bg-foreground/25"}`}
          />
        );
      })}
    </div>
  );
}

/* ---------- Not-a-fit screen ---------- */

function NotAFitScreen({ onReconsider }: { onReconsider: () => void }) {
  return (
    <section className="space-y-6">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        From what you wrote, this may sit outside what we do best.
      </p>
      <p className="text-base text-muted-foreground">
        We map roadmaps for founder-led businesses and build scoped projects with a plan in front of them. If
        the fit is cheapest-first, or execution without a map, another builder will treat you better than we can.
      </p>
      <p className="text-base text-foreground">
        If we read that wrong, tell us and we will read again.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onReconsider}>
          That is not what I meant
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">Back to Trust Tai</Link>
        </Button>
      </div>
    </section>
  );
}

/* ---------- Contact screen ---------- */

function ContactScreen({
  contact,
  onChange,
  authorizesScan,
  onAuthorizesScan,
  onBack,
  onReview,
}: {
  contact: ContactFields;
  onChange: (patch: Partial<ContactFields>) => void;
  authorizesScan: boolean;
  onAuthorizesScan: (v: boolean) => void;
  onBack: () => void;
  onReview: () => void;
}) {
  const ok = contact.name.trim().length > 0 && /.+@.+\..+/.test(contact.email.trim());
  return (
    <section className="space-y-8">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        So we can send this back to you.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={contact.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={contact.email} onChange={(e) => onChange({ email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business">Business</Label>
          <Input id="business" value={contact.business} onChange={(e) => onChange({ business: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website, if you have one</Label>
          <Input id="website" value={contact.website} onChange={(e) => onChange({ website: e.target.value })} placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Your role</Label>
          <Input id="role" value={contact.role} onChange={(e) => onChange({ role: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timeline">Timeline</Label>
          <Input id="timeline" value={contact.timeline} onChange={(e) => onChange({ timeline: e.target.value })} placeholder="Rough is fine" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="decision_makers">Who else decides with you</Label>
          <Input
            id="decision_makers"
            value={contact.decision_makers}
            onChange={(e) => onChange({ decision_makers: e.target.value })}
          />
        </div>
      </div>

      {contact.website.trim() && (
        <label className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/30 p-4 text-sm">
          <Checkbox
            checked={authorizesScan}
            onCheckedChange={(v) => onAuthorizesScan(v === true)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            You may read my site before we speak. This is only for the read, not for outbound follow-up.
          </span>
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={onReview} disabled={!ok} className="gap-2">
          Review <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

/* ---------- Review screen ---------- */

function ReviewScreen({
  frameDef,
  answers,
  contact,
  openAnswer,
  onEditObjective,
  onEditContact,
  onSubmit,
  submitting,
}: {
  frameDef: FrameDefinition;
  answers: Record<string, AnswerRow>;
  contact: ContactFields;
  openAnswer: string;
  onEditObjective: (idx: number) => void;
  onEditContact: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const understood = frameDef.objectives
    .map((o, idx) => ({ o, idx, response: answers[o.key]?.response.trim() ?? "" }))
    .filter((r) => r.response);
  const open = frameDef.objectives
    .map((o, idx) => ({ o, idx, response: answers[o.key]?.response.trim() ?? "" }))
    .filter((r) => !r.response);

  return (
    <section className="space-y-10">
      <p className="text-base text-muted-foreground">
        Here is what we understood. Here is what we will explore together. Here is what we will use to prepare
        your roadmap. Correct anything that reads wrong.
      </p>

      <Panel title="Your opening" onEdit={undefined}>
        <blockquote className="whitespace-pre-wrap border-l-2 border-foreground/30 pl-4 font-serif text-lg leading-snug text-foreground">
          {openAnswer || "(no opening on file)"}
        </blockquote>
      </Panel>

      <Panel title={`We understood this as ${frameDef.label}`} onEdit={undefined}>
        <p className="text-sm text-muted-foreground">
          If that read is off, use Back to change it before sending.
        </p>
      </Panel>

      <Panel title="Here is what we understood" onEdit={undefined}>
        {understood.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing captured yet.</p>
        ) : (
          <ul className="space-y-4">
            {understood.map(({ o, idx, response }) => (
              <li key={o.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{o.label}</p>
                  <button
                    type="button"
                    onClick={() => onEditObjective(idx)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> edit
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-base text-foreground">{response}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {open.length > 0 && (
        <Panel title="What we will explore together" onEdit={undefined}>
          <ul className="space-y-2">
            {open.map(({ o, idx }) => (
              <li key={o.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{o.label}</span>
                <button
                  type="button"
                  onClick={() => onEditObjective(idx)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Pencil className="h-3 w-3" /> add
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="How we will reach you" onEdit={onEditContact}>
        <dl className="grid gap-2 text-sm">
          <ReviewRow label="Name" value={contact.name} />
          <ReviewRow label="Email" value={contact.email} />
          {contact.business && <ReviewRow label="Business" value={contact.business} />}
          {contact.website && <ReviewRow label="Website" value={contact.website} />}
          {contact.role && <ReviewRow label="Role" value={contact.role} />}
          {contact.timeline && <ReviewRow label="Timeline" value={contact.timeline} />}
          {contact.decision_makers && <ReviewRow label="Also decides" value={contact.decision_makers} />}
        </dl>
      </Panel>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-sm text-muted-foreground">A person reads every word before anything is drafted.</p>
        <Button onClick={onSubmit} disabled={submitting} size="lg" className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Send this to Trust Tai
        </Button>
      </div>
    </section>
  );
}

function Panel({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-foreground">{title}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Pencil className="h-3 w-3" /> edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[9rem_1fr] items-baseline gap-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

/* ---------- Submitted screen ---------- */

function SubmittedScreen() {
  return (
    <section className="space-y-6">
      <p className="font-serif text-2xl leading-snug text-foreground sm:text-3xl">
        Sent. A person will read this before anything is drafted.
      </p>
      <p className="text-base text-muted-foreground">
        You will hear back from Trust Tai. Nothing you shared is used elsewhere.
      </p>
      <div className="pt-2">
        <Button asChild variant="secondary">
          <Link to="/">Back to Trust Tai</Link>
        </Button>
      </div>
    </section>
  );
}
