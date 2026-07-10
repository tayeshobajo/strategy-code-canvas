import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/engine/primitives";
import {
  getSpiritFirstAnalysis,
  runSpiritFirstAnalysis,
  type SpiritFirstAnalysis,
} from "@/lib/engine-spirit-first.functions";

export const Route = createFileRoute("/engine/projects/$projectId/spirit-first")({
  component: SpiritFirstPage,
});

function SpiritFirstPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getSpiritFirstAnalysis);
  const runFn = useServerFn(runSpiritFirstAnalysis);

  const q = useQuery({
    queryKey: ["engine", "spirit-first", projectId],
    queryFn: () => getFn({ data: { projectId } }),
  });

  const run = useMutation({
    mutationFn: () => runFn({ data: { projectId } }),
    onSuccess: async () => {
      toast.success("Spirit First analysis generated");
      await qc.invalidateQueries({ queryKey: ["engine", "spirit-first", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = q.data?.analysis ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Spirit First
          </div>
          <h2 className="font-display text-3xl text-ink mt-1">Operating Identity Analysis</h2>
          <p className="text-sm text-ink/60 mt-1 max-w-2xl">
            Reads the intake brief and surfaces the operator's baseline, thermostat,
            target identity, and daily/weekly operating targets. Grounded in the source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["engine", "spirit-first", projectId] })}
            className="text-[11px] font-mono uppercase tracking-widest text-ink/60 inline-flex items-center gap-1 hover:text-ink"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="inline-flex items-center gap-2 bg-ink text-white text-sm rounded-md px-3 py-2 hover:bg-ink/90 disabled:opacity-50"
          >
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {a ? "Re-run analysis" : "Run Spirit First analysis"}
          </button>
        </div>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-ink/60 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : !a ? (
        <SectionCard title="No analysis yet">
          <p className="text-sm text-ink/70">
            Click <strong>Run Spirit First analysis</strong> to generate one from this project's
            intake brief.
          </p>
        </SectionCard>
      ) : (
        <AnalysisView a={a} />
      )}
    </div>
  );
}

function AnalysisView({ a }: { a: SpiritFirstAnalysis }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="Operating Identity — Baseline">
        <Field label="Current role" value={a.operatingIdentityBaseline?.currentRole} />
        <Field label="Business identity" value={a.operatingIdentityBaseline?.businessIdentity} />
        <Field label="Operational style" value={a.operatingIdentityBaseline?.operationalStyle} />
        <Field label="Decision pattern" value={a.operatingIdentityBaseline?.decisionPattern} />
      </SectionCard>

      <SectionCard title="Identity Thermostat">
        <Field label="Pullback pattern" value={a.identityThermostat?.pullbackPattern} />
        <Field label="Trigger" value={a.identityThermostat?.trigger} />
        <Field label="Default response" value={a.identityThermostat?.defaultResponse} />
        <Field label="Ceiling behavior" value={a.identityThermostat?.ceilingBehavior} />
      </SectionCard>

      <SectionCard title="Future Operating Identity">
        <Field label="Target role" value={a.futureOperatingIdentity?.targetRole} />
        <Field label="Shift required" value={a.futureOperatingIdentity?.shiftRequired} />
        <Field label="New decision pattern" value={a.futureOperatingIdentity?.newDecisionPattern} />
        <Field label="Timeline" value={a.futureOperatingIdentity?.timeline} />
      </SectionCard>

      <SectionCard title="Tension & Trust">
        <Field label="Primary tension" value={a.tensionTrustNotes?.primaryTension} />
        <List label="Trust assets" items={a.tensionTrustNotes?.trustAssets} />
        <List label="Trust deficits" items={a.tensionTrustNotes?.trustDeficits} />
      </SectionCard>

      <SectionCard title="Operating Targets — Daily">
        <List items={a.operatingTargets?.daily} />
      </SectionCard>

      <SectionCard title="Operating Targets — Weekly">
        <List items={a.operatingTargets?.weekly} />
      </SectionCard>

      <div className="lg:col-span-2">
        <SectionCard title="Evidence Ledger">
          <ul className="space-y-2">
            {(a.evidenceLedger ?? []).map((row, i) => (
              <li key={i} className="rounded border border-ink/10 bg-white/60 p-3 text-sm">
                <div className="font-medium text-ink">{row.claim}</div>
                <div className="text-ink/70 text-xs mt-1">Evidence: {row.evidence}</div>
                <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-ink/50">
                  Confidence: {row.confidence}
                </div>
              </li>
            ))}
            {(a.evidenceLedger ?? []).length === 0 && (
              <li className="text-sm text-ink/50">No evidence recorded.</li>
            )}
          </ul>
        </SectionCard>
      </div>

      {a.generated_at && (
        <div className="lg:col-span-2 text-[11px] text-ink/50">
          Generated {new Date(a.generated_at).toLocaleString()}
          {a.generated_by_email ? ` by ${a.generated_by_email}` : ""}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50">{label}</div>
      <div className="text-sm text-ink/90">{value || "—"}</div>
    </div>
  );
}

function List({ label, items }: { label?: string; items?: string[] }) {
  return (
    <div className="mb-2">
      {label && (
        <div className="text-[10px] font-mono uppercase tracking-widest text-ink/50">{label}</div>
      )}
      {items && items.length ? (
        <ul className="list-disc pl-5 text-sm text-ink/90 space-y-1">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-ink/50">—</div>
      )}
    </div>
  );
}
