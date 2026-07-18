import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWorldEntry,
  saveWorldEntryDraft,
  approveWorldEntry,
  type WorldEntryState,
  type WorldEntryCompetitor,
  type WorldEntryEvidence,
} from "@/lib/engine-world-entry.functions";
import { draftWorldEntryFromIntake } from "@/lib/engine-world-entry-ai.functions";
import {
  getWorldEntryEvidenceUploadUrl,
  getWorldEntryEvidenceDownloadUrl,
  deleteWorldEntryEvidenceFile,
} from "@/lib/engine-world-entry-evidence.functions";
import { downloadWorldEntryPdf } from "@/lib/engine-world-entry-pdf";
import { WorldEntryCommentsThread } from "@/components/engine/WorldEntryCommentsThread";

export const Route = createFileRoute("/engine/projects/$projectId/world-entry")({
  component: WorldEntryPage,
});

type Draft = {
  destination_summary: string;
  competitors: WorldEntryCompetitor[];
  vocabulary: string[];
  evidence: WorldEntryEvidence[];
};

function emptyDraft(): Draft {
  return { destination_summary: "", competitors: [], vocabulary: [], evidence: [] };
}

function fromState(state: WorldEntryState | undefined): Draft {
  if (!state?.current) return emptyDraft();
  const c = state.current;
  return {
    destination_summary: c.destination_summary,
    competitors: c.competitors,
    vocabulary: c.vocabulary,
    evidence: c.evidence,
  };
}

