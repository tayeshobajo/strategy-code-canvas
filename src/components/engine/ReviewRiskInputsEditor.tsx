// Phase H6.5 · I11 — Risk inputs inline editor for review items.
// Persists via updateReviewItemRiskInputs; DB trigger recomputes risk_score.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateReviewItemRiskInputs, type ReviewItem } from "@/lib/engine-ops.functions";

type Props = {
  item: ReviewItem;
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function ReviewRiskInputsEditor({ item }: Props) {
  const qc = useQueryClient();
  const fn = useServerFn(updateReviewItemRiskInputs);

  const [severity, setSeverity] = useState<string>(item.severity ?? "");
  const [impactScore, setImpactScore] = useState<string>(
    item.impact_score != null ? String(item.impact_score) : "",
  );
  const [urgencyScore, setUrgencyScore] = useState<string>(
    item.urgency_score != null ? String(item.urgency_score) : "",
  );
  const [deadlineAt, setDeadlineAt] = useState<string>(
    item.deadline_at ? item.deadline_at.slice(0, 16) : "",
  );
  const [clientRisk, setClientRisk] = useState<boolean>(!!item.client_risk);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { id: item.id };
      payload.severity = severity === "" ? null : severity;
      payload.impact_score = impactScore === "" ? null : Number(impactScore);
      payload.urgency_score = urgencyScore === "" ? null : Number(urgencyScore);
      payload.deadline_at = deadlineAt === "" ? null : new Date(deadlineAt).toISOString();
      payload.client_risk = clientRisk;
      return fn({ data: payload as never });
    },
    onSuccess: (res) => {
      const score = (res as { risk_score: number | null }).risk_score;
      toast.success(`Risk saved · score ${score ?? "—"}`);
      qc.invalidateQueries({ queryKey: ["engine", "global-approvals-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="mt-4 rounded-lg border border-border bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink/60">Risk Inputs</div>
        <RiskBadge score={item.risk_score ?? null} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Field label="Severity">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full text-xs rounded border border-border px-2 py-1"
          >
            <option value="">—</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Impact score (0–100)">
          <input
            type="number"
            min={0}
            max={100}
            value={impactScore}
            onChange={(e) => setImpactScore(e.target.value)}
            className="w-full text-xs rounded border border-border px-2 py-1"
          />
        </Field>
        <Field label="Urgency score (0–100)">
          <input
            type="number"
            min={0}
            max={100}
            value={urgencyScore}
            onChange={(e) => setUrgencyScore(e.target.value)}
            className="w-full text-xs rounded border border-border px-2 py-1"
          />
        </Field>
        <Field label="Deadline">
          <input
            type="datetime-local"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
            className="w-full text-xs rounded border border-border px-2 py-1"
          />
        </Field>
        <Field label="Client-facing risk">
          <label className="inline-flex items-center gap-2 text-xs mt-1">
            <input
              type="checkbox"
              checked={clientRisk}
              onChange={(e) => setClientRisk(e.target.checked)}
              className="h-4 w-4"
            />
            <span>+10 boost</span>
          </label>
        </Field>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="text-[11px] inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save risk inputs
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-ink/50 mb-0.5">{label}</div>
      {children}
    </label>
  );
}

function RiskBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="text-[10px] rounded-full border border-border px-2 py-0.5 text-ink/50">
        risk —
      </span>
    );
  }
  const band =
    score >= 80 ? "bg-red-100 text-red-800 border-red-300"
    : score >= 60 ? "bg-orange-100 text-orange-800 border-orange-300"
    : score >= 35 ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-emerald-100 text-emerald-800 border-emerald-300";
  return (
    <span className={`text-[10px] rounded-full border px-2 py-0.5 font-mono ${band}`}>
      risk {score}
    </span>
  );
}
