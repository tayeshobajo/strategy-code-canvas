// Phase H6.5 · J4 — Impact summary inline editor.
// Admin-only. Persists via updateProposalImpact and re-renders the
// ProposalImpactPanel with the new payload.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, X, Save } from "lucide-react";
import { toast } from "sonner";
import { updateProposalImpact } from "@/lib/engine-ops.functions";
import type { ImpactSummaryInput } from "@/lib/engine-proposal-impact";
import { ProposalImpactPanel, type ProposalImpactSummary } from "@/components/ProposalImpactPanel";

type Props = {
  proposalId: string;
  initial: ProposalImpactSummary | null | undefined;
  canEdit: boolean;
};

const REVERSIBILITY = ["trivial", "reversible", "hard", "irreversible"] as const;

export function ProposalImpactEditor({ proposalId, initial, canEdit }: Props) {
  const qc = useQueryClient();
  const fn = useServerFn(updateProposalImpact);
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState<ProposalImpactSummary>(initial ?? {});
  const [draft, setDraft] = useState<DraftState>(fromSummary(initial ?? {}));

  const mut = useMutation({
    mutationFn: async (payload: ImpactSummaryInput) =>
      fn({ data: { proposalId, impact_summary: payload } }),
    onSuccess: (_res, payload) => {
      setCurrent(payload as ProposalImpactSummary);
      setEditing(false);
      toast.success("Impact summary saved");
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (!editing) {
    return (
      <div className="mt-3 space-y-2">
        <ProposalImpactPanel summary={current} />
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setDraft(fromSummary(current));
              setEditing(true);
            }}
            className="text-[11px] inline-flex items-center gap-1 rounded-md border border-border bg-white/70 px-2 py-1 hover:border-royal/50"
          >
            <Pencil className="w-3 h-3" /> Edit impact
          </button>
        )}
      </div>
    );
  }

  const submit = () => {
    const payload = toSummary(draft);
    mut.mutate(payload);
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-white/60 font-medium">Edit Impact Summary</div>
        <button type="button" onClick={() => setEditing(false)} className="text-white/50 hover:text-white/80">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Field label="Scope">
        <textarea
          value={draft.scope}
          onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
          maxLength={500}
          rows={2}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Budget amount">
          <input
            type="number"
            value={draft.budgetAmount}
            onChange={(e) => setDraft({ ...draft, budgetAmount: e.target.value })}
            className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
          />
        </Field>
        <Field label="Currency">
          <input
            type="text"
            value={draft.budgetCurrency}
            onChange={(e) => setDraft({ ...draft, budgetCurrency: e.target.value })}
            maxLength={8}
            className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
          />
        </Field>
      </div>

      <Field label="Timeline delta (days)">
        <input
          type="number"
          value={draft.timelineDays}
          onChange={(e) => setDraft({ ...draft, timelineDays: e.target.value })}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        />
      </Field>

      <Field label="Dependencies (comma-separated)">
        <input
          type="text"
          value={draft.dependencies}
          onChange={(e) => setDraft({ ...draft, dependencies: e.target.value })}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        />
      </Field>

      <Field label="Client expectations">
        <textarea
          value={draft.clientExpectations}
          onChange={(e) => setDraft({ ...draft, clientExpectations: e.target.value })}
          maxLength={1000}
          rows={2}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        />
      </Field>

      <Field label="Reversibility">
        <select
          value={draft.reversibility}
          onChange={(e) => setDraft({ ...draft, reversibility: e.target.value as DraftState["reversibility"] })}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        >
          <option value="">—</option>
          {REVERSIBILITY.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </Field>

      <Field label="Risks (one per line)">
        <textarea
          value={draft.risks}
          onChange={(e) => setDraft({ ...draft, risks: e.target.value })}
          rows={3}
          className="w-full text-xs rounded border border-border bg-white/90 px-2 py-1"
        />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[11px] rounded-md border border-border px-2 py-1 hover:bg-white/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={mut.isPending}
          className="text-[11px] inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-600 text-white px-2 py-1 hover:bg-emerald-700 disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
    </div>
  );
}

type DraftState = {
  scope: string;
  budgetAmount: string;
  budgetCurrency: string;
  timelineDays: string;
  dependencies: string;
  clientExpectations: string;
  reversibility: "" | "trivial" | "reversible" | "hard" | "irreversible";
  risks: string;
};

function fromSummary(s: ProposalImpactSummary): DraftState {
  return {
    scope: s.scope ?? "",
    budgetAmount: s.budgetDelta ? String(s.budgetDelta.amount) : "",
    budgetCurrency: s.budgetDelta?.currency ?? "USD",
    timelineDays: s.timelineDelta ? String(s.timelineDelta.days) : "",
    dependencies: (s.dependencies ?? []).join(", "),
    clientExpectations: s.clientExpectations ?? "",
    reversibility: (s.reversibility ?? "") as DraftState["reversibility"],
    risks: (s.risks ?? []).join("\n"),
  };
}

function toSummary(d: DraftState): ImpactSummaryInput {
  const budgetNum = d.budgetAmount.trim() === "" ? null : Number(d.budgetAmount);
  const timelineNum = d.timelineDays.trim() === "" ? null : Number(d.timelineDays);
  const deps = d.dependencies.split(",").map((s) => s.trim()).filter(Boolean);
  const risks = d.risks.split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    scope: d.scope.trim() ? d.scope.trim() : null,
    budgetDelta:
      budgetNum !== null && Number.isFinite(budgetNum)
        ? { amount: budgetNum, currency: d.budgetCurrency.trim() || "USD" }
        : null,
    timelineDelta:
      timelineNum !== null && Number.isFinite(timelineNum)
        ? { days: Math.trunc(timelineNum) }
        : null,
    dependencies: deps.length ? deps : null,
    clientExpectations: d.clientExpectations.trim() ? d.clientExpectations.trim() : null,
    reversibility: d.reversibility === "" ? null : d.reversibility,
    risks: risks.length ? risks : null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">{label}</div>
      {children}
    </label>
  );
}
