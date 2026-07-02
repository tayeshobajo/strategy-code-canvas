import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateProjectStep } from "@/lib/engine.functions";
import { Loader2, Save, PencilLine, X } from "lucide-react";
import type { WorkspaceStepKey, Json } from "@/lib/engine-workspace";

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
  const [text, setText] = useState(() => JSON.stringify(data ?? {}, null, 2));
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-royal hover:underline"
      >
        <PencilLine className="w-3.5 h-3.5" /> Edit
      </button>
    );
  }
  return (
    <div className="mt-4 border border-border rounded-lg bg-paper-soft p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-mono uppercase tracking-wider text-ink/60">JSON editor</div>
        <button
          onClick={() => setOpen(false)}
          className="text-ink/50 hover:text-ink"
          aria-label="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr(null);
        }}
        rows={16}
        className="w-full font-mono text-xs bg-white border border-border rounded p-3 text-ink"
      />
      {err ? <div className="text-xs text-red-700 mt-2">{err}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={m.isPending}
          onClick={() => {
            try {
              const parsed = JSON.parse(text);
              m.mutate(parsed);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          className="inline-flex items-center gap-1.5 bg-royal text-white text-xs px-3 py-1.5 rounded-md hover:bg-royal/90 disabled:opacity-60"
        >
          {m.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-ink/60 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
