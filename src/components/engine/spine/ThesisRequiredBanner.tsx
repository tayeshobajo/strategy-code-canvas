import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Blocking banner surfaced when the roadmap has been drafted/approved but
 * the Strategic Thesis is still missing or unapproved. See
 * doctrine/PROJECT_SPINE_CONTRACT.md — the thesis is the "why" that
 * qualifies the roadmap.
 */
export function ThesisRequiredBanner({ projectId }: { projectId: string }) {
  return (
    <section
      role="alert"
      className="flex flex-wrap items-start gap-4 rounded-2xl border border-[#f1e3b9] bg-gradient-to-br from-[#fbf3e0] via-white to-white p-5 shadow-sm"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#f1e3b9] bg-white text-[#8a6713]">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8a6713]">
          Strategic Thesis Required
        </div>
        <h3
          className="mt-1 text-[20px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
          style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
        >
          The roadmap should not be treated as operational until the strategic bet is approved.
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-[#3f4a5e]">
          Approve the Strategic Thesis to explain <em>why this project exists</em>, <em>why this direction</em>, and <em>what Trust Tai vs. the client owns</em>. Milestones remain drafts until then.
        </p>
      </div>
      <Link
        to="/engine/projects/$projectId/strategic-thesis"
        params={{ projectId }}
        className="inline-flex items-center gap-1.5 self-center rounded-full bg-[#0A0F1F] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#1c2440]"
      >
        Open Thesis room <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
