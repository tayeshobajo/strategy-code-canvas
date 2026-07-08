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

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, FileText, Link2, Loader2, Paperclip, Pencil, ShieldCheck, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { StoredIntakeSource } from "@/lib/intake-sources.functions";
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
import {
  computeObjectiveScores,
  selectNextObjective,
  scoreAnswer,
  OBJECTIVE_BAR,
} from "@/lib/intake-scoring";
import { heuristicExtract } from "@/lib/intake/heuristic-extract";
/** Same threshold the server classifier uses. Duplicated here to keep
 * the classifier module out of the client bundle for a single constant. */
const HIGH_CONFIDENCE_BAR = 70;

const STORAGE_KEY = "tt:intake:write:token:v1";
const OPEN_KEY = "_open"; // stable answers[] key for the first open answer
const FRAME_KEY = "_frame"; // stable answers[] key for the confirmed frame
const SCORES_KEY = "_scores"; // hidden: per-objective 0-100 confidence
const ASKED_KEY = "_asked"; // hidden: which objective keys have been asked
const INTERNAL_KEYS = new Set([OPEN_KEY, FRAME_KEY, SCORES_KEY, ASKED_KEY, "_frame_correction"]);

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
  | "clarify"
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
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>("open");
  const [resumeToken, setResumeToken] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, AnswerRow>>({});
  const [attachments, setAttachments] = React.useState<
    Array<{ storage_path: string; filename: string; size: number; mime: string | null }>
  >([]);
  // External sources (transcripts, notes, URLs). Treated as data-only
  // evidence. Written through server fns; the browser never persists them.
  const [sources, setSources] = React.useState<StoredIntakeSource[]>([]);
  const [contact, setContact] = React.useState<ContactFields>(EMPTY_CONTACT);
  const [authorizesScan, setAuthorizesScan] = React.useState(false);

  // Frame state
  const [frame, setFrame] = React.useState<IntakeFrame | null>(null);
  const [frameLabel, setFrameLabel] = React.useState<string>("");
  const [frameConfirmationCopy, setFrameConfirmationCopy] = React.useState<string>("");
  const [clarifyingQuestion, setClarifyingQuestion] = React.useState<string>("");
  const [classifying, setClassifying] = React.useState(false);

  // Hidden objective model. Scores are 0-100. askedKeys tracks what has
  // been asked at least once so we do not loop the same question. Neither is
  // ever rendered to the client.
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [askedKeys, setAskedKeys] = React.useState<string[]>([]);
  const [currentObjective, setCurrentObjective] = React.useState<IntakeObjective | null>(null);
  const [scoringNext, setScoringNext] = React.useState(false);
  // Generated wording for the current anchor question. The completeness
  // model still picks the objective; AI only rewrites its anchor. On any
  // failure we render the anchor verbatim — never surface an error.
  const [generatedQuestion, setGeneratedQuestion] = React.useState<string | null>(null);
  const [generatingQuestion, setGeneratingQuestion] = React.useState(false);

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
        if (Array.isArray(res.attachments)) setAttachments(res.attachments);
        if (Array.isArray(res.sources)) setSources(res.sources as StoredIntakeSource[]);


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
                const def = getFrame(parsed.frame);
                // Restore hidden scores + asked list if present, else recompute.
                let restoredScores: Record<string, number> = {};
                try {
                  const stored = map[SCORES_KEY]?.response;
                  if (stored) restoredScores = JSON.parse(stored) as Record<string, number>;
                } catch {
                  /* recompute below */
                }
                if (Object.keys(restoredScores).length === 0) {
                  restoredScores = computeObjectiveScores(parsed.frame, map);
                }
                let restoredAsked: string[] = [];
                try {
                  const stored = map[ASKED_KEY]?.response;
                  if (stored) restoredAsked = JSON.parse(stored) as string[];
                } catch {
                  /* fall through */
                }
                if (restoredAsked.length === 0) {
                  restoredAsked = def.objectives
                    .filter((o) => (map[o.key]?.response ?? "").trim())
                    .map((o) => o.key);
                }
                setScores(restoredScores);
                setAskedKeys(restoredAsked);
                const next = selectNextObjective(parsed.frame, restoredScores, new Set(restoredAsked));
                if (!next || restoredAsked.length >= HARD_CAP_QUESTIONS) {
                  setCurrentObjective(null);
                  setPhase("contact");
                } else {
                  setCurrentObjective(next);
                  setPhase("objectives");
                }
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
        setFrame(res._legacy_frame);
        setFrameLabel(res.label);
        setFrameConfirmationCopy(res.confirmation_copy);
        setClarifyingQuestion(res.clarifying_question);
        // Route by frame + confidence. Rule (Phase 6):
        //  - not_fit → respectful redirect, do not interrogate.
        //  - high confidence → show confirmation.
        //  - low confidence  → ask one clarifying question.
        if (res.frame === "not_fit") {
          setPhase("not-a-fit");
        } else if (res.confidence >= HIGH_CONFIDENCE_BAR) {
          setPhase("confirm-frame");
        } else {
          setPhase("clarify");
        }
      } catch (err) {
        console.warn("[intake/write] classify failed", err);
        // Silent fallback to generic project so the person never sees a dead end.
        setFrame("project.generic");
        setFrameLabel(FRAME_DEFINITIONS["project.generic"].label);
        setFrameConfirmationCopy("");
        setClarifyingQuestion("");
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
        // Seed scores from BOTH per-objective heuristic AND cross-objective
        // evidence extraction over the opening answer. The extractor credits
        // objectives the founder answered incidentally (e.g. saying "my
        // mother's 60th birthday" satisfies `audience` and `goal` in one
        // line), so the planner does not re-ask them.
        const initialScores = computeObjectiveScores(f, answers);
        const openText = answers[OPEN_KEY]?.response ?? "";
        if (openText.trim()) {
          const facts = heuristicExtract(f, openText);
          for (const [key, fact] of Object.entries(facts)) {
            const evidenceScore = Math.round(fact.confidence * 100);
            if (evidenceScore > (initialScores[key] ?? 0)) {
              initialScores[key] = evidenceScore;
            }
          }
        }
        setScores(initialScores);
        setAskedKeys([]);
        const next = selectNextObjective(f, initialScores, new Set());
        setCurrentObjective(next);
        setPhase(next ? "objectives" : "contact");
      }
    },
    [answers, upsertAnswer],
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
        setFrame(res._legacy_frame);
        setFrameLabel(res.label);
        setFrameConfirmationCopy(res.confirmation_copy);
        setClarifyingQuestion(res.clarifying_question);
        if (res.frame === "not_fit") {
          setPhase("not-a-fit");
        } else if (res.confidence >= HIGH_CONFIDENCE_BAR) {
          setPhase("confirm-frame");
        } else {
          setPhase("clarify");
        }
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

  // Persist internal-only rows (scores, asked). These live in the answers map
  // as underscore-prefixed keys so they round-trip through saveDraft/loadDraft
  // without a migration. They are filtered out on submit and never rendered.
  const persistInternal = React.useCallback(
    (nextScores: Record<string, number>, nextAsked: string[]) => {
      setAnswers((prev) => {
        const next: Record<string, AnswerRow> = {
          ...prev,
          [SCORES_KEY]: {
            key: SCORES_KEY,
            question: "internal: objective scores",
            response: JSON.stringify(nextScores),
            reflected_offered: null,
          },
          [ASKED_KEY]: {
            key: ASKED_KEY,
            question: "internal: asked objective keys",
            response: JSON.stringify(nextAsked),
            reflected_offered: null,
          },
        };
        scheduleSave({ answers: next, contact });
        return next;
      });
    },
    [contact, scheduleSave],
  );

  // After an answer is committed, score the current objective, update the
  // hidden model, and pick the next question. Runs on Next and Skip.
  //
  // Scoring policy (P1 fix — objective-loop stall):
  //   - Advance immediately using the local heuristic score.
  //   - Fire the model-scoring server call in the background with a hard
  //     timeout so a slow/hung Anthropic call can never pin the Continue
  //     button in a disabled state. When it returns, we quietly upgrade
  //     the stored score (used for review, not routing).
  //   - `scoringNext` is released in a `finally` block synchronous with
  //     the transition so the button briefly shows a spinner and then
  //     reliably recovers, even if the background call hangs or fails.
  const advanceObjective = React.useCallback(
    async (opts: { skipScoring?: boolean } = {}) => {
      if (!frame || !activeFrameDef || !currentObjective) return;
      const key = currentObjective.key;
      const responseText = answers[key]?.response ?? "";
      const askedIndex = askedKeys.length;

      console.debug("[intake/objective-loop] advance:start", {
        askedIndex,
        key,
        skipScoring: !!opts.skipScoring,
        hasText: !!responseText.trim(),
      });

      // Heuristic first — always fast, deterministic, no network.
      const objectiveScore = opts.skipScoring
        ? scores[key] ?? scoreAnswer(key, responseText)
        : responseText.trim()
          ? scoreAnswer(key, responseText)
          : scores[key] ?? 0;

      // Brief visual scoring cue; cleared in `finally` below and by the
      // defensive effect that watches `currentObjective.key`.
      setScoringNext(true);

      // Fire model scoring in the background with a hard timeout. Never
      // await it in the transition path — a slow model must not block the
      // user from continuing.
      if (!opts.skipScoring && responseText.trim() && resumeToken) {
        const token = resumeToken;
        const label = currentObjective.label;
        const anchor = currentObjective.anchor;
        console.debug("[intake/objective-loop] score:request", { key });
        void (async () => {
          try {
            const mod = await import("@/lib/intake-score.functions");
            const timeoutMs = 6000;
            const scored = await Promise.race([
              mod.scoreObjective({
                data: {
                  resume_token: token,
                  objective_key: key,
                  objective_label: label,
                  objective_anchor: anchor,
                  response: responseText,
                },
              }),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
            ]);
            if (scored && typeof scored.score === "number") {
              console.debug("[intake/objective-loop] score:resolved", {
                key,
                score: scored.score,
              });
              setScores((s) => ({ ...s, [key]: scored.score }));
            } else {
              console.debug("[intake/objective-loop] score:timeout-or-null", { key });
            }
          } catch (err) {
            console.warn("[intake/objective-loop] score:failed", err);
          }
        })();
      }

      try {
        const nextScores: Record<string, number> = { ...scores, [key]: objectiveScore };
        // Cross-objective evidence pass: scan the just-committed answer text
        // against the whole frame profile so answers that incidentally cover
        // other fields (dates, guest counts, systems) credit those fields
        // and the planner skips them.
        if (responseText.trim()) {
          const facts = heuristicExtract(frame, responseText);
          for (const [k, fact] of Object.entries(facts)) {
            const evidenceScore = Math.round(fact.confidence * 100);
            if (evidenceScore > (nextScores[k] ?? 0)) nextScores[k] = evidenceScore;
          }
        }
        const nextAsked = askedKeys.includes(key) ? askedKeys : [...askedKeys, key];
        setScores(nextScores);
        setAskedKeys(nextAsked);
        persistInternal(nextScores, nextAsked);

        // Hard cap → stop asking, go to contact.
        if (nextAsked.length >= HARD_CAP_QUESTIONS) {
          setCurrentObjective(null);
          setPhase("contact");
          console.debug("[intake/objective-loop] advance:hard-cap");
          return;
        }

        const next = selectNextObjective(frame, nextScores, new Set(nextAsked));
        if (!next) {
          setCurrentObjective(null);
          setPhase("contact");
          console.debug("[intake/objective-loop] advance:enough");
          return;
        }
        console.debug("[intake/objective-loop] advance:next", { from: key, to: next.key });
        setCurrentObjective(next);
      } finally {
        // Always release the scoring lock synchronously with the transition
        // so Continue never stays disabled because of it.
        setScoringNext(false);
      }
    },
    [activeFrameDef, answers, askedKeys, currentObjective, frame, persistInternal, resumeToken, scores],
  );

  // Defense in depth: whenever the current objective changes, guarantee the
  // scoring lock is clear. Prevents a stale closure or an in-flight background
  // request from ever pinning the Continue button in a disabled state on the
  // next objective.
  React.useEffect(() => {
    setScoringNext(false);
  }, [currentObjective?.key]);


  const goNextObjective = React.useCallback(() => {
    void advanceObjective();
  }, [advanceObjective]);

  const goSkipObjective = React.useCallback(() => {
    void advanceObjective({ skipScoring: true });
  }, [advanceObjective]);

  const goPrevObjective = React.useCallback(() => {
    // Back pops the most recently asked objective off the asked list and
    // returns to it. If nothing has been asked yet, back returns to the
    // frame confirmation.
    if (askedKeys.length === 0) {
      setCurrentObjective(null);
      setPhase("confirm-frame");
      return;
    }
    // If the current objective was never asked, just pop the last asked one.
    const lastAskedKey = askedKeys[askedKeys.length - 1];
    const prevObjective =
      activeFrameDef?.objectives.find((o) => o.key === lastAskedKey) ?? null;
    if (!prevObjective) {
      setPhase("confirm-frame");
      return;
    }
    const nextAsked = askedKeys.slice(0, -1);
    setAskedKeys(nextAsked);
    persistInternal(scores, nextAsked);
    setCurrentObjective(prevObjective);
  }, [activeFrameDef, askedKeys, persistInternal, scores]);

  const editObjectiveFromReview = React.useCallback(
    (o: IntakeObjective) => {
      setCurrentObjective(o);
      // Ensure it appears in askedKeys so back-nav works from there.
      if (!askedKeys.includes(o.key)) {
        const nextAsked = [...askedKeys, o.key];
        setAskedKeys(nextAsked);
        persistInternal(scores, nextAsked);
      }
      setPhase("objectives");
    },
    [askedKeys, persistInternal, scores],
  );

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
        // Never send hidden internal rows (scores, asked list) to the engine.
        if (k === SCORES_KEY || k === ASKED_KEY) continue;
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

  // ---------- Save and come back later ----------
  const handleSaveForLater = React.useCallback(async () => {
    try {
      // Flush pending autosave so the current answers/contact are persisted.
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      await persist({ answers, contact });
      // Offer to email the resume link if we have an email on file.
      if (contact.email.trim() && resumeToken && typeof window !== "undefined") {
        try {
          const mod = await import("@/lib/intake.functions");
          await mod.sendResumeLink({
            data: {
              resume_token: resumeToken,
              email: contact.email.trim(),
              resume_url: window.location.origin + "/build-my-roadmap/write",
              name: contact.name || "",
            },
          });
          toast.success("Saved. We emailed you a link to pick this up.");
        } catch (err) {
          console.warn("[intake/write] resume-link email failed", err);
          toast.success("Saved. This page will remember you when you return.");
        }
      } else {
        toast.success("Saved. This page will remember you when you return.");
      }
      navigate({ to: "/" });
    } catch (err) {
      console.error("[intake/write] save-for-later failed", err);
      toast.error("We could not save just now. Try again in a moment.");
    }
  }, [answers, contact, navigate, persist, resumeToken]);

  // ---------- Generative anchor wording ----------
  // Whenever the completeness model picks a new objective, ask the server to
  // rewrite that objective's anchor in the person's own language. Voice check
  // + regeneration + anchor fallback all happen server-side; here we only
  // hold the returned string. On any failure we render the anchor verbatim.
  React.useEffect(() => {
    if (phase !== "objectives" || !currentObjective || !resumeToken) {
      setGeneratedQuestion(null);
      return;
    }
    let cancelled = false;
    const objectiveKey = currentObjective.key;
    // Reset so the anchor shows immediately while we fetch.
    setGeneratedQuestion(null);
    setGeneratingQuestion(true);
    (async () => {
      try {
        const priors = activeFrameDef
          ? activeFrameDef.objectives
              .filter(
                (o) =>
                  o.key !== objectiveKey &&
                  (answers[o.key]?.response ?? "").trim().length > 0,
              )
              .map((o) => ({
                label: o.label,
                response: answers[o.key]!.response.trim().slice(0, 800),
              }))
          : [];
        const opening = answers[OPEN_KEY]?.response ?? "";
        const mod = await import("@/lib/intake-question.functions");
        const res = await mod.generateAnchorWording({
          data: {
            resume_token: resumeToken,
            objective_key: objectiveKey,
            objective_label: currentObjective.label,
            objective_anchor: currentObjective.anchor,
            opening,
            prior_answers: priors,
          },
        });
        if (cancelled) return;
        // Only override the anchor when the model returned a fresh sentence.
        if (res.source === "generated" && res.question) {
          setGeneratedQuestion(res.question);
        } else {
          setGeneratedQuestion(null);
        }
      } catch (err) {
        console.warn("[intake/write] anchor rewording failed, using anchor", err);
        if (!cancelled) setGeneratedQuestion(null);
      } finally {
        if (!cancelled) setGeneratingQuestion(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Answers change every keystroke; we only want to regenerate when the
    // objective itself changes, not while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentObjective?.key, phase, resumeToken]);



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
          overrideCopy={frameConfirmationCopy || undefined}
          onYes={handleFrameConfirmed}
          onNotQuite={() => setPhase("reclassify")}
          onNotSure={() => setPhase("reclassify")}
        />
      )}

      {phase === "clarify" && (
        <ReclassifyScreen
          classifying={classifying}
          initial={answers["_frame_correction"]?.response ?? ""}
          prompt={
            clarifyingQuestion ||
            "Can you say a little more so we can tell which frame fits?"
          }
          submitLabel="Read again"
          onSubmit={handleFrameCorrected}
          onBack={() => setPhase("open")}
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

      {phase === "objectives" && activeFrameDef && currentObjective && (
        <ObjectiveScreen
          frameDef={activeFrameDef}
          objective={currentObjective}
          value={answers[currentObjective.key]?.response ?? ""}
          scoring={scoringNext}
          generatedQuestion={generatedQuestion}
          generatingQuestion={generatingQuestion}
          onChange={(v) => {
            const q = currentObjective;
            const existing = answers[q.key];
            upsertAnswer({
              key: q.key,
              question: q.anchor,
              response: v,
              reflected_offered: existing?.reflected_offered ?? null,
            });
          }}
          onAdoptReflection={(text) => {
            const q = currentObjective;
            upsertAnswer({
              key: q.key,
              question: q.anchor,
              response: text,
              reflected_offered: text,
            });
          }}
          onRequestReflection={async (question, answer) => {
            if (!resumeToken) return null;
            try {
              const mod = await import("@/lib/intake.functions");
              const res = await mod.reflectAnswer({
                data: { resume_token: resumeToken, question, answer },
              });
              return res?.text ?? null;
            } catch (err) {
              console.warn("[intake/write] reflect failed (silent)", err);
              return null;
            }
          }}
          onNext={goNextObjective}
          onPrev={goPrevObjective}
          onSkip={goSkipObjective}
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
          attachments={attachments}
          sources={sources}
          contact={contact}
          openAnswer={answers[OPEN_KEY]?.response ?? ""}
          onEditObjective={(key) => {
            const obj = activeFrameDef.objectives.find((o) => o.key === key);
            if (obj) editObjectiveFromReview(obj);
          }}
          onEditContact={() => setPhase("contact")}
          onEditOpen={() => setPhase("open")}
          onSubmit={handleSubmit}
          onSaveForLater={handleSaveForLater}
          submitting={submitting}
          ensureResumeToken={async () => {
            if (resumeToken) return resumeToken;
            await persist({ answers, contact });
            // persist() sets resumeToken via setState; read from localStorage
            // as a synchronous fallback so upload can start immediately.
            const t =
              typeof window !== "undefined"
                ? window.localStorage.getItem(STORAGE_KEY)
                : null;
            if (!t) throw new Error("Could not create draft to attach sources to.");
            setResumeToken(t);
            return t;
          }}
          onAttachmentsChange={setAttachments}
          onSourcesChange={setSources}
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
  overrideCopy,
  onYes,
  onNotQuite,
  onNotSure,
}: {
  label: string;
  confirmSuffix: string;
  overrideCopy?: string;
  onYes: () => void;
  onNotQuite: () => void;
  onNotSure: () => void;
}) {
  const line = overrideCopy
    ? overrideCopy.endsWith("?")
      ? overrideCopy
      : `${overrideCopy}?`
    : `This sounds like ${label}. ${confirmSuffix ? `${confirmSuffix.charAt(0).toUpperCase()}${confirmSuffix.slice(1)}.` : ""} Is that right?`;
  return (
    <section className="space-y-8">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        {line}
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
  prompt,
  submitLabel,
  onSubmit,
  onBack,
}: {
  initial: string;
  classifying: boolean;
  prompt?: string;
  submitLabel?: string;
  onSubmit: (text: string) => void | Promise<void>;
  onBack: () => void;
}) {
  const [text, setText] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => ref.current?.focus(), []);
  return (
    <section className="space-y-6">
      <p className="font-serif text-xl leading-snug text-foreground sm:text-2xl">
        {prompt ?? "What would you call this in your own words?"}
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
          {submitLabel ?? "Read again"}
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
  scoring,
  generatedQuestion,
  generatingQuestion,
  onChange,
  onAdoptReflection,
  onRequestReflection,
  onNext,
  onPrev,
  onSkip,
  onReview,
}: {
  frameDef: FrameDefinition;
  objective: IntakeObjective;
  value: string;
  answeredCount: number;
  scoring?: boolean;
  generatedQuestion?: string | null;
  generatingQuestion?: boolean;
  onChange: (v: string) => void;
  onAdoptReflection?: (text: string) => void;
  onRequestReflection?: (question: string, answer: string) => Promise<string | null>;
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

  // The completeness model picks the objective; AI may only rewrite its
  // anchor. If generation is pending or failed the voice check server-side,
  // we render the anchor verbatim — never a spinner in place of a question.
  const questionText = generatedQuestion?.trim() || objective.anchor;

  // ---------- Quiet reflection ----------
  // After each meaningful answer, offer a cleaner version under a soft label.
  // Never say "AI". If the reflection call fails, we show nothing — no
  // apology, no error. Dismissed reflections stay dismissed for this answer.
  const [reflection, setReflection] = React.useState<string | null>(null);
  const [reflecting, setReflecting] = React.useState(false);
  const [dismissedFor, setDismissedFor] = React.useState<string>("");
  const reflectTimer = React.useRef<number | null>(null);

  // Reset when the objective changes.
  React.useEffect(() => {
    setReflection(null);
    setReflecting(false);
    setDismissedFor("");
    if (reflectTimer.current) window.clearTimeout(reflectTimer.current);
  }, [objective.key]);

  const requestReflection = React.useCallback(
    async (answerText: string) => {
      if (!onRequestReflection) return;
      const trimmed = answerText.trim();
      if (trimmed.length < 20) return;
      // Do not re-ask for a value the person already dismissed or adopted.
      if (dismissedFor && dismissedFor === trimmed) return;
      if (reflection && reflection.trim() === trimmed) return;
      try {
        setReflecting(true);
        const result = await onRequestReflection(questionText, trimmed);
        const clean = (result ?? "").trim();
        // Silence on failure or a no-op reflection.
        if (!clean || clean.toLowerCase() === trimmed.toLowerCase()) {
          setReflection(null);
        } else {
          setReflection(clean);
        }
      } catch {
        setReflection(null);
      } finally {
        setReflecting(false);
      }
    },
    [dismissedFor, onRequestReflection, questionText, reflection],
  );

  const scheduleReflect = React.useCallback(
    (answerText: string) => {
      if (!onRequestReflection) return;
      if (reflectTimer.current) window.clearTimeout(reflectTimer.current);
      reflectTimer.current = window.setTimeout(() => {
        void requestReflection(answerText);
      }, 900);
    },
    [onRequestReflection, requestReflection],
  );

  const handleAdopt = React.useCallback(() => {
    if (!reflection) return;
    if (onAdoptReflection) {
      onAdoptReflection(reflection);
    } else {
      onChange(reflection);
    }
    setDismissedFor(reflection.trim());
    setReflection(null);
  }, [onAdoptReflection, onChange, reflection]);

  const handleKeepMine = React.useCallback(() => {
    setDismissedFor(value.trim());
    setReflection(null);
  }, [value]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{frameDef.label}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {objective.label}{objective.required ? "" : ", if it helps"}
        </p>
      </div>
      <p
        className="font-serif text-xl leading-snug text-foreground sm:text-2xl"
        aria-busy={generatingQuestion ? true : undefined}
      >
        {questionText}
      </p>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Clear a stale reflection whenever the answer changes.
          if (reflection) setReflection(null);
          scheduleReflect(e.target.value);
        }}
        onBlur={(e) => {
          void requestReflection(e.target.value);
        }}
        rows={6}
        placeholder="In your own words."
        className="min-h-[140px] text-base"
      />
      {reflection && (
        <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            a clearer version, if it helps
          </p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {reflection}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleAdopt}>
              Use these words
            </Button>
            <Button size="sm" variant="ghost" onClick={handleKeepMine}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
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
          <Button
            onClick={() => {
              // Reflection is fire-and-forget (debounced typing + onBlur).
              // It must never block Continue — do not re-request it here.
              console.debug("[intake/objective-loop] continue:click", {
                key: objective.key,
                scoring: !!scoring,
              });
              onNext();
            }}
            disabled={(() => {
              const disabled = (objective.required && !requiredMet) || !!scoring;
              if (disabled) {
                console.debug("[intake/objective-loop] continue:disabled", {
                  key: objective.key,
                  reason:
                    objective.required && !requiredMet
                      ? "required-empty"
                      : scoring
                        ? "scoring"
                        : "unknown",
                });
              }
              return disabled;
            })()}
            className="gap-2"
          >
            {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Continue
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
  attachments,
  sources,
  contact,
  openAnswer,
  onEditObjective,
  onEditContact,
  onEditOpen,
  onSubmit,
  onSaveForLater,
  submitting,
  ensureResumeToken,
  onAttachmentsChange,
  onSourcesChange,
}: {
  frameDef: FrameDefinition;
  answers: Record<string, AnswerRow>;
  attachments: Array<{ storage_path: string; filename: string; size: number; mime: string | null }>;
  sources: StoredIntakeSource[];
  contact: ContactFields;
  openAnswer: string;
  onEditObjective: (key: string) => void;
  onEditContact: () => void;
  onEditOpen: () => void;
  onSubmit: () => void;
  onSaveForLater: () => void;
  submitting: boolean;
  ensureResumeToken: () => Promise<string>;
  onAttachmentsChange: React.Dispatch<
    React.SetStateAction<
      Array<{ storage_path: string; filename: string; size: number; mime: string | null }>
    >
  >;
  onSourcesChange: React.Dispatch<React.SetStateAction<StoredIntakeSource[]>>;
}) {
  const understood = frameDef.objectives
    .map((o, idx) => ({ o, idx, response: answers[o.key]?.response.trim() ?? "" }))
    .filter((r) => r.response);
  const open = frameDef.objectives
    .map((o, idx) => ({ o, idx, response: answers[o.key]?.response.trim() ?? "" }))
    .filter((r) => !r.response);

  return (
    <section className="space-y-10">
      <div className="space-y-2 text-base leading-relaxed text-muted-foreground">
        <p>Here is what we understood.</p>
        <p>Here is what we will explore together.</p>
        <p>Here is what we will use to prepare your roadmap.</p>
        <p className="pt-2 text-sm">Edit anything that reads wrong before sending.</p>
      </div>

      <Panel title="Your opening" onEdit={onEditOpen}>
        <blockquote className="whitespace-pre-wrap border-l-2 border-foreground/30 pl-4 font-serif text-lg leading-snug text-foreground">
          {openAnswer || "(no opening on file)"}
        </blockquote>
        <p className="mt-3 text-xs text-muted-foreground">
          We read this as {frameDef.label.toLowerCase()}.
        </p>
      </Panel>

      <Panel title="Here is what we understood" onEdit={undefined}>
        {understood.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing captured yet.</p>
        ) : (
          <ul className="space-y-4">
            {understood.map(({ o, response }) => (
              <li key={o.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{o.label}</p>
                  <button
                    type="button"
                    onClick={() => onEditObjective(o.key)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> edit this
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-base text-foreground">{response}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {open.length > 0 && (
        <Panel title="Here is what we will explore together" onEdit={undefined}>
          <p className="mb-3 text-sm text-muted-foreground">
            Open ground, not a gap. Add a line now, or leave it for the first conversation.
          </p>
          <ul className="space-y-2">
            {open.map(({ o }) => (
              <li key={o.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{o.label}</span>
                <button
                  type="button"
                  onClick={() => onEditObjective(o.key)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Pencil className="h-3 w-3" /> add a line
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Here is what we will use to prepare your roadmap" onEdit={undefined}>
        <p className="mb-4 text-sm text-muted-foreground">
          These are the sources a person at Trust Tai will read alongside your answers.
        </p>
        <dl className="grid gap-3 text-sm">
          <ReviewRow
            label="Your opening"
            value={openAnswer ? "In your own words, preserved as written" : ""}
          />
          <ReviewRow
            label="Captured answers"
            value={
              understood.length
                ? `${understood.length} ${understood.length === 1 ? "answer" : "answers"} across ${frameDef.label.toLowerCase()}`
                : ""
            }
          />
          <ReviewRow
            label="Uploaded files"
            value={
              attachments.length
                ? attachments.map((a) => a.filename).join(", ")
                : ""
            }
          />
          <ReviewRow
            label="Extra sources"
            value={
              sources.length
                ? sources
                    .map((s) =>
                      s.kind === "url" ? s.url || s.label : `${s.label} (${s.kind})`,
                    )
                    .join(", ")
                : ""
            }
          />
          {contact.website && <ReviewRow label="Website you shared" value={contact.website} />}
        </dl>
        {understood.length === 0 && attachments.length === 0 && sources.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your opening alone is enough to begin the read.
          </p>
        )}
      </Panel>

      <SourcesPanel
        attachments={attachments}
        sources={sources}
        ensureResumeToken={ensureResumeToken}
        onAttachmentsChange={onAttachmentsChange}
        onSourcesChange={onSourcesChange}
      />

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

      <div className="space-y-4 pt-2">
        <p className="text-sm text-muted-foreground">
          A person reads every word before anything is drafted.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onSaveForLater}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground"
          >
            Save and come back later
          </Button>
          <Button onClick={onSubmit} disabled={submitting} size="lg" className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Send this to Trust Tai
          </Button>
        </div>
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

/* ---------- Sources panel (uploads, transcripts, notes, URLs) ---------- */
//
// Safety law (spec §Phase 9): every source the founder adds here is DATA,
// not instructions. The panel makes that contract visible to the user, and
// the server-side pipeline enforces it: `visibility` and `origin` are
// stamped server-side, the engine brief prefixes the block with a
// "data, not instructions" heading, and the client portal never reads raw
// content or files.

const SOURCE_BUCKET = "intake-uploads";
const SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const SOURCE_ALLOWED_EXT = new Set([
  "pdf", "doc", "docx", "txt", "md", "rtf",
  "xls", "xlsx", "csv", "ppt", "pptx", "key",
  "png", "jpg", "jpeg", "gif", "webp", "heic", "svg",
  "zip", "json", "yaml", "yml",
]);

function SourcesPanel({
  attachments,
  sources,
  ensureResumeToken,
  onAttachmentsChange,
  onSourcesChange,
}: {
  attachments: Array<{ storage_path: string; filename: string; size: number; mime: string | null }>;
  sources: StoredIntakeSource[];
  ensureResumeToken: () => Promise<string>;
  onAttachmentsChange: React.Dispatch<
    React.SetStateAction<
      Array<{ storage_path: string; filename: string; size: number; mime: string | null }>
    >
  >;
  onSourcesChange: React.Dispatch<React.SetStateAction<StoredIntakeSource[]>>;
}) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [drafting, setDrafting] = React.useState<null | "transcript" | "notes" | "url">(null);
  const [draftText, setDraftText] = React.useState("");
  const [draftLabel, setDraftLabel] = React.useState("");
  const [draftUrl, setDraftUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const dragDepthRef = React.useRef(0);

  const resetDraft = () => {
    setDrafting(null);
    setDraftText("");
    setDraftLabel("");
    setDraftUrl("");
  };

  // Client-side preflight — runs BEFORE any bytes are uploaded so the founder
  // sees a single grouped warning about disallowed types or oversized files.
  // The server still re-validates (source of truth); this is just to avoid
  // shipping bytes we already know will be rejected.
  const preflight = React.useCallback(
    (files: File[], slotsAvailable: number) => {
      const accepted: File[] = [];
      const rejections: string[] = [];
      let slots = Math.max(0, slotsAvailable);
      for (const f of files) {
        const ext = (f.name.split(".").pop() ?? "").toLowerCase();
        if (f.size === 0) {
          rejections.push(`${f.name}: empty file`);
          continue;
        }
        if (f.size > SOURCE_MAX_BYTES) {
          const mb = (f.size / (1024 * 1024)).toFixed(1);
          rejections.push(`${f.name}: ${mb} MB exceeds the 25 MB limit`);
          continue;
        }
        if (!SOURCE_ALLOWED_EXT.has(ext)) {
          rejections.push(`${f.name}: ".${ext || "unknown"}" not allowed`);
          continue;
        }
        if (slots <= 0) {
          rejections.push(`${f.name}: attach up to 10 files per intake`);
          continue;
        }
        accepted.push(f);
        slots -= 1;
      }
      return { accepted, rejections };
    },
    [],
  );

  const uploadOne = React.useCallback(
    async (file: File): Promise<boolean> => {
      try {
        const token = await ensureResumeToken();
        const cleaned = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 180);
        const path = `${token}/${crypto.randomUUID()}-${cleaned}`;
        const { error: upErr } = await supabase.storage
          .from(SOURCE_BUCKET)
          .upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) throw upErr;
        const mod = await import("@/lib/intake.functions");
        const res = await mod.recordIntakeAttachment({
          data: {
            resume_token: token,
            storage_path: path,
            filename: file.name,
            size: file.size,
            mime: file.type || null,
          },
        });
        onAttachmentsChange(res.attachments ?? []);
        return true;
      } catch (err) {
        console.warn("[intake-sources] upload failed", err);
        toast.error(`${file.name}: ${(err as Error)?.message || "upload failed"}`);
        return false;
      }
    },
    [ensureResumeToken, onAttachmentsChange],
  );

  const uploadFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const { accepted, rejections } = preflight(
        files,
        10 - attachments.length,
      );
      if (rejections.length > 0) {
        // Group rejections into one toast so a founder dropping a folder does
        // not get a wall of stacked errors.
        toast.error(
          `${rejections.length} file${rejections.length === 1 ? "" : "s"} skipped`,
          { description: rejections.slice(0, 5).join("\n") },
        );
      }
      if (accepted.length === 0) return;
      setUploading(true);
      try {
        let ok = 0;
        // Sequential to keep server-side dedupe + slot count consistent and
        // to avoid Supabase Storage rate limits on parallel PUTs.
        for (const f of accepted) {
          if (await uploadOne(f)) ok += 1;
        }
        if (ok > 0) toast.success(`Attached ${ok} file${ok === 1 ? "" : "s"}`);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [attachments.length, preflight, uploadOne],
  );

  // ── Drag-and-drop handlers ────────────────────────────────────────────
  // dragenter/leave fire on every child element, so we count depth and only
  // clear the highlight when the outermost dragleave brings the counter to 0.
  const onDragEnter = React.useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }, []);
  const onDragOver = React.useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);
  const onDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);
  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    },
    [uploadFiles],
  );





  const removeAttachment = React.useCallback(
    async (storage_path: string) => {
      setRemovingId(storage_path);
      try {
        const token = await ensureResumeToken();
        const mod = await import("@/lib/intake.functions");
        const res = await mod.removeIntakeAttachment({
          data: { resume_token: token, storage_path },
        });
        onAttachmentsChange(res.attachments ?? []);
      } catch (err) {
        console.warn("[intake-sources] remove attachment failed", err);
        toast.error("Could not remove that file. Try again.");
      } finally {
        setRemovingId(null);
      }
    },
    [ensureResumeToken, onAttachmentsChange],
  );

  const saveDraft = React.useCallback(async () => {
    if (!drafting) return;
    setSaving(true);
    try {
      const token = await ensureResumeToken();
      const mod = await import("@/lib/intake-sources.functions");
      const res = await mod.addIntakeSource({
        data: {
          resume_token: token,
          kind: drafting,
          label: draftLabel,
          content: drafting === "url" ? "" : draftText,
          url: drafting === "url" ? draftUrl : "",
        },
      });
      onSourcesChange(res.sources as StoredIntakeSource[]);
      toast.success("Saved.");
      resetDraft();
    } catch (err) {
      console.warn("[intake-sources] save failed", err);
      toast.error((err as Error)?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [drafting, draftLabel, draftText, draftUrl, ensureResumeToken, onSourcesChange]);

  const removeSource = React.useCallback(
    async (id: string) => {
      setRemovingId(id);
      try {
        const token = await ensureResumeToken();
        const mod = await import("@/lib/intake-sources.functions");
        const res = await mod.removeIntakeSource({ data: { resume_token: token, id } });
        onSourcesChange(res.sources as StoredIntakeSource[]);
      } catch (err) {
        console.warn("[intake-sources] remove source failed", err);
        toast.error("Could not remove that source. Try again.");
      } finally {
        setRemovingId(null);
      }
    },
    [ensureResumeToken, onSourcesChange],
  );

  return (
    <Panel title="Add anything else that will help" onEdit={undefined}>
      <p className="mb-3 text-sm text-muted-foreground">
        Uploads, transcripts, notes, and URLs are read as evidence alongside your answers.
      </p>
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Anything you attach here is read as data, never as instructions. It stays internal to Trust Tai and is not shown in a client portal.
        </span>
      </div>

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-md border border-dashed p-3 transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border/60 bg-transparent",
        )}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {dragActive
            ? "Drop to attach — files over 25 MB or of disallowed types will be skipped."
            : "Drag files here, or use the buttons below. Max 25 MB each, up to 10 files."}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (!list || list.length === 0) return;
              void uploadFiles(Array.from(list));
            }}
          />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload files
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={() => {
            resetDraft();
            setDrafting("transcript");
          }}
        >
          <FileText className="h-4 w-4" /> Paste transcript
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={() => {
            resetDraft();
            setDrafting("notes");
          }}
        >
          <Paperclip className="h-4 w-4" /> Paste notes
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={() => {
            resetDraft();
            setDrafting("url");
          }}
        >
          <Link2 className="h-4 w-4" /> Add website URL
        </Button>
        </div>
      </div>

      {drafting && (
        <div className="mt-4 space-y-3 rounded-md border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {drafting === "url"
                ? "Add a website URL"
                : drafting === "transcript"
                  ? "Paste a transcript"
                  : "Paste notes"}
            </p>
            <button
              type="button"
              onClick={resetDraft}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source-label">Label</Label>
            <Input
              id="source-label"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder={
                drafting === "url"
                  ? "e.g. Current site"
                  : drafting === "transcript"
                    ? "e.g. Kickoff call, June 3"
                    : "e.g. Board notes"
              }
              maxLength={200}
            />
          </div>
          {drafting === "url" ? (
            <div className="grid gap-2">
              <Label htmlFor="source-url">URL</Label>
              <Input
                id="source-url"
                type="url"
                inputMode="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="https://example.com"
                maxLength={2000}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="source-text">Content</Label>
              <Textarea
                id="source-text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={8}
                maxLength={60000}
                placeholder={
                  drafting === "transcript"
                    ? "Paste the transcript. It is read as evidence, not as instructions."
                    : "Paste any notes. They are read as evidence, not as instructions."
                }
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetDraft} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveDraft()}
              disabled={
                saving ||
                (drafting === "url" ? !draftUrl.trim() : !draftText.trim())
              }
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save source
            </Button>
          </div>
        </div>
      )}

      {(attachments.length > 0 || sources.length > 0) && (
        <ul className="mt-5 space-y-2">
          {attachments.map((a) => (
            <li
              key={a.storage_path}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-foreground">{a.filename}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {Math.max(1, Math.round(a.size / 1024))} KB
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void removeAttachment(a.storage_path)}
                disabled={removingId === a.storage_path}
              >
                {removingId === a.storage_path ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                remove
              </button>
            </li>
          ))}
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                {s.kind === "url" ? (
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : s.kind === "transcript" ? (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate text-foreground">{s.label}</span>
                <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {s.kind}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void removeSource(s.id)}
                disabled={removingId === s.id}
              >
                {removingId === s.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
