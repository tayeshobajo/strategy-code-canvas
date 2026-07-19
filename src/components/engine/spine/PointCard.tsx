import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  MapPin,
  Flag,
  Pencil,
  Loader2,
  X,
} from "lucide-react";
import { useSourceInspector } from "@/hooks/use-source-inspector";
import { getIntelligenceRoomLink, validateIntelligenceAnchor } from "@/lib/intelligence-room-links";
import type { SpineFieldStatus } from "@/lib/spine-contract";
import { coherentPresentation, confidenceLabel } from "@/lib/spine-coherence";
import { proposeSpineFieldChange } from "@/lib/engine-spine-truth.functions";
import { cn } from "@/lib/utils";

type Tone = "approved" | "verified" | "assumption" | "contradiction" | "review" | "draft" | "history";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "approved":
      return "border-[#bfe4ce] bg-[#e7f5ec] text-[#1f6b3b]";
    case "verified":
      return "border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]";
    case "assumption":
      return "border-[#cdd6f3] bg-[#eef3fd] text-[#3E68B2]";
    case "contradiction":
      return "border-[#f3ced5] bg-[#fbe9ec] text-[#a4283c]";
    case "review":
      return "border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713]";
    case "draft":
    case "history":
    default:
      return "border-[#E8E1D6] bg-[#FBF9F4] text-[#667085]";
  }
}

