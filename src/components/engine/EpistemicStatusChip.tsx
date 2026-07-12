/**
 * Phase 1 (Revision R2) — Epistemic-Status Chip.
 *
 * Presentation + light interaction with the 8-value truth model.
 *
 * Key R2 changes:
 *  - `status` is now optional; when absent the chip renders a NEUTRAL
 *    "unclassified" state instead of pretending the field is `inferred`.
 *  - Popover exposes all 8 statuses. The client sends a `sourceRef` shape
 *    matching the selected status; the server enriches with
 *    `operator_confirmed_by` and validates evidence.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Sparkles,
  HelpCircle,
  AlertOctagon,
  ShieldCheck,
  Loader2,
  CircleDashed,
  CircleSlash,
  Clock,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  EPISTEMIC_STATUSES,
  markSpineFieldStatus,
  type EpistemicStatus,
  type SourceRef,
} from "@/lib/engine-epistemic.functions";
import { useEngineRole } from "@/hooks/useEngineRole";

type Spine = "point-a" | "point-b";

/** UI-only sentinel for "no status recorded". Never persisted. */
const UNCLASSIFIED = "unclassified" as const;
type DisplayStatus = EpistemicStatus | typeof UNCLASSIFIED;

type Props = {
  /** Undefined = neutral "unclassified" pill; never defaulted to inferred. */
  status?: EpistemicStatus;
  sourceRef?: SourceRef;
  className?: string;
  size?: "sm" | "md";
  /** Interactive-mode identifiers. All three required to unlock the popover. */
  projectId?: string;
  spine?: Spine;
  fieldKey?: string;
  /** Human label shown in the popover heading. Falls back to `fieldKey`. */
  fieldLabel?: string;
};

type Tone = { cls: string; label: string; Icon: LucideIcon; blurb: string };

const TONE: Record<DisplayStatus, Tone> = {
  unclassified: {
    cls: "bg-white text-ink/60 border-dashed border-ink/25",
    label: "No status",
    Icon: CircleDashed,
    blurb: "No epistemic status recorded yet.",
  },
  stated: {
    cls: "bg-[#e9f4ec] text-[#1f6a34] border-[#c8e4d0]",
    label: "Stated",
    Icon: CheckCircle2,
    blurb: "The client (or an operator on their behalf) said this.",
  },
  inferred: {
    cls: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]",
    label: "Inferred",
    Icon: Sparkles,
    blurb: "AI derived this from other stated facts.",
  },
  assumed: {
    cls: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    label: "Assumed",
    Icon: HelpCircle,
    blurb: "Accepted working assumption — not proven.",
  },
  missing: {
    cls: "bg-[#f6ecec] text-[#6b3a3a] border-[#e3ccc9]",
    label: "Missing",
    Icon: CircleSlash,
    blurb: "Material info is absent — a known gap in the spine.",
  },
  contradicted: {
    cls: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
    label: "Contradicted",
    Icon: AlertOctagon,
    blurb: "Conflicts with another recorded source. Resolve before approval.",
  },
  needs_confirmation: {
    cls: "bg-[#fff4d9] text-[#6b4a12] border-[#f2dfa5]",
    label: "Needs confirmation",
    Icon: Clock,
    blurb: "Candidate truth — waiting on human sign-off.",
  },
  verified: {
    cls: "bg-[#e6efff] text-[#1e4bb8] border-[#c9d9f6]",
    label: "Verified",
    Icon: ShieldCheck,
    blurb: "Evidence supports it (source + quote/timestamp or evidence id).",
  },
  approved_truth: {
    cls: "bg-[#e6f6ee] text-[#0f5b39] border-[#bfe4cf]",
    label: "Approved truth",
    Icon: BadgeCheck,
    blurb: "A human with authority promoted it into the Project Spine.",
  },
};

export function EpistemicStatusChip({
  status,
  sourceRef,
  className,
  size = "sm",
  projectId,
  spine,
  fieldKey,
  fieldLabel,
}: Props) {
  const role = useEngineRole();
  const display: DisplayStatus = status ?? UNCLASSIFIED;
  const interactive =
    !!projectId && !!spine && !!fieldKey && role.canApprove && !role.loading;

  const chip = (
    <ChipBody
      display={display}
      sourceRef={sourceRef}
      size={size}
      className={className}
      interactive={interactive}
    />
  );

  if (!interactive) return chip;

  return (
    <StatusPopover
      display={display}
      sourceRef={sourceRef}
      projectId={projectId!}
      spine={spine!}
      fieldKey={fieldKey!}
      fieldLabel={fieldLabel ?? fieldKey!}
      trigger={chip}
    />
  );
}

