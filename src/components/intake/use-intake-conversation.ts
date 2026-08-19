/**
 * The single source of conversation state for the Build My Roadmap room.
 *
 * Reuses the existing intake persistence path end to end: anonymous session
 * creation, autosave, voice transcription, and the verified Website → Scout
 * handoff at completion. Nothing here creates downstream delivery state.
 */

import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  completeIntakeSession,
  loadIntakeSession,
  saveIntakeProgress,
  startIntakeSession,
  transcribeIntakeVoiceAnswer,
} from "@/lib/website-intake.functions";
import { readAttribution } from "@/lib/website-intake/attribution";
import { trackEvent } from "@/lib/website-intake/track";
import {
  CONTACT_PROMPT,
  canOfferEarlyExit,
  completeness,
  nextStep,
  objectiveCoverage,
  type ConversationState,
} from "@/lib/website-intake/adaptive";
import { buildReflection, type ReflectionStatement } from "@/lib/website-intake/reflection";
import type { FollowUpKey, IntakeObjectiveKey } from "@/lib/website-intake/questions";
import type { VerbatimAnswer } from "@/lib/website-intake/types";

export const RESUME_KEY = "tt_intake_resume_v1";

/** Key used for the founder-confirmed reflection so Scout can tell it apart. */
export const CONFIRMED_REFLECTION_KEY = "founder_confirmed_reflection";

export type RoomPhase = "conversation" | "reflection" | "contact" | "done";
export type SaveState = "idle" | "saving" | "saved" | "error";

export type ContactDetails = {
  name: string;
  email: string;
  company: string;
  website: string;
  phone: string;
  researchOk: boolean;
};

