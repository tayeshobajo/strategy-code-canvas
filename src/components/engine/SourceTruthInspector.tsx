import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSourceInspector } from "@/hooks/use-source-inspector";
import {
  getSourceInspection,
  type SourceInspectionPayload,
} from "@/lib/engine-source-inspection.functions";
import {
  proposeSpineFieldChange,
  getSpineFieldHistory,
  type SpineFieldHistoryEntry,
} from "@/lib/engine-spine-truth.functions";
import { ArrowRight, FileText, ShieldCheck, AlertTriangle, Clock, Sparkles, PencilLine } from "lucide-react";

/**
 * Sprint 1 · Wave 1 — Global Source & Truth Inspector drawer.
 * Rendered once at the engine layout level; opened by any component that
 * calls `useSourceInspector().open({ projectId, sectionKey, fieldKey })`.
 */
export function SourceTruthInspector() {
  const { target, close } = useSourceInspector();
  const fetchFn = useServerFn(getSourceInspection);

  const q = useQuery({
    queryKey: [
      "engine",
      "source-inspection",
      target?.projectId ?? "",
      target?.sectionKey ?? "",
      target?.fieldKey ?? "",
    ],
    queryFn: () =>
      fetchFn({
        data: {
          projectId: target!.projectId,
          sectionKey: target!.sectionKey,
          fieldKey: target!.fieldKey,
        },
      }),
    enabled: !!target,
    staleTime: 30_000,
  });

  const payload = (q.data as { inspection: SourceInspectionPayload } | undefined)?.inspection;

  return (
    <Sheet open={!!target} onOpenChange={(v) => (v ? null : close())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto bg-[#FBF9F4] p-0"
        data-qa-role="source-truth-inspector"
      >
        <div className="border-b border-[#E8E1D6] bg-white px-5 py-4">
          <SheetHeader className="space-y-1 text-left">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
              Source & Truth Inspector
            </div>
            <SheetTitle className="font-display text-lg leading-tight text-[#0A0F1F]">
              {target?.label ?? target?.statement ?? "Approved statement"}
            </SheetTitle>
          </SheetHeader>
          {target?.statement ? (
            <p className="mt-2 text-sm text-[#3f4a63]">{target.statement}</p>
          ) : null}
        </div>

        {!target ? null : q.isPending ? (
          <div className="p-5 text-sm text-[#667085]">Loading provenance…</div>
        ) : q.isError || !payload ? (
          <div className="p-5 text-sm text-red-700">
            Could not load evidence for this statement.
          </div>
        ) : (
          <InspectorBody
            payload={payload}
            projectId={target.projectId}
            sectionKey={target.sectionKey}
            fieldKey={target.fieldKey}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function InspectorBody({
  payload,
  projectId,
  sectionKey,
  fieldKey,
}: {
  payload: SourceInspectionPayload;
  projectId: string;
  sectionKey: string;
  fieldKey: string;
}) {
  return (
    <div className="space-y-5 p-5">
      <StatusStrip payload={payload} />
      <ProposeChangePanel
        projectId={projectId}
        sectionKey={sectionKey}
        fieldKey={fieldKey}
        currentStatement={payload.statement ?? ""}
      />


      <Card icon={<FileText className="h-3.5 w-3.5 text-[#3E68B2]" />} title="Source excerpts">
        {payload.excerpts.length === 0 ? (
          <EmptyLine text="No source excerpts captured yet." />
        ) : (
          <ul className="space-y-3">
            {payload.excerpts.map((s) => (
              <li key={s.id} className="rounded-lg border border-[#E8E1D6] bg-white p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs font-medium text-[#0A0F1F]">
                    {s.source_title ?? "Untitled source"}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#667085]">
                    {s.source_kind}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[#3f4a63] whitespace-pre-line line-clamp-6">
                  {s.excerpt}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#667085]">
                  <span>
                    {s.captured_at
                      ? new Date(s.captured_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  {s.confidence != null ? <span>Confidence · {s.confidence}%</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {payload.captain_interpretation ? (
        <Card icon={<Sparkles className="h-3.5 w-3.5 text-[#3E68B2]" />} title="Captain interpretation">
          <p className="text-sm text-[#3f4a63] whitespace-pre-line">
            {payload.captain_interpretation}
          </p>
        </Card>
      ) : null}

      {payload.assumptions.length ? (
        <Card icon={<ShieldCheck className="h-3.5 w-3.5 text-[#1f6b3b]" />} title="Accepted assumptions">
          <ul className="list-disc pl-5 text-sm text-[#3f4a63] space-y-1">
            {payload.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {payload.contradictions.length ? (
        <Card icon={<AlertTriangle className="h-3.5 w-3.5 text-[#a4283c]" />} title="Contradictions">
          <ul className="list-disc pl-5 text-sm text-[#a4283c] space-y-1">
            {payload.contradictions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {payload.related_roadmap_items.length ? (
        <Card icon={<ArrowRight className="h-3.5 w-3.5 text-[#3E68B2]" />} title="Referenced in">
          <ul className="text-sm text-[#0A0F1F] space-y-1">
            {payload.related_roadmap_items.map((r) => (
              <li key={r.id}>· {r.label}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card icon={<Clock className="h-3.5 w-3.5 text-[#667085]" />} title="Provenance">
        <dl className="grid grid-cols-2 gap-y-1 text-xs text-[#3f4a63]">
          <dt className="text-[#667085]">Updated</dt>
          <dd>{payload.updated_at ? new Date(payload.updated_at).toLocaleString() : "—"}</dd>
          <dt className="text-[#667085]">Updated by</dt>
          <dd>{payload.updated_by ?? "—"}</dd>
          <dt className="text-[#667085]">Approved</dt>
          <dd>{payload.approved_at ? new Date(payload.approved_at).toLocaleString() : "—"}</dd>
          <dt className="text-[#667085]">Approved by</dt>
          <dd>{payload.approved_by ?? "—"}</dd>
          <dt className="text-[#667085]">Version</dt>
          <dd>{payload.version ?? "—"}</dd>
        </dl>
      </Card>

      {payload.audit.length ? (
        <Card icon={<Clock className="h-3.5 w-3.5 text-[#667085]" />} title="Recent activity">
          <ul className="space-y-2">
            {payload.audit.slice(0, 5).map((a) => (
              <li key={a.id} className="text-xs text-[#3f4a63]">
                <span className="font-mono uppercase tracking-wider text-[10px] text-[#667085] mr-2">
                  {a.action}
                </span>
                {a.summary ?? "—"}
                {a.actor_email ? <span className="text-[#667085]"> · {a.actor_email}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {payload.deep_link ? (
        <Link
          to={payload.deep_link as "/engine/projects/$projectId/point-a"}
          params={{ projectId }}
          className="inline-flex items-center gap-1 rounded-full border border-[#0A0F1F] bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1c2440]"
        >
          Open source room
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function StatusStrip({ payload }: { payload: SourceInspectionPayload }) {
  const statusStyles: Record<SourceInspectionPayload["status"], string> = {
    approved_truth: "bg-[#e9f5ee] text-[#1f6b3b] border-[#c9e6d3]",
    verified: "bg-[#e9f5ee] text-[#1f6b3b] border-[#c9e6d3]",
    accepted_assumption: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    inferred: "bg-[#eef3fb] text-[#3E68B2] border-[#d5e0f2]",
    needs_confirmation: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
    contradictory: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
    draft: "bg-white text-[#667085] border-[#E8E1D6]",
    superseded: "bg-white text-[#667085] border-[#E8E1D6]",
    unknown: "bg-white text-[#667085] border-[#E8E1D6]",
  };
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono uppercase tracking-[0.18em] ${statusStyles[payload.status]}`}
      >
        {payload.status.replace(/_/g, " ")}
      </span>
      <span className="text-[#667085]">
        {payload.source_count} source{payload.source_count === 1 ? "" : "s"}
      </span>
      {payload.confidence != null ? (
        <span className="text-[#667085]">Confidence · {payload.confidence}%</span>
      ) : null}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D6] bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-sm italic text-[#667085]">{text}</div>;
}

/* ─────── Wave 2 · Propose change to a spine statement ─────── */

function ProposeChangePanel({
  projectId,
  sectionKey,
  fieldKey,
  currentStatement,
}: {
  projectId: string;
  sectionKey: string;
  fieldKey: string;
  currentStatement: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentStatement);
  const [reason, setReason] = useState("");
  const [flash, setFlash] = useState<null | { kind: "ok" | "err"; msg: string }>(null);
  const proposeFn = useServerFn(proposeSpineFieldChange);
  const historyFn = useServerFn(getSpineFieldHistory);
  const qc = useQueryClient();

  const historyKey = ["engine", "spine-field-history", projectId, sectionKey, fieldKey];
  const historyQ = useQuery({
    queryKey: historyKey,
    queryFn: () =>
      historyFn({ data: { projectId, sectionKey, fieldKey } }),
    staleTime: 15_000,
  });

  const propose = useMutation({
    mutationFn: (input: { newValue: string; changeReason: string }) =>
      proposeFn({
        data: {
          projectId,
          sectionKey,
          fieldKey,
          newValue: input.newValue,
          changeReason: input.changeReason || null,
        },
      }),
    onSuccess: async () => {
      setFlash({ kind: "ok", msg: "Change proposed — appears in the Approvals Queue." });
      setReason("");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: historyKey });
    },
    onError: (e: unknown) =>
      setFlash({ kind: "err", msg: (e as Error)?.message ?? "Could not submit proposal." }),
  });

  const history = (historyQ.data as { history: SpineFieldHistoryEntry[] } | undefined)?.history ?? [];

  return (
    <section className="rounded-xl border border-[#E8E1D6] bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          <PencilLine className="h-3.5 w-3.5 text-[#3E68B2]" />
          Propose a change
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setValue(currentStatement);
              setOpen(true);
              setFlash(null);
            }}
            className="rounded-full border border-[#0A0F1F] px-3 py-1 text-xs font-medium text-[#0A0F1F] hover:bg-[#FBF9F4]"
          >
            Propose edit
          </button>
        ) : null}
      </div>

      {flash ? (
        <div
          className={
            flash.kind === "ok"
              ? "mb-2 rounded-md bg-[#e9f5ee] px-2 py-1 text-xs text-[#1f6b3b]"
              : "mb-2 rounded-md bg-[#fbe9ec] px-2 py-1 text-xs text-[#a4283c]"
          }
        >
          {flash.msg}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2">
          <label className="block text-[11px] font-mono uppercase tracking-[0.22em] text-[#667085]">
            Revised statement
          </label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-[#E8E1D6] bg-white p-2 text-sm text-[#0A0F1F] focus:border-[#3E68B2] focus:outline-none"
            placeholder="Type the revised approved statement…"
          />
          <label className="block text-[11px] font-mono uppercase tracking-[0.22em] text-[#667085]">
            Reason for change (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-[#E8E1D6] bg-white p-2 text-sm text-[#3f4a63] focus:border-[#3E68B2] focus:outline-none"
            placeholder="Why does this change?"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={propose.isPending || !value.trim() || value.trim() === currentStatement.trim()}
              onClick={() => propose.mutate({ newValue: value.trim(), changeReason: reason.trim() })}
              className="inline-flex items-center rounded-full bg-[#0A0F1F] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1c2440] disabled:opacity-50"
            >
              {propose.isPending ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-[#667085] hover:text-[#0A0F1F]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          Change history
        </div>
        {historyQ.isPending ? (
          <div className="text-xs text-[#667085]">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="text-xs italic text-[#667085]">
            No proposed changes recorded for this statement.
          </div>
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 6).map((h) => (
              <li key={`${h.source}-${h.id}`} className="rounded-md border border-[#E8E1D6] bg-[#FBF9F4] p-2 text-xs text-[#3f4a63]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-[#667085]">
                    {h.status}
                  </span>
                  <span className="text-[10px] text-[#667085]">
                    {new Date(h.created_at).toLocaleString()}
                  </span>
                </div>
                {h.new_value ? (
                  <div className="mt-1 text-[#0A0F1F] line-clamp-3">{h.new_value}</div>
                ) : null}
                {h.change_reason ? (
                  <div className="mt-0.5 text-[#667085] line-clamp-2">{h.change_reason}</div>
                ) : null}
                {h.actor_email ? (
                  <div className="mt-0.5 text-[10px] text-[#667085]">by {h.actor_email}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

