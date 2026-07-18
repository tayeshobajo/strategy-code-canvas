import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Plus, RotateCcw } from "lucide-react";
import {
  listCapabilityMenu,
  upsertCapability,
  retireCapability,
  type CapabilityRegistryRow,
} from "@/lib/engine-capability-registry.functions";

export const Route = createFileRoute("/admin/capability-registry")({
  component: CapabilityRegistryPage,
});

const CATEGORIES = ["positioning", "content", "audience_capture", "intelligence", "product_ai", "operations"] as const;
const MODES = ["trust_tai_build", "trust_tai_coordinate"] as const;

type Draft = {
  capability_id: string;
  label: string;
  category: (typeof CATEGORIES)[number];
  execution_mode: (typeof MODES)[number];
  description: string;
  bump_version: boolean;
};

function emptyDraft(): Draft {
  return {
    capability_id: "",
    label: "",
    category: "positioning",
    execution_mode: "trust_tai_build",
    description: "",
    bump_version: true,
  };
}

function CapabilityRegistryPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCapabilityMenu);
  const upsertFn = useServerFn(upsertCapability);
  const retireFn = useServerFn(retireCapability);

  const q = useQuery({
    queryKey: ["capability-menu"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const upsertMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          capability_id: draft.capability_id.trim(),
          label: draft.label.trim(),
          category: draft.category,
          execution_mode: draft.execution_mode,
          description: draft.description.trim(),
          bump_version: draft.bump_version,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capability-menu"] });
      setDraft(emptyDraft());
      setEditingId(null);
    },
  });

  const retireMut = useMutation({
    mutationFn: (id: string) => retireFn({ data: { capability_id: id, reason: undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["capability-menu"] }),
  });

  const startEdit = (r: CapabilityRegistryRow) => {
    setEditingId(r.id);
    setDraft({
      capability_id: r.id,
      label: r.label,
      category: r.category,
      execution_mode: r.execution_mode,
      description: r.description,
      bump_version: true,
    });
  };

  const capabilities = q.data?.capabilities ?? [];
  const version = q.data?.version ?? "…";
  const err = upsertMut.error ?? retireMut.error;
  const usingFallback = capabilities.some((c) => c.source === "fallback");

  return (
    <div className="p-6 max-w-6xl mx-auto text-white">
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl">Capability registry</h1>
          <p className="text-sm text-white/60 mt-1">
            Versioned Trust Tai capability menu. Every change bumps the menu version, which
            invalidates downstream synthesis steps.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
          Menu {version}
        </span>
      </header>

      {usingFallback ? (
        <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 text-amber-100 text-xs px-3 py-2">
          Registry table not yet applied — showing the compile-time fallback menu. Writes will
          fail until Tai runs the pending migration.
        </div>
      ) : null}

      {err ? (
        <div className="mb-4 rounded border border-rose-500/30 bg-rose-500/10 text-rose-100 text-sm px-3 py-2">
          {(err as Error).message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Ver</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-white/60">
                    <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…
                  </td>
                </tr>
              ) : capabilities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-white/60">
                    No capabilities.
                  </td>
                </tr>
              ) : (
                capabilities.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="px-3 py-2 font-mono text-[12px]">{c.id}</td>
                    <td className="px-3 py-2">{c.label}</td>
                    <td className="px-3 py-2 text-white/70">{c.category}</td>
                    <td className="px-3 py-2 text-white/70">
                      {c.execution_mode.replace("trust_tai_", "")}
                    </td>
                    <td className="px-3 py-2 font-mono">v{c.version}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="text-xs text-white/70 hover:text-white mr-3"
                        onClick={() => startEdit(c)}
                      >
                        Edit / bump
                      </button>
                      <button
                        className="text-xs text-rose-300 hover:text-rose-200"
                        onClick={() => {
                          if (window.confirm(`Retire ${c.id}?`)) retireMut.mutate(c.id);
                        }}
                        disabled={c.source === "fallback"}
                      >
                        Retire
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <aside className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm">{editingId ? `Bump ${editingId}` : "New capability"}</h2>
            {editingId ? (
              <button
                className="text-xs text-white/60 hover:text-white flex items-center gap-1"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
              >
                <RotateCcw className="w-3 h-3" /> Cancel
              </button>
            ) : null}
          </div>
          <label className="block text-xs text-white/60">
            capability_id
            <input
              className="mt-1 w-full rounded bg-white/5 border border-white/10 px-2 py-1 font-mono text-sm text-white"
              value={draft.capability_id}
              disabled={!!editingId}
              onChange={(e) => setDraft((d) => ({ ...d, capability_id: e.target.value }))}
              placeholder="e.g. web.category_site"
            />
          </label>
          <label className="block text-xs text-white/60">
            Label
            <input
              className="mt-1 w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-white/60">
              Category
              <select
                className="mt-1 w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                value={draft.category}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, category: e.target.value as Draft["category"] }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/60">
              Execution mode
              <select
                className="mt-1 w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                value={draft.execution_mode}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    execution_mode: e.target.value as Draft["execution_mode"],
                  }))
                }
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("trust_tai_", "")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-white/60">
            Description
            <textarea
              className="mt-1 w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-sm text-white min-h-[80px]"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={draft.bump_version}
              onChange={(e) => setDraft((d) => ({ ...d, bump_version: e.target.checked }))}
            />
            Bump version on save
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded bg-amber-500 text-black px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={() => upsertMut.mutate()}
            disabled={
              upsertMut.isPending || !draft.capability_id.trim() || !draft.label.trim() || !draft.description.trim()
            }
          >
            {upsertMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            {editingId ? "Save new version" : "Register"}
          </button>
        </aside>
      </div>
    </div>
  );
}