export function useIntakeConversation() {
  const start = useServerFn(startIntakeSession);
  const load = useServerFn(loadIntakeSession);
  const save = useServerFn(saveIntakeProgress);
  const transcribe = useServerFn(transcribeIntakeVoiceAnswer);
  const complete = useServerFn(completeIntakeSession);

  const [resumeToken, setResumeToken] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<VerbatimAnswer[]>([]);
  const [skipped, setSkipped] = React.useState<IntakeObjectiveKey[]>([]);
  const [followUpsAsked, setFollowUpsAsked] = React.useState<FollowUpKey[]>([]);
  const [phase, setPhase] = React.useState<RoomPhase>("conversation");
  const [busy, setBusy] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [resuming, setResuming] = React.useState(false);
  const [keepTalking, setKeepTalking] = React.useState(false);
  const [reflection, setReflection] = React.useState<ReflectionStatement[]>([]);
  const [reflectionConfirmed, setReflectionConfirmed] = React.useState(false);
  const [delivered, setDelivered] = React.useState<boolean | null>(null);

  const state: ConversationState = React.useMemo(
    () => ({ answers, skipped, followUpsAsked }),
    [answers, skipped, followUpsAsked],
  );
  const step = React.useMemo(() => nextStep(state), [state]);
  const coverage = React.useMemo(() => objectiveCoverage(state), [state]);
  const progress = React.useMemo(() => completeness(state), [state]);
  const offerExit = React.useMemo(() => canOfferEarlyExit(state), [state]);

  const answeredCount = answers.filter(
    (a) => !a.key.includes("__followup_") && a.key !== CONFIRMED_REFLECTION_KEY,
  ).length;
  const hasProgress = answeredCount > 0;

  /** Restore anything left behind in this browser. */
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
        trackEvent({ name: "intake_resumed", dedupe: "resumed" });
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
    trackEvent({ name: "intake_started", dedupe: "started" });
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
      setSaveState("saving");
      try {
        const token = await ensureSession();
        await save({
          data: {
            resumeToken: token,
            verbatim: next.verbatim,
            skipped: next.skipped,
            followUpsAsked: next.followUpsAsked,
          },
        });
        setSaveState("saved");
      } catch (err) {
        // The answer stays in memory — nothing the founder said is lost.
        setSaveState("error");
        throw err;
      }
    },
    [ensureSession, save],
  );

  const currentPrompt = step.kind === "contact" ? CONTACT_PROMPT : step.prompt;

  const submitAnswer = React.useCallback(
    async (text: string, modality: "text" | "voice", mediaRef?: string | null) => {
      const trimmed = text.trim();
      if (!trimmed || step.kind === "contact") return;
      setBusy(true);
      setThinking(true);
      const key =
        step.kind === "followup"
          ? (`${step.forKey}__followup_${step.key}` as VerbatimAnswer["key"])
          : step.key;
      const answer: VerbatimAnswer = {
        key,
        question: currentPrompt,
        answer: trimmed,
        modality,
        media_ref: mediaRef ?? null,
        answered_at: new Date().toISOString(),
      };
      const nextAnswers = [...answers, answer];
      const nextFollowUps =
        step.kind === "followup" ? [...followUpsAsked, step.key] : followUpsAsked;
      setAnswers(nextAnswers);
      setFollowUpsAsked(nextFollowUps);
      setKeepTalking(false);
      try {
        await persist({ verbatim: nextAnswers, skipped, followUpsAsked: nextFollowUps });
        trackEvent({
          name: "intake_answered",
          dedupe: `${key}:${answer.answered_at}`,
          properties: { question_id: key, question_text: currentPrompt, modality },
        });
      } catch {
        /* surfaced through saveState */
      } finally {
        setBusy(false);
        setThinking(false);
      }
    },
    [answers, currentPrompt, followUpsAsked, persist, skipped, step],
  );

  const skipCurrent = React.useCallback(async () => {
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
    } catch {
      /* surfaced through saveState */
    } finally {
      setBusy(false);
    }
  }, [answers, followUpsAsked, persist, skipped, step]);

  const transcribeVoice = React.useCallback(
    async (file: File) => {
      const token = await ensureSession();
      const base64 = await fileToBase64(file);
      const key = step.kind === "followup" ? step.forKey : step.kind === "question" ? step.key : "contact";
      return (await transcribe({
        data: {
          resumeToken: token,
          questionKey: key,
          mimeType: file.type || "audio/webm",
          base64,
        },
      })) as { transcript: string; mediaRef: string };
    },
    [ensureSession, step, transcribe],
  );

  /** Move from conversation into the reflection state, in the same room. */
  const openReflection = React.useCallback(() => {
    setReflection(buildReflection(answers));
    setReflectionConfirmed(false);
    setPhase("reflection");
  }, [answers]);

  const regenerateReflection = React.useCallback(
    (extra: VerbatimAnswer[] = []) => {
      setReflection(buildReflection([...answers, ...extra]));
    },
    [answers],
  );

  const confirmReflection = React.useCallback(async () => {
    const text = reflection.map((r) => `${r.label}: ${r.text}`).join("\n");
    if (!text) {
      setReflectionConfirmed(true);
      setPhase("contact");
      return;
    }
    const record: VerbatimAnswer = {
      key: CONFIRMED_REFLECTION_KEY as VerbatimAnswer["key"],
      question: "Let me make sure I understood you. (Confirmed by the founder)",
      answer: text,
      modality: "text",
      media_ref: null,
      answered_at: new Date().toISOString(),
    };
    const next = [...answers.filter((a) => a.key !== CONFIRMED_REFLECTION_KEY), record];
    setAnswers(next);
    setReflectionConfirmed(true);
    setPhase("contact");
    try {
      await persist({ verbatim: next, skipped, followUpsAsked });
    } catch {
      /* retained locally; surfaced through saveState */
    }
  }, [answers, followUpsAsked, persist, reflection, skipped]);

  const submitContact = React.useCallback(
    async (contact: ContactDetails) => {
      setBusy(true);
      try {
        const token = await ensureSession();
        const result = (await complete({
          data: {
            resumeToken: token,
            person: {
              name: contact.name.trim() || null,
              email: contact.email.trim(),
              phone: contact.phone.trim() || null,
              role: null,
            },
            company: {
              name: contact.company.trim() || null,
              website: contact.website.trim() || null,
            },
            consent: {
              contact_ok: true,
              marketing_ok: contact.researchOk,
              agreed_at: new Date().toISOString(),
            },
          },
        })) as { received: boolean; delivered: boolean };
        try {
          window.localStorage.removeItem(RESUME_KEY);
        } catch {
          /* ignore */
        }
        trackEvent({ name: "intake_submitted", dedupe: "submitted" });
        setDelivered(result?.delivered ?? null);
        setPhase("done");
        return true;
      } catch {
        setSaveState("error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [complete, ensureSession],
  );

  return {
    answers,
    step,
    currentPrompt,
    coverage,
    progress,
    offerExit,
    answeredCount,
    hasProgress,
    busy,
    thinking,
    saveState,
    resuming,
    phase,
    setPhase,
    keepTalking,
    setKeepTalking,
    reflection,
    reflectionConfirmed,
    delivered,
    submitAnswer,
    skipCurrent,
    transcribeVoice,
    openReflection,
    regenerateReflection,
    confirmReflection,
    submitContact,
  };
}

export type IntakeConversation = ReturnType<typeof useIntakeConversation>;

export function fileToBase64(file: File): Promise<string> {
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