function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function WorldEntryPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const fetchWorldEntry = useServerFn(getWorldEntry);
  const saveDraft = useServerFn(saveWorldEntryDraft);
  const approveFn = useServerFn(approveWorldEntry);
  const draftAiFn = useServerFn(draftWorldEntryFromIntake);

  const { data: state, isLoading } = useQuery({
    queryKey: ["engine", "world-entry", projectId],
    queryFn: () => fetchWorldEntry({ data: { projectId } }),
    staleTime: 15_000,
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosave, setAutosave] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? undefined));
  }, []);

  // Load server state into draft when not dirty
  useEffect(() => {
    if (state && !dirty) setDraft(fromState(state));
  }, [state, dirty]);

  const current = state?.current ?? null;
  const isApproved = current?.status === "approved";
  const isAwaiting = current?.status === "awaiting_review";

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engine", "world-entry", projectId] });

  const runSave = useCallback(
    async (submit: boolean) => {
      setError(null);
      setAutosave("saving");
      try {
        await saveDraft({
          data: {
            projectId,
            destination_summary: draft.destination_summary,
            competitors: draft.competitors,
            vocabulary: draft.vocabulary,
            evidence: draft.evidence.map((e) => ({
              id: e.id,
              label: e.label,
              url: e.url,
              source_id: e.source_id,
              quote: e.quote,
              file_path: e.file_path,
              file_name: e.file_name,
              file_size: e.file_size,
              file_mime: e.file_mime,
            })),
            submit_for_review: submit,
          },
        });
        setDirty(false);
        setAutosave("saved");
        setLastSavedAt(new Date());
        await invalidate();
      } catch (e) {
        setAutosave("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, projectId],
  );

  const saveMut = useMutation({ mutationFn: (submit: boolean) => runSave(submit) });

  // Autosave: debounce 2s after last change, skip when approved
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || isApproved) return;
    setAutosave("pending");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSave(false);
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, dirty, isApproved, runSave]);

  const approveMut = useMutation({
    mutationFn: async (reason: string | undefined) => {
      setError(null);
      if (!current) throw new Error("No draft to approve");
      return await approveFn({ data: { projectId, version: current.version, reason } });
    },
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const draftAiMut = useMutation({
    mutationFn: async () => {
      setError(null);
      return await draftAiFn({ data: { projectId } });
    },
    onSuccess: async (next) => {
      setDraft(fromState(next));
      setDirty(false);
      await invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const readinessMissing = useMemo(() => {
    const missing: string[] = [];
    if (!draft.destination_summary || draft.destination_summary.trim().length < 20) {
      missing.push("Destination summary (≥ 20 chars)");
    }
    if (draft.competitors.length < 3) missing.push(`Competitors (${draft.competitors.length}/3)`);
    if (draft.vocabulary.length < 5) missing.push(`Vocabulary (${draft.vocabulary.length}/5)`);
    if (draft.evidence.length < 1) missing.push("At least one evidence attachment");
    return missing;
  }, [draft]);

  const mutate = (next: Partial<Draft>) => {
    setDraft((prev) => {
      const merged = { ...prev, ...next };
      // Only mark dirty if content actually changed
      if (!draftsEqual(prev, merged)) setDirty(true);
      return merged;
    });
  };

  const handleExportPdf = () => {
    if (!current || current.status !== "approved") return;
    downloadWorldEntryPdf({
      projectName: `Project ${projectId.slice(0, 8)}`,
      approvedAt: current.approved_at,
      version: current,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-sm text-ink/60 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading World Entry…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            Doctrine gate · World first
          </div>
          <h1 className="font-display text-3xl text-ink mt-1">World Entry</h1>
          <p className="text-sm text-ink/60 mt-1 max-w-2xl">
            Confirm the industry destination, competitor landscape, category vocabulary,
            and evidence that anchors every downstream milestone. Requires a second-reviewer
            approval before roadmap synthesis will trust it.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          <StatusBadge status={current?.status} version={current?.version} />
          {current && (
            <div className="text-ink/50">
              Drafted by {current.drafted_by_email} ({current.drafted_by_actor}) ·{" "}
              {new Date(current.drafted_at).toLocaleString()}
            </div>
          )}
          <AutosaveIndicator status={autosave} lastSavedAt={lastSavedAt} disabled={isApproved} />
        </div>
      </header>

      {/* AI + approval bar */}
      <div className="flex flex-wrap gap-2 items-center rounded-lg border border-ink/10 bg-cloud/40 p-3">
        <button
          type="button"
          onClick={() => draftAiMut.mutate()}
          disabled={draftAiMut.isPending || isAwaiting}
          className="inline-flex items-center gap-2 rounded-md bg-royal px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {draftAiMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          AI: Draft from intake
        </button>
        {isAwaiting && (
          <ApproveButton
            onApprove={(reason) => approveMut.mutate(reason)}
            pending={approveMut.isPending}
          />
        )}
        {isApproved && (
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white"
          >
            <Download className="h-4 w-4" /> Export client-safe PDF
          </button>
        )}
        {readinessMissing.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready to submit
          </span>
        ) : (
          <span className="text-xs text-ink/60">
            Missing: {readinessMissing.join(" · ")}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => saveMut.mutate(false)}
            disabled={saveMut.isPending || isApproved || !dirty}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save now"}
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate(true)}
            disabled={saveMut.isPending || isApproved || readinessMissing.length > 0}
            className="rounded-md bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Submit for review
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Destination */}
      <Section title="Industry destination" hint="Where this business is going, in 2-4 sentences.">
        <textarea
          value={draft.destination_summary}
          onChange={(e) => mutate({ destination_summary: e.target.value })}
          disabled={isApproved}
          rows={4}
          className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-royal focus:outline-none"
          placeholder="e.g. Becoming the reference operator for mid-market B2B SaaS onboarding in the next 24 months…"
        />
        <div className="mt-1 text-[11px] text-ink/50">
          {draft.destination_summary.trim().length} chars
        </div>
        <WorldEntryCommentsThread
          projectId={projectId}
          section="destination"
          worldEntryVersion={current?.version ?? 0}
          currentUserEmail={userEmail}
        />
      </Section>

      {/* Competitors */}
      <Section
        title="Competitor review"
        hint="At least 3 relevant competitors. Positioning in one line."
        action={
          <button
            type="button"
            disabled={isApproved}
            onClick={() =>
              mutate({
                competitors: [
                  ...draft.competitors,
                  { id: rid("c"), name: "", positioning: "", why_relevant: "" },
                ],
              })
            }
            className="inline-flex items-center gap-1 text-xs text-royal hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add competitor
          </button>
        }
      >
        <div className="space-y-2">
          {draft.competitors.length === 0 && (
            <div className="text-xs text-ink/50 italic">
              No competitors yet. Use AI draft or add one manually.
            </div>
          )}
          {draft.competitors.map((c, idx) => (
            <div key={c.id} className="grid grid-cols-12 gap-2 rounded-md border border-ink/10 bg-white p-2">
              <input
                value={c.name}
                onChange={(e) => {
                  const copy = [...draft.competitors];
                  copy[idx] = { ...c, name: e.target.value };
                  mutate({ competitors: copy });
                }}
                disabled={isApproved}
                placeholder="Name"
                className="col-span-3 rounded border border-ink/10 px-2 py-1 text-sm"
              />
              <input
                value={c.positioning}
                onChange={(e) => {
                  const copy = [...draft.competitors];
                  copy[idx] = { ...c, positioning: e.target.value };
                  mutate({ competitors: copy });
                }}
                disabled={isApproved}
                placeholder="Positioning"
                className="col-span-4 rounded border border-ink/10 px-2 py-1 text-sm"
              />
              <input
                value={c.why_relevant}
                onChange={(e) => {
                  const copy = [...draft.competitors];
                  copy[idx] = { ...c, why_relevant: e.target.value };
                  mutate({ competitors: copy });
                }}
                disabled={isApproved}
                placeholder="Why relevant"
                className="col-span-4 rounded border border-ink/10 px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={isApproved}
                onClick={() =>
                  mutate({
                    competitors: draft.competitors.filter((x) => x.id !== c.id),
                  })
                }
                className="col-span-1 flex items-center justify-center text-ink/40 hover:text-red-600"
                aria-label="Remove competitor"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <WorldEntryCommentsThread
          projectId={projectId}
          section="competitors"
          worldEntryVersion={current?.version ?? 0}
          currentUserEmail={userEmail}
        />
      </Section>

      {/* Vocabulary */}
      <Section
        title="Category vocabulary"
        hint="5-20 terms operators use inside this category. Press Enter to add."
      >
        <VocabularyEditor
          value={draft.vocabulary}
          disabled={isApproved}
          onChange={(next) => mutate({ vocabulary: next })}
        />
        <WorldEntryCommentsThread
          projectId={projectId}
          section="vocabulary"
          worldEntryVersion={current?.version ?? 0}
          currentUserEmail={userEmail}
        />
      </Section>

      {/* Evidence */}
      <Section
        title="Evidence"
        hint="Attach a URL or upload a file. At least one source note is required."
        action={
          <div className="flex items-center gap-2">
            <EvidenceUploadButton
              projectId={projectId}
              disabled={isApproved}
              onUploaded={(uploaded) =>
                mutate({
                  evidence: [
                    ...draft.evidence,
                    {
                      id: rid("e"),
                      label: uploaded.file_name,
                      file_path: uploaded.path,
                      file_name: uploaded.file_name,
                      file_size: uploaded.file_size,
                      file_mime: uploaded.file_mime,
                      added_by_email: "",
                      added_at: new Date().toISOString(),
                    },
                  ],
                })
              }
            />
            <button
              type="button"
              disabled={isApproved}
              onClick={() =>
                mutate({
                  evidence: [
                    ...draft.evidence,
                    {
                      id: rid("e"),
                      label: "",
                      added_by_email: "",
                      added_at: new Date().toISOString(),
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 text-xs text-royal hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {draft.evidence.length === 0 && (
            <div className="text-xs text-ink/50 italic">No evidence attached yet.</div>
          )}
          {draft.evidence.map((e, idx) => (
            <EvidenceRow
              key={e.id}
              evidence={e}
              projectId={projectId}
              disabled={isApproved}
              onChange={(patch) => {
                const copy = [...draft.evidence];
                copy[idx] = { ...e, ...patch };
                mutate({ evidence: copy });
              }}
              onRemove={() =>
                mutate({ evidence: draft.evidence.filter((x) => x.id !== e.id) })
              }
            />
          ))}
        </div>
        <WorldEntryCommentsThread
          projectId={projectId}
          section="evidence"
          worldEntryVersion={current?.version ?? 0}
          currentUserEmail={userEmail}
        />
      </Section>

      {/* General thread */}
      <Section title="General reviewer notes" hint="Overall feedback not tied to a section.">
        <WorldEntryCommentsThread
          projectId={projectId}
          section="general"
          worldEntryVersion={current?.version ?? 0}
          currentUserEmail={userEmail}
          compact
        />
      </Section>

      {/* History */}
      {state?.history && state.history.length > 0 && (
        <Section title="Version history" hint={`${state.history.length} prior version(s)`}>
          <ul className="space-y-1 text-xs">
            {state.history.slice().reverse().map((v) => (
              <li key={v.version} className="flex justify-between gap-2 border-b border-ink/5 py-1">
                <span>
                  v{v.version} · {v.status}
                  {v.approved_by_email ? ` · approved by ${v.approved_by_email}` : ""}
                </span>
                <span className="text-ink/50">
                  {new Date(v.approved_at ?? v.drafted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-ink">{title}</h2>
          {hint && <p className="text-xs text-ink/50 mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AutosaveIndicator({
  status,
  lastSavedAt,
  disabled,
}: {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  disabled: boolean;
}) {
  if (disabled) return null;
  const stamp = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ink/60">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "pending") {
    return <span className="text-[11px] text-ink/40">Unsaved changes…</span>;
  }
  if (status === "error") {
    return <span className="text-[11px] text-red-600">Autosave failed</span>;
  }
  if (status === "saved" && stamp) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Saved · {stamp}
      </span>
    );
  }
  return null;
}

function StatusBadge({ status, version }: { status?: string; version?: number }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/60">
        No draft yet
      </span>
    );
  }
  const map: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
    drafted: {
      cls: "bg-amber-100 text-amber-800",
      label: `Draft · v${version}`,
      icon: <Clock className="h-3 w-3" />,
    },
    awaiting_review: {
      cls: "bg-blue-100 text-blue-800",
      label: `Awaiting review · v${version}`,
      icon: <Clock className="h-3 w-3" />,
    },
    approved: {
      cls: "bg-emerald-100 text-emerald-800",
      label: `Approved · v${version}`,
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  };
  const cfg = map[status] ?? map.drafted;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ApproveButton({
  onApprove,
  pending,
}: {
  onApprove: (reason: string | undefined) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Approve
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-lg text-ink">Approve World Entry</h3>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4 text-ink/50" />
              </button>
            </div>
            <p className="text-xs text-ink/60 mb-2">
              Second-reviewer rule: you cannot approve a version you drafted.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason / notes (optional)"
              className="w-full rounded-md border border-ink/15 px-2 py-1 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-ink/15 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onApprove(reason.trim() || undefined);
                  setOpen(false);
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white"
              >
                Confirm approval
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VocabularyEditor({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const clean = input.trim();
    if (!clean) return;
    if (value.includes(clean)) {
      setInput("");
      return;
    }
    onChange([...value, clean]);
    setInput("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-xs text-ink"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="text-ink/40 hover:text-red-600"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-ink/40 italic">No terms yet.</span>}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add term and press Enter"
            className="flex-1 rounded border border-ink/15 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={add}
            className="rounded-md border border-ink/20 px-3 py-1 text-sm hover:bg-ink/5"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function EvidenceRow({
  evidence,
  projectId,
  disabled,
  onChange,
  onRemove,
}: {
  evidence: WorldEntryEvidence;
  projectId: string;
  disabled?: boolean;
  onChange: (patch: Partial<WorldEntryEvidence>) => void;
  onRemove: () => void;
}) {
  const downloadFn = useServerFn(getWorldEntryEvidenceDownloadUrl);
  const deleteFileFn = useServerFn(deleteWorldEntryEvidenceFile);
  const [busy, setBusy] = useState(false);

  const openFile = async () => {
    if (!evidence.file_path) return;
    setBusy(true);
    try {
      const { url } = await downloadFn({
        data: { projectId, path: evidence.file_path },
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async () => {
    if (!evidence.file_path) return;
    setBusy(true);
    try {
      await deleteFileFn({ data: { projectId, path: evidence.file_path } });
      onChange({
        file_path: undefined,
        file_name: undefined,
        file_size: undefined,
        file_mime: undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-ink/10 bg-white p-2 space-y-2">
      <div className="grid grid-cols-12 gap-2">
        <input
          value={evidence.label}
          onChange={(ev) => onChange({ label: ev.target.value })}
          disabled={disabled}
          placeholder="Label"
          className="col-span-5 rounded border border-ink/10 px-2 py-1 text-sm"
        />
        <input
          value={evidence.url ?? ""}
          onChange={(ev) => onChange({ url: ev.target.value || undefined })}
          disabled={disabled}
          placeholder="URL (optional)"
          className="col-span-4 rounded border border-ink/10 px-2 py-1 text-sm"
        />
        <input
          value={evidence.source_id ?? ""}
          onChange={(ev) => onChange({ source_id: ev.target.value || undefined })}
          disabled={disabled}
          placeholder="Source id"
          className="col-span-2 rounded border border-ink/10 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="col-span-1 flex items-center justify-center text-ink/40 hover:text-red-600"
          aria-label="Remove evidence"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {evidence.file_path && (
        <div className="flex items-center gap-2 rounded bg-cloud/40 px-2 py-1 text-xs">
          <Paperclip className="h-3 w-3 text-ink/60" />
          <span className="truncate text-ink">{evidence.file_name ?? evidence.file_path}</span>
          {typeof evidence.file_size === "number" && (
            <span className="text-ink/50">
              {(evidence.file_size / 1024).toFixed(1)} KB
            </span>
          )}
          <button
            type="button"
            onClick={openFile}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 text-royal hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={removeFile}
              disabled={busy}
              className="text-ink/50 hover:text-red-600"
              aria-label="Remove file"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <textarea
        value={evidence.quote ?? ""}
        onChange={(ev) => onChange({ quote: ev.target.value || undefined })}
        disabled={disabled}
        placeholder="Quote (optional)"
        rows={2}
        className="w-full rounded border border-ink/10 px-2 py-1 text-sm"
      />
    </div>
  );
}

function EvidenceUploadButton({
  projectId,
  disabled,
  onUploaded,
}: {
  projectId: string;
  disabled?: boolean;
  onUploaded: (u: { path: string; file_name: string; file_size: number; file_mime: string }) => void;
}) {
  const uploadUrlFn = useServerFn(getWorldEntryEvidenceUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const signed = await uploadUrlFn({
        data: { projectId, fileName: file.name, contentType: file.type || undefined },
      });
      const { error: upErr } = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || undefined,
        });
      if (upErr) throw new Error(upErr.message);
      onUploaded({
        path: signed.path,
        file_name: file.name,
        file_size: file.size,
        file_mime: file.type || "application/octet-stream",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-md border border-ink/20 px-2 py-1 text-xs text-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Upload file
      </button>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}
