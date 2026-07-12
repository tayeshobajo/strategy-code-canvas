/**
 * Phase 1 — Epistemic-Status Chip.
 *
 * Presentation + light interaction. Renders the current epistemic status
 * for a spine field (Point A / Point B). When `projectId`, `spine`, and
 * `fieldKey` are provided AND the current user can approve, clicking the
 * chip opens a popover that lets an operator reclassify the field —
 * calling `markSpineFieldStatus` under the hood and invalidating the
 * workspace query on success.
 *
 * Without those props the chip is purely decorative and remains readable
 * for team members / guests / SSR.
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

type Props = {
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

const TONE: Record<EpistemicStatus, { cls: string; label: string; Icon: typeof CheckCircle2; blurb: string }> = {
  stated: {
    cls: "bg-[#e9f4ec] text-[#1f6a34] border-[#c8e4d0]",
    label: "Stated",
    Icon: CheckCircle2,
    blurb: "The client (or an operator on their behalf) said this.",
  },
  verified: {
    cls: "bg-[#e6efff] text-[#1e4bb8] border-[#c9d9f6]",
    label: "Verified",
    Icon: ShieldCheck,
    blurb: "An admin has personally confirmed this.",
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
    blurb: "AI guessed with no direct source — needs resolution.",
  },
  contradicted: {
    cls: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
    label: "Contradicted",
    Icon: AlertOctagon,
    blurb: "A newer signal conflicts with this. Resolve before approval.",
  },
};

export function EpistemicStatusChip({
  status = "inferred",
  sourceRef,
  className,
  size = "sm",
  projectId,
  spine,
  fieldKey,
  fieldLabel,
}: Props) {
  const role = useEngineRole();
  const interactive =
    !!projectId && !!spine && !!fieldKey && role.canApprove && !role.loading;

  const chip = <ChipBody status={status} sourceRef={sourceRef} size={size} className={className} interactive={interactive} />;

  if (!interactive) return chip;

  return (
    <StatusPopover
      status={status}
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
  status,
  sourceRef,
  size,
  className,
  interactive,
}: {
  status: EpistemicStatus;
  sourceRef?: SourceRef;
  size: "sm" | "md";
  className?: string;
  interactive: boolean;
}) {
  const tone = TONE[status];
  const { Icon } = tone;
  const tooltip = buildTooltip(status, sourceRef);
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
  status,
  sourceRef,
  projectId,
  spine,
  fieldKey,
  fieldLabel,
  trigger,
}: {
  status: EpistemicStatus;
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
          sourceRef: {
            kind: "operator_note",
            quote: note.trim() || undefined,
            timestamp: new Date().toISOString(),
          },
        },
      }),
    onSuccess: (_res, next) => {
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] });
      qc.invalidateQueries({
        queryKey: ["engine", "spine-status", projectId, spine],
      });
      toast.success(`Marked ${fieldLabel} as ${next}.`);
      setOpen(false);
      setNote("");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to update status");
    },
  });

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
      <PopoverContent align="end" className="w-72 p-3 space-y-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink/50">
            {spine === "point-a" ? "Point A" : "Point B"} · {fieldLabel}
          </div>
          <div className="text-xs text-ink/70 mt-1">
            Current: <span className="font-medium">{TONE[status].label}</span>
            {sourceRef?.quote ? (
              <div className="mt-1 italic text-ink/60 line-clamp-3">
                “{sourceRef.quote}”
              </div>
            ) : null}
          </div>
        </div>
        <label className="block text-[11px] text-ink/70">
          Note / quote (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this status accurate?"
            className="mt-1 w-full text-xs border border-border rounded px-2 py-1.5 min-h-[52px] focus:outline-none focus:border-royal"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EPISTEMIC_STATUSES.map((s) => {
            const tone = TONE[s];
            const active = s === status;
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
          Operator-only. Changes are audit-logged.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function buildTooltip(status: EpistemicStatus, ref?: SourceRef): string {
  const src = ref?.kind
    ? ` · source: ${ref.kind}${ref.quote ? ` — "${truncate(ref.quote, 80)}"` : ""}`
    : "";
  return `${TONE[status].blurb}${src}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