function ChipBody({
  display,
  sourceRef,
  size,
  className,
  interactive,
}: {
  display: DisplayStatus;
  sourceRef?: SourceRef;
  size: "sm" | "md";
  className?: string;
  interactive: boolean;
}) {
  const tone = TONE[display];
  const { Icon } = tone;
  const tooltip = buildTooltip(display, sourceRef);
  const dims =
    size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-[11px] px-2 py-1 gap-1.5";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center font-mono uppercase tracking-wider border rounded",
        dims,
        tone.cls,
        interactive && "cursor-pointer hover:brightness-95 transition",
        className,
      )}
      aria-label={`Epistemic status: ${tone.label}${interactive ? " (click to change)" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

function StatusPopover({
  display,
  sourceRef,
  projectId,
  spine,
  fieldKey,
  fieldLabel,
  trigger,
}: {
  display: DisplayStatus;
  sourceRef?: SourceRef;
  projectId: string;
  spine: Spine;
  fieldKey: string;
  fieldLabel: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const fn = useServerFn(markSpineFieldStatus);
  const m = useMutation({
    mutationFn: async (next: EpistemicStatus) =>
      fn({
        data: {
          projectId,
          spine,
          fieldKey,
          status: next,
          sourceRef: buildOperatorSourceRef(next, note),
        },
      }),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] });
      qc.invalidateQueries({
        queryKey: ["engine", "spine-status", projectId, spine],
      });
      toast.success(`Marked ${fieldLabel} as ${TONE[next].label}.`);
      setOpen(false);
      setNote("");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to update status");
    },
  });

  const currentLabel = TONE[display].label;
  const helpText = HELP_PER_STATUS_HINT;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex align-middle"
          disabled={m.isPending}
          onClick={(e) => e.stopPropagation()}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
            {spine === "point-a" ? "Point A" : "Point B"} · {fieldLabel}
          </div>
          <div className="text-xs text-ink/70 mt-1">
            Current: <span className="font-medium">{currentLabel}</span>
            {sourceRef?.quote ? (
              <div className="mt-1 italic text-ink/60 line-clamp-3">
                “{sourceRef.quote}”
              </div>
            ) : null}
            {sourceRef?.reason && !sourceRef.quote ? (
              <div className="mt-1 italic text-ink/60 line-clamp-3">
                {sourceRef.reason}
              </div>
            ) : null}
          </div>
        </div>
        <label className="block text-[11px] text-ink/70">
          Note / quote / reason
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Recommended for verified, contradicted, needs_confirmation, approved_truth."
            className="mt-1 w-full text-xs border border-border rounded px-2 py-1.5 min-h-[52px] focus:outline-none focus:border-royal"
          />
          <span className="block mt-1 text-[10px] text-ink/50">{helpText}</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EPISTEMIC_STATUSES.map((s) => {
            const tone = TONE[s];
            const active = s === display;
            return (
              <button
                key={s}
                type="button"
                disabled={m.isPending || active}
                onClick={() => m.mutate(s)}
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-1 transition",
                  tone.cls,
                  active
                    ? "opacity-60 cursor-default"
                    : "hover:brightness-95 hover:ring-1 hover:ring-royal/30",
                  m.isPending && !active && "opacity-50 cursor-wait",
                )}
                title={tone.blurb}
              >
                {m.isPending && !active ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <tone.Icon className="w-3 h-3" />
                )}
                {tone.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-ink/50 leading-snug">
          Operator override — your action is recorded as
          <code className="mx-1">operator_confirmed_by</code> in the source ref.
          All changes are audit-logged.
        </p>
      </PopoverContent>
    </Popover>
  );
}

const HELP_PER_STATUS_HINT =
  "stated → cite the intake/transcript. contradicted → describe the conflict. approved_truth → note the authorization. missing → describe the gap.";

/**
 * Client-side builder for the operator-driven `sourceRef`. The server
 * enriches with `operator_confirmed_by` and validates against per-status
 * evidence rules. Human operator writes qualify via the "operator override"
 * branch, so quotes/reasons here are informational but recommended.
 */
function buildOperatorSourceRef(status: EpistemicStatus, note: string): SourceRef {
  const clean = note.trim();
  const nowIso = new Date().toISOString();
  const base = { timestamp: nowIso, quote: clean || undefined };
  switch (status) {
    case "stated":
      return { kind: "operator_note", ...base };
    case "inferred":
      // Human override for inferred — server injects operator_confirmed_by.
      return { kind: "operator_note", ...base };
    case "assumed":
      return {
        kind: "working_assumption",
        rationale: clean || "Accepted by operator",
        ...base,
      };
    case "missing":
      return { kind: "gap_note", reason: clean || "Flagged missing by operator", timestamp: nowIso };
    case "contradicted":
      return {
        kind: "conflict",
        reason: clean || "Operator flagged contradiction",
        timestamp: nowIso,
      };
    case "needs_confirmation":
      return {
        kind: "operator_note",
        reason: clean || "Awaiting human confirmation",
        ...base,
      };
    case "verified":
      return { kind: "operator_note", ...base };
    case "approved_truth":
      return {
        kind: "operator_note",
        approval_kind: "operator_override",
        ...base,
      };
  }
}

function buildTooltip(display: DisplayStatus, ref?: SourceRef): string {
  if (display === UNCLASSIFIED) return TONE.unclassified.blurb;
  const src = ref?.kind
    ? ` · source: ${ref.kind}${ref.quote ? ` — "${truncate(ref.quote, 80)}"` : ""}`
    : "";
  return `${TONE[display].blurb}${src}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
