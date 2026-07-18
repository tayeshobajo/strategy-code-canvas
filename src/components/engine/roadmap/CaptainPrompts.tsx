/**
 * Interactive Captain prompts — one-shot follow-ups from the Captain Brief.
 *
 * Fires against askProjectIntelligence with a canned question. Answers
 * are displayed inline; citations, if any, appear as chips. No thread
 * persistence — this is a quick-answer surface, not a full chat.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { askProjectIntelligence } from "@/lib/engine-chat.functions";

type Prompt = { id: string; label: string; question: string };

const PROMPTS: Prompt[] = [
  {
    id: "changed",
    label: "What changed?",
    question:
      "Summarize what has changed on this roadmap since the last approved version. Reference specific milestones and dates.",
  },
  {
    id: "next",
    label: "What's next?",
    question:
      "Given the current phase and readiness, what are the next 3 concrete actions the team should take this week? Be specific.",
  },
  {
    id: "blocked",
    label: "What's blocked?",
    question:
      "Which milestones are blocked or at risk right now, why, and what would unblock them? Cite the milestone names.",
  },
];

type Answer = {
  promptId: string;
  question: string;
  summary: string | null;
  citations: string[];
  error: string | null;
  busy: boolean;
};

export function CaptainPrompts({ projectId }: { projectId: string }) {
  const askFn = useServerFn(askProjectIntelligence);
  const [active, setActive] = useState<Answer | null>(null);

  const ask = async (p: Prompt) => {
    setActive({
      promptId: p.id,
      question: p.question,
      summary: null,
      citations: [],
      error: null,
      busy: true,
    });
    try {
      const res = (await askFn({
        data: { projectId, message: p.question },
      })) as {
        answer: { summary: string; citations?: string[] };
      };
      setActive({
        promptId: p.id,
        question: p.question,
        summary: res.answer.summary,
        citations: Array.isArray(res.answer.citations) ? res.answer.citations : [],
        error: null,
        busy: false,
      });
    } catch (err) {
      setActive({
        promptId: p.id,
        question: p.question,
        summary: null,
        citations: [],
        error: (err as Error).message || "Ask failed",
        busy: false,
      });
    }
  };

  return (
    <div className="mt-3 space-y-2" data-qa-section="captain-prompts">
      <div className="flex flex-wrap gap-1.5">
        {PROMPTS.map((p) => {
          const isActive = active?.promptId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => ask(p)}
              disabled={isActive && active?.busy}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${
                isActive
                  ? "border-royal bg-royal/10 text-royal"
                  : "border-border bg-white text-ink/70 hover:border-ink/40"
              }`}
            >
              {isActive && active?.busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {p.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          className="rounded-lg border border-border bg-white p-3 text-xs"
          aria-live="polite"
        >
          {active.busy ? (
            <div className="text-ink/60">Captain is thinking…</div>
          ) : active.error ? (
            <div className="text-rose-700">{active.error}</div>
          ) : (
            <>
              <div className="whitespace-pre-wrap text-ink/80">{active.summary}</div>
              {active.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {active.citations.slice(0, 6).map((c, i) => (
                    <span
                      key={`${active.promptId}-c-${i}`}
                      className="rounded-full border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-ink/60"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
