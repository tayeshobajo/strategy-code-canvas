/**
 * Compare Versions — diff draft vs approved (or any two versions).
 *
 * Calls compareRoadmapVersions on the server; renders added/changed/removed
 * milestone names. Defaults `from` to the latest approved and `to` to the
 * current draft when available.
 */

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, GitBranch } from "lucide-react";
import { compareRoadmapVersions } from "@/lib/engine-roadmap.functions";

type VersionMeta = {
  id: string;
  label: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
};

type Diff = {
  added: string[];
  changed: string[];
  removed: string[];
  resequenced: string[];
};

export function CompareVersionsModal({
  projectId,
  versions,
  onClose,
}: {
  projectId: string;
  versions: VersionMeta[];
  onClose: () => void;
}) {
  const compareFn = useServerFn(compareRoadmapVersions);
  const defaults = useMemo(() => {
    const approved = versions.find((v) => v.status === "approved");
    const draft = versions.find((v) => v.status === "draft");
    const other = versions.find((v) => v.id !== (approved?.id ?? draft?.id));
    const from = approved ?? other ?? versions[1] ?? null;
    const to = draft ?? versions[0] ?? null;
    return { fromId: from?.id ?? "", toId: to?.id ?? "" };
  }, [versions]);

  const [fromId, setFromId] = useState(defaults.fromId);
  const [toId, setToId] = useState(defaults.toId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!fromId || !toId || fromId === toId) {
        setDiff(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = (await compareFn({
          data: { id: projectId, fromId, toId },
        })) as { diff: Diff };
        if (!cancelled) setDiff(res.diff);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "Compare failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [fromId, toId, projectId, compareFn]);

  const total = diff
    ? diff.added.length + diff.changed.length + diff.removed.length + diff.resequenced.length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compare versions"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-royal" />
            <div className="font-display text-base text-ink">Compare Roadmap Versions</div>
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

        <div className="grid gap-3 border-b border-border bg-muted/30 px-5 py-3 sm:grid-cols-2">
          <label className="text-xs text-ink/70">
            <div className="mb-1 font-mono uppercase tracking-wider text-[10px]">From</div>
            <VersionSelect value={fromId} onChange={setFromId} versions={versions} />
          </label>
          <label className="text-xs text-ink/70">
            <div className="mb-1 font-mono uppercase tracking-wider text-[10px]">To</div>
            <VersionSelect value={toId} onChange={setToId} versions={versions} />
          </label>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm">
          {versions.length < 2 ? (
            <p className="text-ink/60">
              Need at least two roadmap versions to compare. Approve a baseline first.
            </p>
          ) : fromId === toId ? (
            <p className="text-ink/60">Pick two different versions to see the diff.</p>
          ) : busy ? (
            <div className="flex items-center gap-2 text-ink/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Computing diff…
            </div>
          ) : error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800">
              {error}
            </div>
          ) : !diff || total === 0 ? (
            <p className="text-ink/60">No milestone-level changes between these versions.</p>
          ) : (
            <ul className="space-y-3">
              <DiffGroup tone="added" label="Added" items={diff.added} />
              <DiffGroup tone="changed" label="Changed" items={diff.changed} />
              <DiffGroup tone="removed" label="Removed" items={diff.removed} />
              <DiffGroup tone="resequenced" label="Resequenced" items={diff.resequenced} />
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-border bg-muted/40 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-ink hover:border-ink/40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionSelect({
  value,
  onChange,
  versions,
}: {
  value: string;
  onChange: (v: string) => void;
  versions: VersionMeta[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-ink"
    >
      {versions.map((v) => (
        <option key={v.id} value={v.id}>
          {(v.label ?? v.id.slice(0, 6))} · {v.status}
          {v.approved_at ? ` · ${new Date(v.approved_at).toLocaleDateString()}` : ""}
        </option>
      ))}
    </select>
  );
}

function DiffGroup({
  tone,
  label,
  items,
}: {
  tone: "added" | "changed" | "removed" | "resequenced";
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  const toneCls: Record<typeof tone, string> = {
    added: "text-emerald-800 border-emerald-200 bg-emerald-50",
    changed: "text-amber-800 border-amber-200 bg-amber-50",
    removed: "text-rose-800 border-rose-200 bg-rose-50",
    resequenced: "text-sky-800 border-sky-200 bg-sky-50",
  };
  const glyph: Record<typeof tone, string> = {
    added: "+",
    changed: "~",
    removed: "−",
    resequenced: "↕",
  };
  return (
    <li className={`rounded-lg border p-3 ${toneCls[tone]}`}>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider">
        {label} ({items.length})
      </div>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={`${tone}-${i}`} className="text-sm">
            <span className="mr-2 font-mono">{glyph[tone]}</span>
            {it}
          </li>
        ))}
      </ul>
    </li>
  );
}
