import { Sparkles, User, RotateCcw, Loader2 } from "lucide-react";

/**
 * Visual indicator distinguishing AI-drafted content from human-authored
 * content. Consistent across the workspace so Tai can spot drafts at a glance.
 *
 * When `onRegenerate` is supplied and the badge is AI-kind, an inline
 * regenerate button surfaces so a specific section can be re-drafted without
 * leaving the current view.
 */
export function AIDraftBadge({
  kind,
  size = "sm",
  className = "",
  onRegenerate,
  regenerating = false,
  regenerateLabel = "Regenerate",
  disabled = false,
  disabledReason,
}: {
  kind: "ai" | "human" | string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
  regenerateLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const isAI = kind === "ai";
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const Icon = isAI ? Sparkles : User;
  const label = isAI ? "AI Draft" : "Human";
  const tone = isAI
    ? "border-[#cdd6f3] bg-[#e9eefb] text-[#2842a4]"
    : "border-border bg-paper-soft text-ink/70";
  const btnTitle = disabled && disabledReason ? disabledReason : regenerateLabel;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        title={isAI ? "AI-generated draft — needs review" : "Human-authored"}
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${pad} ${tone}`}
      >
        <Icon className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />
        {label}
      </span>
      {isAI && onRegenerate ? (
        <button
          onClick={onRegenerate}
          disabled={regenerating || disabled}
          title={btnTitle}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-white text-ink/70 hover:text-ink hover:border-royal/50 px-1.5 py-0.5 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
        >
          {regenerating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RotateCcw className="w-2.5 h-2.5" />}
          {regenerating ? "…" : regenerateLabel}
        </button>
      ) : null}
    </span>
  );
}