export function PointCard({
  point,
  projectId,
  status,
  bullets,
  sourceCount,
  approvedAt,
  inspectorKey,
  inspectorLabel,
  summary,
  whatChanged,
}: {
  point: "A" | "B";
  projectId: string;
  status: SpineFieldStatus | null;
  bullets: string[];
  sourceCount: number;
  approvedAt: string | null;
  inspectorKey: string;
  inspectorLabel: string;
  summary?: string | null;
  whatChanged?: string | null;
}) {
  const { open } = useSourceInspector();
  const label = point === "A" ? "Point A · Current Reality" : "Point B · Desired Future";
  const subtitle =
    point === "A" ? "Where the business is today" : "Where the business is going";
  const presentation = coherentPresentation(status, bullets.length);
  const confidence = confidenceLabel(status, bullets.length);
  const Icon = point === "A" ? MapPin : Flag;
  const bulletsHeading = point === "A" ? "Key truths" : "Success measures";
  const summaryText = (summary ?? "").trim();
  const trimmedBullets = bullets
    .map((b) => (b.length > 160 ? b.slice(0, 157).trimEnd() + "…" : b))
    .slice(0, 4);

  const [editing, setEditing] = useState(false);

  return (
    <section className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#E8E1D6] bg-white p-6 shadow-[0_1px_0_rgba(10,15,31,0.03),0_12px_32px_-24px_rgba(10,15,31,0.18)] ring-1 ring-[#0A0F1F]/[0.03] transition-shadow hover:shadow-[0_1px_0_rgba(10,15,31,0.04),0_18px_40px_-24px_rgba(10,15,31,0.22)]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A0F1F] via-[#3E68B2] to-[#34C4EB]"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0A0F1F] text-white shadow-sm ring-4 ring-[#eef3fd]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#3E68B2]">
              {point === "A" ? "Point A" : "Point B"}
            </div>
            <div
              className="mt-0.5 truncate text-[22px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              {point === "A" ? "Current reality" : "Desired future"}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[#667085]">{subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
              toneClass(presentation.tone),
            )}
            title={label}
          >
            {presentation.label}
          </span>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D6] bg-white px-2.5 py-1 text-[11px] font-medium text-[#3E68B2] hover:border-[#cdd6f3] hover:bg-[#eef3fd]"
              title={`Propose an edit to ${label}. Goes to the approvals queue.`}
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <PointEditor
          projectId={projectId}
          sectionKey={inspectorKey}
          initialSummary={summaryText}
          initialBullets={bullets}
          initialConfidence={confidence}
          initialSourceCount={sourceCount}
          bulletsHeading={bulletsHeading}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          {/* 1 · Summary */}
          <div className="mt-6">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-px w-6 bg-[#0A0F1F]" />
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
                Summary
              </div>
            </div>
            <p className="mt-2.5 text-[14px] leading-[1.55] text-[#1a2233]">
              {summaryText ? (
                summaryText.length > 240 ? summaryText.slice(0, 237).trimEnd() + "…" : summaryText
              ) : (
                <span
                  className="italic text-[#8a94a6]"
                  style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
                >
                  Not yet summarised.
                </span>
              )}
            </p>
          </div>

          {/* 2 · Key truths / Success measures */}
          <div className="mt-5 flex-1">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-px w-6 bg-[#0A0F1F]" />
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
                {bulletsHeading}
              </div>
            </div>
            <ul className="mt-3 space-y-2.5 text-[14px] leading-[1.55] text-[#1a2233]">
              {trimmedBullets.length ? (
                trimmedBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#1f6b3b]" />
                    <span className="min-w-0 break-words">{b}</span>
                  </li>
                ))
              ) : (
                <li
                  className="text-[15px] italic text-[#8a94a6]"
                  style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
                >
                  Not yet defined.
                </li>
              )}
            </ul>
          </div>

          {/* 3-5 · Confidence · Sources · Approval */}
          <div className="mt-6 grid grid-cols-3 gap-4 rounded-xl border border-[#F0EBE3] bg-[#FBF9F4] px-4 py-3">
            <Meta label="Confidence" value={confidence} />
            <Meta label="Sources" value={String(sourceCount)} />
            <Meta label="Approval" value={approvedAt ? new Date(approvedAt).toLocaleDateString() : "Pending"} />
          </div>

          {/* 6 · What changed */}
          <div className="mt-3 rounded-lg border border-[#F0EBE3] bg-white px-4 py-2.5">
            <div className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
              What changed
            </div>
            <div className="mt-1 text-[12.5px] leading-[1.5] text-[#3f4a5e]">
              {whatChanged?.trim() ? whatChanged : <span className="text-[#8a94a6]">No recent revisions.</span>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#F0EBE3] pt-4 text-[12px]">
            <button
              type="button"
              onClick={() =>
                open({
                  projectId,
                  sectionKey: inspectorKey,
                  fieldKey: "summary",
                  label: inspectorLabel,
                  statement: bullets[0] ?? null,
                })
              }
              className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
            >
              Inspect sources <ArrowRight className="h-3 w-3" />
            </button>
            <Link
              to={point === "A" ? "/engine/projects/$projectId/point-a" : "/engine/projects/$projectId/point-b"}
              params={{ projectId }}
              className="inline-flex items-center gap-1.5 font-semibold text-[#0A0F1F] transition-colors hover:text-[#3E68B2]"
            >
              Open room <ArrowRight className="h-3 w-3" />
            </Link>
            {(() => {
              const link = getIntelligenceRoomLink(point);
              return (
                <Link
                  to={link.to}
                  params={{ projectId }}
                  hash={link.hash}
                  onClick={() => window.setTimeout(() => validateIntelligenceAnchor(link.hash), 50)}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#3E68B2] transition-colors hover:text-[#0A0F1F]"
                >
                  <Brain className="h-3 w-3" /> Intelligence
                </Link>
              );
            })()}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Inline editor. Writes each changed field as a `proposeSpineFieldChange`
 * — never mutates approved truth directly. The approvals queue routes it
 * through the second-reviewer flow per PROJECT_SPINE_CONTRACT §5.
 *
 * Confidence + Sources are annotative fields on the same section, so they
 * are persisted alongside summary/bullets as separate proposals when the
 * value differs from what was loaded.
 */
function PointEditor({
  projectId,
  sectionKey,
  initialSummary,
  initialBullets,
  initialConfidence,
  initialSourceCount,
  bulletsHeading,
  onClose,
}: {
  projectId: string;
  sectionKey: string;
  initialSummary: string;
  initialBullets: string[];
  initialConfidence: string;
  initialSourceCount: number;
  bulletsHeading: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [bulletsText, setBulletsText] = useState(initialBullets.join("\n"));
  const [confidence, setConfidence] = useState(initialConfidence);
  const [sourcesNote, setSourcesNote] = useState("");
  const [reason, setReason] = useState("");

  const proposeFn = useServerFn(proposeSpineFieldChange);
  const qc = useQueryClient();

  const initialBulletsText = initialBullets.join("\n");

  const mutation = useMutation({
    mutationFn: async () => {
      const changes: Array<{ fieldKey: string; newValue: string }> = [];
      if (summary.trim() && summary.trim() !== initialSummary.trim()) {
        changes.push({ fieldKey: "summary", newValue: summary.trim() });
      }
      if (bulletsText.trim() && bulletsText.trim() !== initialBulletsText.trim()) {
        changes.push({
          fieldKey: sectionKey === "point_a" ? "key_truths" : "success_measures",
          newValue: bulletsText.trim(),
        });
      }
      if (confidence.trim() && confidence.trim() !== initialConfidence.trim()) {
        changes.push({ fieldKey: "confidence", newValue: confidence.trim() });
      }
      if (sourcesNote.trim()) {
        changes.push({ fieldKey: "sources_note", newValue: sourcesNote.trim() });
      }
      if (!changes.length) return { submitted: 0 };
      for (const c of changes) {
        await proposeFn({
          data: {
            projectId,
            sectionKey,
            fieldKey: c.fieldKey,
            newValue: c.newValue,
            changeReason: reason.trim() || null,
          },
        });
      }
      return { submitted: changes.length };
    },
    onSuccess: async (res) => {
      if (res.submitted === 0) {
        toast.info("No changes to submit.");
        onClose();
        return;
      }
      toast.success(
        `Submitted ${res.submitted} change${res.submitted === 1 ? "" : "s"} to the approvals queue.`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] }),
        qc.invalidateQueries({ queryKey: ["engine", "spine-status", projectId] }),
      ]);
      onClose();
    },
    onError: (e) => {
      toast.error((e as Error).message || "Could not submit changes.");
    },
  });

  const busy = mutation.isPending;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-[#cdd6f3] bg-[#f5f8ff] px-3 py-2 text-[12px] leading-[1.5] text-[#3f4a5e]">
        Edits are submitted as change proposals. A second reviewer approves
        them before they replace approved truth.
      </div>

      <Field label="Summary">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border border-[#E8E1D6] bg-white px-3 py-2 text-[13.5px] leading-[1.5] text-[#1a2233] focus:border-[#3E68B2] focus:outline-none focus:ring-1 focus:ring-[#3E68B2]/30"
        />
      </Field>

      <Field label={bulletsHeading} hint="One item per line · max 4 shown">
        <textarea
          value={bulletsText}
          onChange={(e) => setBulletsText(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-md border border-[#E8E1D6] bg-white px-3 py-2 text-[13.5px] leading-[1.5] text-[#1a2233] focus:border-[#3E68B2] focus:outline-none focus:ring-1 focus:ring-[#3E68B2]/30"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Confidence">
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="w-full rounded-md border border-[#E8E1D6] bg-white px-3 py-2 text-[13.5px] text-[#1a2233] focus:border-[#3E68B2] focus:outline-none focus:ring-1 focus:ring-[#3E68B2]/30"
          >
            {[confidence, "High", "Medium", "Low", "Assumed", "Verified"]
              .filter((v, i, a) => v && a.indexOf(v) === i)
              .map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label={`Sources (currently ${initialSourceCount})`}
          hint="Add a note or link — attach files via Inspect sources"
        >
          <input
            value={sourcesNote}
            onChange={(e) => setSourcesNote(e.target.value)}
            placeholder="e.g. Founder call · 2026-07-15"
            className="w-full rounded-md border border-[#E8E1D6] bg-white px-3 py-2 text-[13.5px] text-[#1a2233] focus:border-[#3E68B2] focus:outline-none focus:ring-1 focus:ring-[#3E68B2]/30"
          />
        </Field>
      </div>

      <Field label="Reason for change" hint="Shown in the approvals queue">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why does this need updating?"
          className="w-full rounded-md border border-[#E8E1D6] bg-white px-3 py-2 text-[13.5px] text-[#1a2233] focus:border-[#3E68B2] focus:outline-none focus:ring-1 focus:ring-[#3E68B2]/30"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#F0EBE3] pt-4">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0F1F] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a2544] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Submitting…
            </>
          ) : (
            <>Submit for approval</>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D6] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3f4a5e] hover:border-[#cdd6f3]"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.28em] text-[#0A0F1F]">
          {label}
        </span>
        {hint && <span className="text-[10.5px] text-[#8a94a6]">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
        {label}
      </div>
      <div className="mt-1 truncate text-[13.5px] font-semibold tracking-[-0.005em] text-[#0A0F1F]">
        {value}
      </div>
    </div>
  );
}
