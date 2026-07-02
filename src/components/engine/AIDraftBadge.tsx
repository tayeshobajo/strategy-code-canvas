import { Sparkles, User } from "lucide-react";

/**
 * Visual indicator distinguishing AI-drafted content from human-authored
 * content. Consistent across the workspace so Tai can spot drafts at a glance.
 */
export function AIDraftBadge({
  kind,
  size = "sm",
  className = "",
}: {
  kind: "ai" | "human" | string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
}) {
  const isAI = kind === "ai";
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const Icon = isAI ? Sparkles : User;
  const label = isAI ? "AI Draft" : "Human";
  const tone = isAI
    ? "border-[#cdd6f3] bg-[#e9eefb] text-[#2842a4]"
    : "border-border bg-paper-soft text-ink/70";
  return (
    <span
      title={isAI ? "AI-generated draft — needs review" : "Human-authored"}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${pad} ${tone} ${className}`}
    >
      <Icon className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {label}
    </span>
  );
}
