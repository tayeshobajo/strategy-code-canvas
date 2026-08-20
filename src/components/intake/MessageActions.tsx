/**
 * Quiet per-message actions: copy, and (for Tai's lines) a thumbs up / down.
 * Reactions persist per conversation in local storage so a resumed session
 * still shows what the founder marked.
 */

import * as React from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";

export type Reaction = "up" | "down";

const KEY_PREFIX = "tt_intake_reactions_";

function storageKey(conversationId: string | null) {
  return `${KEY_PREFIX}${conversationId ?? "anon"}`;
}

export function useMessageReactions(conversationId: string | null) {
  const [reactions, setReactions] = React.useState<Record<string, Reaction>>({});

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(conversationId));
      setReactions(raw ? (JSON.parse(raw) as Record<string, Reaction>) : {});
    } catch {
      setReactions({});
    }
  }, [conversationId]);

  const react = React.useCallback(
    (messageId: string, value: Reaction) => {
      setReactions((prev) => {
        const next = { ...prev };
        if (next[messageId] === value) delete next[messageId];
        else next[messageId] = value;
        try {
          window.localStorage.setItem(storageKey(conversationId), JSON.stringify(next));
        } catch {
          /* storage unavailable — reactions stay in memory */
        }
        return next;
      });
    },
    [conversationId],
  );

  return { reactions, react };
}

export function MessageActions(props: {
  messageId: string;
  text: string;
  align?: "start" | "end";
  reaction?: Reaction;
  onReact?: (messageId: string, value: Reaction) => void;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const base =
    "inline-flex h-6 w-6 items-center justify-center rounded-full text-ink/35 transition hover:bg-ink/[0.06] hover:text-ink focus-visible:opacity-100";

  return (
    <div
      className={`pointer-events-none absolute bottom-[-12px] flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 motion-reduce:opacity-100 ${
        props.align === "end" ? "right-0 justify-end" : "left-0"
      } ${props.className ?? ""}`}
    >
      <button type="button" onClick={copy} className={base} aria-label="Copy message">
        {copied ? <Check className="h-3.5 w-3.5 text-royal" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {copied && (
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-royal" role="status">
          Copied
        </span>
      )}
      {props.onReact && (
        <>
          <button
            type="button"
            onClick={() => props.onReact?.(props.messageId, "up")}
            aria-pressed={props.reaction === "up"}
            aria-label="Helpful"
            className={`${base} ${props.reaction === "up" ? "text-royal opacity-100" : ""}`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => props.onReact?.(props.messageId, "down")}
            aria-pressed={props.reaction === "down"}
            aria-label="Not helpful"
            className={`${base} ${props.reaction === "down" ? "text-royal opacity-100" : ""}`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
