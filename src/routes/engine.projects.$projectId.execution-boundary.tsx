import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Plus, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getExecutionBoundary,
  proposeExecutionBoundary,
  approveExecutionBoundary,
  rejectExecutionBoundary,
  aiDraftExecutionBoundary,
  type ExecutionBoundaryState,
  type ExecutionBoundaryVersion,
} from "@/lib/engine-execution-boundary.functions";
import { listCapabilityMenu } from "@/lib/engine-capability-registry.functions";

export const Route = createFileRoute("/engine/projects/$projectId/execution-boundary")({
  component: ExecutionBoundaryPage,
});

type Draft = {
  capability_ids: string[];
  client_owned_areas: string[];
  exclusions: string[];
  notes: string;
};

function emptyDraft(): Draft {
  return { capability_ids: [], client_owned_areas: [], exclusions: [], notes: "" };
}

function fromState(s: ExecutionBoundaryState | undefined): Draft {
  const c = s?.current;
  if (!c) return emptyDraft();
  return {
    capability_ids: c.capability_ids ?? [],
    client_owned_areas: c.client_owned_areas ?? [],
    exclusions: c.exclusions ?? [],
    notes: c.notes ?? "",
  };
}

function ExecutionBoundaryPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const [me, setMe] = useState<string>("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe((data.user?.email ?? "").toLowerCase()));
  }, []);

  const getBoundaryFn = useServerFn(getExecutionBoundary);
  const listMenuFn = useServerFn(listCapabilityMenu);
  const proposeFn = useServerFn(proposeExecutionBoundary);
  const approveFn = useServerFn(approveExecutionBoundary);
  const rejectFn = useServerFn(rejectExecutionBoundary);
  const aiDraftFn = useServerFn(aiDraftExecutionBoundary);

  const stateQuery = useQuery({
    queryKey: ["execution-boundary", projectId],
    queryFn: () => getBoundaryFn({ data: { projectId } }),
    staleTime: 15_000,
  });
  const menuQuery = useQuery({
    queryKey: ["capability-menu"],
    queryFn: () => listMenuFn(),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && stateQuery.data) {
      setDraft(fromState(stateQuery.data));
      setInitialized(true);
    }
  }, [initialized, stateQuery.data]);

  const state = stateQuery.data;
  const current = state?.current ?? null;
  const isProposer = !!current && me && current.proposed_by_email.toLowerCase() === me;
  const canApprove = current?.status === "proposed" && !isProposer;

  const proposeMut = useMutation({
    mutationFn: (submit: boolean) =>
      proposeFn({
        data: {
          projectId,
          capability_ids: draft.capability_ids,
          client_owned_areas: draft.client_owned_areas,
          exclusions: draft.exclusions,
          notes: draft.notes,
          submit_for_review: submit,
        },
      }),
    onSuccess: (next) => {
      qc.setQueryData(["execution-boundary", projectId], next);
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
    },
  });

  const approveMut = useMutation({
    mutationFn: (reason: string | undefined) =>
      approveFn({ data: { projectId, version: current!.version, reason } }),
    onSuccess: (next) => {
      qc.setQueryData(["execution-boundary", projectId], next);
      qc.invalidateQueries({ queryKey: ["engine", "spine-readiness", projectId] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) =>
      rejectFn({ data: { projectId, version: current!.version, reason } }),
    onSuccess: (next) => qc.setQueryData(["execution-boundary", projectId], next),
  });

  const aiDraftMut = useMutation({
    mutationFn: () => aiDraftFn({ data: { projectId } }),
    onSuccess: (next) => {
      qc.setQueryData(["execution-boundary", projectId], next);
      setDraft(fromState(next));
    },
  });

  const menu = menuQuery.data?.capabilities ?? [];
  const menuVersion = menuQuery.data?.version ?? "…";
  const groups = useMemo(() => {
    const g: Record<string, typeof menu> = {};
    for (const c of menu) {
      if (c.retired_at) continue;
      (g[c.category] ||= []).push(c);
    }
    return g;
  }, [menu]);

  const err = proposeMut.error ?? approveMut.error ?? rejectMut.error ?? aiDraftMut.error;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            Doctrine gate
          </div>
          <h1 className="font-display text-2xl text-ink leading-tight">Execution Boundary</h1>
          <p className="text-sm text-ink/70 max-w-2xl mt-1">
            Declare which Trust Tai capabilities are in scope, which areas the client owns,
            and what is explicitly excluded. Requires two-reviewer approval.
          </p>
        </div>
        <StatusPill current={current} />
      </header>

      {err ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
          {(err as Error).message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: capability picker + editors */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display text-base text-ink">Trust Tai capabilities</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
                Menu {menuVersion}
              </span>
            </div>
            {menuQuery.isLoading ? (
              <div className="text-sm text-ink/60 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading capability menu…
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groups).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085] mb-2">
                      {cat.replace(/_/g, " ")}
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((c) => {
                        const checked = draft.capability_ids.includes(c.id);
                        return (
                          <li key={c.id}>
                            <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    capability_ids: e.target.checked
                                      ? Array.from(new Set([...d.capability_ids, c.id]))
                                      : d.capability_ids.filter((x) => x !== c.id),
                                  }))
                                }
                              />
                              <span>
                                <span className="font-medium">{c.label}</span>{" "}
                                <span className="text-[11px] font-mono text-ink/50">
                                  · {c.execution_mode.replace("trust_tai_", "")}
                                </span>
                                <div className="text-[12px] text-ink/60">{c.description}</div>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ChipEditor
            title="Client-owned areas"
            hint="Areas the client explicitly owns and Trust Tai will not do."
            items={draft.client_owned_areas}
            onChange={(items) => setDraft((d) => ({ ...d, client_owned_areas: items }))}
          />
          <ChipEditor
            title="Exclusions"
            hint="Work that is explicitly out of scope — competitor copying, mobile apps, paid media, etc."
            items={draft.exclusions}
            onChange={(items) => setDraft((d) => ({ ...d, exclusions: items }))}
          />
          <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
            <div className="font-display text-base text-ink mb-2">Notes</div>
            <textarea
              className="w-full min-h-[100px] rounded border border-[#E8E1D6] p-2 text-sm"
              placeholder="Context, caveats, and links reviewers should see."
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </div>
        </section>

        {/* Right: status + actions + history */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm space-y-3">
            <div className="font-display text-base text-ink">Actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-[#E8E1D6] px-3 py-1.5 text-sm hover:bg-[#F5EFE4]"
                onClick={() => aiDraftMut.mutate()}
                disabled={aiDraftMut.isPending}
              >
                {aiDraftMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AI draft
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-[#E8E1D6] px-3 py-1.5 text-sm hover:bg-[#F5EFE4]"
                onClick={() => proposeMut.mutate(false)}
                disabled={proposeMut.isPending}
              >
                Save draft
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded bg-[#3E68B2] px-3 py-1.5 text-sm text-white hover:bg-[#31538f]"
                onClick={() => proposeMut.mutate(true)}
                disabled={proposeMut.isPending}
              >
                Propose for approval
              </button>
            </div>
            {current?.status === "proposed" ? (
              <div className="border-t border-[#E8E1D6] pt-3 space-y-2">
                <div className="text-xs text-ink/70">
                  Proposed by <span className="font-mono">{current.proposed_by_email}</span>
                  {current.proposed_by_actor === "ai" ? " (AI-drafted)" : ""}
                </div>
                {isProposer ? (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    You proposed this version. A different admin or operator must approve.
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    disabled={!canApprove || approveMut.isPending}
                    onClick={() => approveMut.mutate(undefined)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border border-rose-200 text-rose-700 px-3 py-1.5 text-sm hover:bg-rose-50"
                    disabled={rejectMut.isPending}
                    onClick={() => {
                      const reason = window.prompt("Reason for rejection?");
                      if (reason && reason.trim()) rejectMut.mutate(reason.trim());
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <VersionHistory state={state} />
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ current }: { current: ExecutionBoundaryVersion | null }) {
  if (!current) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] px-3 py-1 text-xs font-mono uppercase tracking-widest text-ink/60">
        No boundary yet
      </span>
    );
  }
  const map: Record<ExecutionBoundaryVersion["status"], { icon: typeof CheckCircle2; cls: string; label: string }> = {
    draft: { icon: Clock, cls: "border-[#E8E1D6] text-ink/70", label: "Draft" },
    proposed: { icon: Clock, cls: "border-amber-200 bg-amber-50 text-amber-800", label: "Proposed" },
    approved: { icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50 text-emerald-800", label: "Approved" },
    superseded: { icon: Clock, cls: "border-[#E8E1D6] text-ink/50", label: "Superseded" },
  };
  const { icon: Icon, cls, label } = map[current.status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-widest ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      v{current.version} · {label}
    </span>
  );
}

function ChipEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [entry, setEntry] = useState("");
  const add = () => {
    const t = entry.trim();
    if (!t) return;
    if (items.includes(t)) return setEntry("");
    onChange([...items, t]);
    setEntry("");
  };
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-1">{title}</div>
      <div className="text-xs text-ink/60 mb-3">{hint}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.length === 0 ? (
          <span className="text-xs text-ink/40">Nothing added.</span>
        ) : (
          items.map((it) => (
            <span
              key={it}
              className="inline-flex items-center gap-1 rounded-full bg-[#F5EFE4] px-2 py-0.5 text-xs text-ink"
            >
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                aria-label={`Remove ${it}`}
                className="text-ink/50 hover:text-ink"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-[#E8E1D6] px-2 py-1 text-sm"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add and press Enter"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded border border-[#E8E1D6] px-3 py-1 text-sm hover:bg-[#F5EFE4]"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function VersionHistory({ state }: { state: ExecutionBoundaryState | undefined }) {
  const versions = useMemo(() => {
    const all: ExecutionBoundaryVersion[] = [];
    if (state?.current) all.push(state.current);
    for (const h of state?.history ?? []) all.push(h);
    return all.sort((a, b) => b.version - a.version);
  }, [state]);
  return (
    <div className="rounded-2xl border border-[#E8E1D6] bg-white p-4 shadow-sm">
      <div className="font-display text-base text-ink mb-2">Version history</div>
      {versions.length === 0 ? (
        <div className="text-xs text-ink/50">No versions yet.</div>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.version} className="border-t border-[#E8E1D6] pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-mono text-ink">v{v.version}</span>
                <span className="uppercase tracking-widest text-ink/50">{v.status}</span>
              </div>
              <div className="text-[11px] text-ink/60">
                {v.proposed_by_actor === "ai" ? "AI-drafted" : "Human-drafted"} by{" "}
                <span className="font-mono">{v.proposed_by_email}</span>
                {v.approved_by_email ? (
                  <>
                    {" "}
                    · approved by <span className="font-mono">{v.approved_by_email}</span>
                  </>
                ) : null}
              </div>
              <div className="text-[11px] text-ink/60 mt-1">
                {v.capability_ids.length} caps · {v.client_owned_areas.length} client-owned ·{" "}
                {v.exclusions.length} exclusions
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
