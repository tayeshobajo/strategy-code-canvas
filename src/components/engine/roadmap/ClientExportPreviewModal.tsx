/**
 * Client-safe export preview.
 *
 * Shows a strict preview of what will be shared with the client BEFORE
 * publish. Permission gated: only rendered when
 * permissions.can_publish_client_safe is true. Only surfaces
 * client_safe_summary for phases (never rationale/owner) and public
 * milestone facts (name, phase, due date, status). Internal fields such
 * as blocked_by, agents, and readiness detail are stripped.
 *
 * Publish dispatches a browser event the parent Spine flow listens to
 * (spine:export-roadmap) — the actual publish endpoint is owned there.
 */

import { useState } from "react";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import type {
  RoadmapMilestoneView,
  RoadmapPhase,
  RoadmapVersionMeta,
} from "@/lib/roadmap-view";

export function ClientExportPreviewModal({
  version,
  phases,
  milestones,
  canPublish,
  onClose,
}: {
  version: RoadmapVersionMeta | null;
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  canPublish: boolean;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const approved = version?.status === "approved";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Client-safe export preview"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <div className="font-display text-base text-ink">Publish client-safe roadmap</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-border p-1.5 text-ink hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-muted/30 px-5 py-3 text-xs text-ink/70">
          {approved ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Baseline approved — safe to publish {version?.label ? `(${version.label})` : ""}
            </span>
          ) : (
            <span className="text-amber-800">
              This roadmap is not an approved baseline. Only approved versions should be shared externally.
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 rounded-md border border-border bg-white p-3 text-xs text-ink/60">
            The client sees only what is below. Internal notes, agent activity,
            evidence links, and dependency graphs are stripped.
          </div>

          <div className="space-y-4">
            {phases.length === 0 ? (
              <p className="text-sm text-ink/60">No phases defined — nothing to publish.</p>
            ) : (
              phases.map((p, i) => {
                const ms = milestones.filter((m) => p.milestone_ids.includes(m.id));
                return (
                  <section key={p.key} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
                          Phase {i + 1}
                        </div>
                        <div className="font-display text-sm text-ink">{p.name}</div>
                      </div>
                      {p.start && p.end && (
                        <div className="text-[11px] text-ink/60">
                          {new Date(p.start).toLocaleDateString()} –{" "}
                          {new Date(p.end).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {p.client_safe_summary ? (
                      <p className="mt-1 text-sm text-ink/80">{p.client_safe_summary}</p>
                    ) : p.outcome ? (
                      <p className="mt-1 text-sm text-ink/70">{p.outcome}</p>
                    ) : null}
                    {ms.length > 0 && (
                      <ul className="mt-2 divide-y divide-border rounded-md border border-border/70">
                        {ms.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center justify-between px-3 py-1.5 text-xs"
                          >
                            <span className="truncate text-ink">{m.name}</span>
                            <span className="text-ink/60">
                              {m.due_date
                                ? new Date(m.due_date).toLocaleDateString()
                                : "TBD"}{" "}
                              · {clientSafeStatus(m.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3">
          {canPublish ? (
            <label className="flex items-center gap-2 text-xs text-ink/70">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I've reviewed the preview and it's safe for the client.
            </label>
          ) : (
            <span className="text-xs text-rose-700">
              You don't have permission to publish. Ask an admin to review.
            </span>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canPublish || !confirmed || !approved}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("spine:export-roadmap"));
                onClose();
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-xs text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Publish to client portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function clientSafeStatus(s: string): string {
  switch (s) {
    case "complete":
    case "done":
      return "Complete";
    case "in_progress":
    case "active":
      return "In progress";
    case "blocked":
      return "Paused";
    case "ready":
      return "Ready";
    default:
      return "Planned";
  }
}
