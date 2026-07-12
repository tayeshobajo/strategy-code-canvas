/**
 * Phase 1 — Epistemic-Status Chip.
 *
 * Renders the epistemic status of a spine field (Point A / Point B) so
 * operators can see at a glance whether Tai personally confirmed a value
 * (`stated` / `verified`), whether the AI inferred it (`inferred`), whether
 * it's a raw guess (`assumed`), or whether a newer signal contradicts it
 * (`contradicted`).
 *
 * Purely presentational — no data fetching, no mutations. Feed it a status
 * (undefined = "inferred" default until the pending Phase 1 migration
 * populates real values).
 */

import { cn } from "@/lib/utils";
import { CheckCircle2, Sparkles, HelpCircle, AlertOctagon, ShieldCheck } from "lucide-react";
import type { EpistemicStatus, SourceRef } from "@/lib/engine-epistemic.functions";

type Props = {
  status?: EpistemicStatus;
  sourceRef?: SourceRef;
  className?: string;
  size?: "sm" | "md";
};

const TONE: Record<EpistemicStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  stated: {
    cls: "bg-[#e9f4ec] text-[#1f6a34] border-[#c8e4d0]",
    label: "Stated",
    Icon: CheckCircle2,
  },
  verified: {
    cls: "bg-[#e6efff] text-[#1e4bb8] border-[#c9d9f6]",
    label: "Verified",
    Icon: ShieldCheck,
  },
  inferred: {
    cls: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
    label: "Inferred",
    Icon: Sparkles,
  },
  assumed: {
    cls: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    label: "Assumed",
    Icon: HelpCircle,
  },
  contradicted: {
    cls: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
    label: "Contradicted",
    Icon: AlertOctagon,
  },
};

export function EpistemicStatusChip({
  status = "inferred",
  sourceRef,
  className,
  size = "sm",
}: Props) {
  const tone = TONE[status];
  const { Icon } = tone;
  const tooltip = buildTooltip(status, sourceRef);
  const dims = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-1"
    : "text-[11px] px-2 py-1 gap-1.5";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center font-mono uppercase tracking-wider border rounded",
        dims,
        tone.cls,
        className,
      )}
      aria-label={`Epistemic status: ${tone.label}`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

function buildTooltip(status: EpistemicStatus, ref?: SourceRef): string {
  const base: Record<EpistemicStatus, string> = {
    stated: "The client (or operator on their behalf) said this.",
    verified: "An admin has personally confirmed this.",
    inferred: "AI derived this from other stated facts.",
    assumed: "AI guessed with no direct source — needs resolution.",
    contradicted: "A newer signal conflicts with this. Resolve before approval.",
  };
  const src = ref?.kind ? ` · source: ${ref.kind}${ref.quote ? ` — "${truncate(ref.quote, 80)}"` : ""}` : "";
  return `${base[status]}${src}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
