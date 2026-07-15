import { SPINE_READINESS_CHECKS } from "@/lib/spine-contract";
import { CircleDashed } from "lucide-react";

/**
 * Phase 1 (Spine 2.0) — Advisory-only readiness panel. Renders the 14
 * canonical checks as placeholders so operators see the contract on the
 * Spine page. Evaluators land in Phase 3; this component neither blocks
 * nor computes any state.
 */
export function SpineReadinessPanel() {
  return (
    <section
      aria-labelledby="spine-readiness-heading"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
      data-qa-role="spine-readiness"
    >
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2
          id="spine-readiness-heading"
          className="font-display text-lg text-ink leading-tight"
        >
          Spine Readiness
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
          Advisory · evaluators land in Phase 3
        </span>
      </div>
      <p className="text-xs text-ink/60 mb-4 max-w-2xl">
        The Spine is ready when no important uncertainty is hiding — not when every unknown is
        gone. This panel shows the fourteen canonical checks; nothing is blocked yet.
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {SPINE_READINESS_CHECKS.map((check) => (
          <li
            key={check.id}
            className="flex items-start gap-2 rounded-lg border border-border bg-paper-soft/40 px-3 py-2 text-sm text-ink/75"
            data-qa-check={check.id}
          >
            <CircleDashed className="w-4 h-4 mt-0.5 text-ink/40 shrink-0" />
            <span>{check.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
