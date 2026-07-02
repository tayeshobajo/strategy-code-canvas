/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateProjectStep } from "@/lib/engine.functions";
import { Loader2, Save, PencilLine, X, Plus, Trash2, Code2, LayoutList } from "lucide-react";
import type { WorkspaceStepKey, Json } from "@/lib/engine-workspace";

type Mode = "form" | "json";

export function StepEditor({
  projectId,
  step,
  data,
}: {
  projectId: string;
  step: Exclude<WorkspaceStepKey, "intelligence">;
  data: Json;
}) {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => data ?? {}, [data]);
  const [value, setValue] = useState<Json>(initial);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [mode, setMode] = useState<Mode>(() => (isEditable(initial) ? "form" : "json"));
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const fn = useServerFn(updateProjectStep);
  const m = useMutation({
    mutationFn: async (payload: Json) =>
      fn({ data: { id: projectId, step, data: payload as Record<string, unknown> } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] });
      setOpen(false);
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => {
          setValue(initial);
          setJsonText(JSON.stringify(initial, null, 2));
          setMode(isEditable(initial) ? "form" : "json");
          setErr(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs text-royal hover:underline"
      >
        <PencilLine className="w-3.5 h-3.5" /> Edit
      </button>
    );
  }

  const save = () => {
    setErr(null);
    if (mode === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        m.mutate(parsed);
      } catch (e) {
        setErr((e as Error).message);
      }
    } else {
      m.mutate(value);
    }
  };

  return (
    <div className="mt-4 border border-border rounded-lg bg-paper-soft p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-[11px]">
          <button
            onClick={() => {
              if (mode === "json") {
                try {
                  setValue(JSON.parse(jsonText));
                  setMode("form");
                  setErr(null);
                } catch (e) {
                  setErr(`Cannot switch to form: ${(e as Error).message}`);
                }
              }
            }}
            className={`px-2 py-1 rounded-sm inline-flex items-center gap-1 ${mode === "form" ? "bg-ink text-white" : "text-ink/70 hover:text-ink"}`}
          >
            <LayoutList className="w-3 h-3" /> Fields
          </button>
          <button
            onClick={() => {
              if (mode === "form") {
                setJsonText(JSON.stringify(value ?? {}, null, 2));
                setMode("json");
              }
            }}
            className={`px-2 py-1 rounded-sm inline-flex items-center gap-1 ${mode === "json" ? "bg-ink text-white" : "text-ink/70 hover:text-ink"}`}
          >
            <Code2 className="w-3 h-3" /> Raw JSON
          </button>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-ink/50 hover:text-ink"
          aria-label="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {mode === "json" ? (
        <textarea
          value={jsonText}
          onChange={(e) => { setJsonText(e.target.value); setErr(null); }}
          rows={16}
          className="w-full font-mono text-xs bg-white border border-border rounded p-3 text-ink"
        />
      ) : (
        <div className="bg-white border border-border rounded p-3 max-h-[560px] overflow-auto">
          <JsonNode value={value} onChange={setValue} depth={0} />
        </div>
      )}

      {err ? <div className="text-xs text-red-700 mt-2">{err}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={m.isPending}
          onClick={save}
          className="inline-flex items-center gap-1.5 bg-royal text-white text-xs px-3 py-1.5 rounded-md hover:bg-royal/90 disabled:opacity-60"
        >
          {m.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-ink/60 hover:text-ink">Cancel</button>
      </div>
    </div>
  );
}

function isEditable(v: Json): boolean {
  return v !== null && typeof v === "object";
}

