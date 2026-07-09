import { useEffect, useState } from "react";
import { AlertTriangle, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatActionDefinition } from "@/lib/engine-chat-actions";

type Props = {
  open: boolean;
  action: ChatActionDefinition | null;
  proposalTitle: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (opts?: { decisionNote?: string }) => void;
};

export function ActionConfirmDialog({ open, action, proposalTitle, busy, onCancel, onConfirm }: Props) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) setNote("");
  }, [open]);
  if (!open || !action) return null;

  const needsNote = action.action_id === "add_internal_decision_note";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      data-qa-role="chat-action-confirm"
      data-qa-action-id={action.action_id}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">Confirm chat action</div>
            <div className="mt-0.5 font-display text-lg text-ink truncate">{action.label}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink/60 hover:text-ink rounded-md p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-3 text-sm text-ink">
          <div className="text-xs text-ink/60 line-clamp-2">
            <span className="text-ink/40">Linked proposal:</span> {proposalTitle}
          </div>
          <p className="leading-relaxed">{action.confirmation_copy}</p>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              This does <strong>not</strong> approve roadmaps, publish to the client portal, send
              client messages, mark tasks complete, or change investment terms.
            </div>
          </div>
          {needsNote && (
            <label className="block">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink/60">
                Decision note (internal)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="What decision are you recording?"
                className="mt-1 w-full resize-none rounded-md border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-royal/60"
              />
            </label>
          )}
          {action.requires_action_mode && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Requires Action Mode
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-ink/80 hover:border-ink/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(needsNote ? { decisionNote: note } : undefined)}
            disabled={busy || (needsNote && !note.trim())}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs text-white",
              "bg-ink hover:bg-ink/90 disabled:opacity-50",
            )}
            data-qa-action="confirm-execute"
          >
            {busy ? "Working…" : `Confirm & ${action.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