// Recursive structured editor. Supports objects, arrays, strings, numbers,
// booleans, and null. Long strings render as textareas; nested objects/arrays
// collapse behind an accordion so deep JSON stays readable.
function JsonNode({
  value,
  onChange,
  depth,
  labelHint,
}: {
  value: Json;
  onChange: (v: Json) => void;
  depth: number;
  labelHint?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink/60">
        <span className="italic">null</span>
        <button onClick={() => onChange("")} className="text-royal hover:underline">Set text</button>
        <button onClick={() => onChange({})} className="text-royal hover:underline">Set object</button>
        <button onClick={() => onChange([])} className="text-royal hover:underline">Set list</button>
      </div>
    );
  }
  if (typeof value === "string") {
    const long = value.length > 80 || value.includes("\n");
    return long ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(10, Math.max(3, value.split("\n").length))}
        className="w-full text-sm border border-border rounded p-2 bg-white text-ink"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-border rounded px-2 py-1 bg-white text-ink"
        placeholder={labelHint}
      />
    );
  }
  if (typeof value === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-40 text-sm border border-border rounded px-2 py-1 bg-white text-ink"
      />
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 text-xs text-ink/80">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-royal" />
        {value ? "true" : "false"}
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="flex items-start gap-2 border-l-2 border-border pl-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink/40 mb-1">Item {i + 1}</div>
              <JsonNode
                value={item as Json}
                onChange={(v) => {
                  const next = [...value];
                  next[i] = v;
                  onChange(next);
                }}
                depth={depth + 1}
              />
            </div>
            <button
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-ink/40 hover:text-[#a4283c] mt-0.5"
              aria-label="Remove item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, inferNewItem(value)])}
          className="inline-flex items-center gap-1 text-xs text-royal hover:underline"
        >
          <Plus className="w-3 h-3" /> Add item
        </button>
      </div>
    );
  }
  // Object
  const entries = Object.entries(value);
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <ObjectRow
          key={k}
          k={k}
          v={v as Json}
          depth={depth}
          onChange={(nk, nv) => {
            const next: Record<string, Json> = {};
            for (const [ek, ev] of entries) {
              if (ek === k) next[nk] = nv;
              else next[ek] = ev as Json;
            }
            onChange(next);
          }}
          onDelete={() => {
            const next: Record<string, Json> = {};
            for (const [ek, ev] of entries) if (ek !== k) next[ek] = ev as Json;
            onChange(next);
          }}
        />
      ))}
      <AddFieldButton
        onAdd={(name) => {
          if (!name) return;
          onChange({ ...value, [name]: "" });
        }}
      />
    </div>
  );
}

function inferNewItem(list: Json[]): Json {
  const sample = list[list.length - 1];
  if (sample && typeof sample === "object" && !Array.isArray(sample)) {
    const shape: Record<string, Json> = {};
    for (const [k, v] of Object.entries(sample)) shape[k] = typeof v === "string" ? "" : typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : v === null ? null : {};
    return shape;
  }
  if (typeof sample === "string") return "";
  if (typeof sample === "number") return 0;
  return "";
}

function ObjectRow({
  k, v, depth, onChange, onDelete,
}: {
  k: string;
  v: Json;
  depth: number;
  onChange: (k: string, v: Json) => void;
  onDelete: () => void;
}) {
  const [collapsed, setCollapsed] = useState(depth >= 1 && isComplex(v));
  const complex = isComplex(v);
  return (
    <div className="rounded border border-border/70 bg-paper-soft/50 p-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={k}
          onChange={(e) => onChange(e.target.value, v)}
          className="text-[11px] font-mono uppercase tracking-wider text-ink/70 bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-1 py-0.5 min-w-0 flex-1"
          spellCheck={false}
        />
        {complex && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] text-ink/50 hover:text-ink"
          >
            {collapsed ? "expand" : "collapse"}
          </button>
        )}
        <button onClick={onDelete} className="text-ink/40 hover:text-[#a4283c]" aria-label={`Remove ${k}`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {!collapsed && (
        <div className="mt-2">
          <JsonNode value={v} onChange={(nv) => onChange(k, nv)} depth={depth + 1} labelHint={k} />
        </div>
      )}
    </div>
  );
}

function isComplex(v: Json): boolean {
  return (Array.isArray(v) && v.length > 0) || (v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0);
}

function AddFieldButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1 text-xs text-royal hover:underline"
      >
        <Plus className="w-3 h-3" /> Add field
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onAdd(name.trim()); setName(""); setAdding(false); }
          if (e.key === "Escape") { setName(""); setAdding(false); }
        }}
        placeholder="field_name"
        className="text-xs border border-border rounded px-2 py-1 bg-white"
      />
      <button
        onClick={() => { onAdd(name.trim()); setName(""); setAdding(false); }}
        className="text-xs text-royal hover:underline"
      >Add</button>
      <button
        onClick={() => { setName(""); setAdding(false); }}
        className="text-xs text-ink/50 hover:text-ink"
      >Cancel</button>
    </div>
  );
}
