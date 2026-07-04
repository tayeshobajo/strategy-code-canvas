import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { StepEditor } from "@/components/engine/StepEditor";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateProjectStep } from "@/lib/engine.functions";
import { listExtractedSignals, listExtractionRuns } from "@/lib/engine-project-intake.functions";
import { Upload, ImagePlus, Link2, FileText, Loader2, Trash2, ExternalLink, StickyNote, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/engine/projects/$projectId/signal-room")({
  component: SignalRoom,
});

const BUCKET = "engine-signals";

type StoredFile = { name: string; path: string; size: number; type: string; added_at: string };
type StoredLink = { title: string; url: string; note?: string; added_at: string };

type SignalRoomData = {
  transcript?: string;
  brief?: string;
  website?: string;
  notes?: string;
  previous_roadmap?: string;
  uploads?: StoredFile[];
  screenshots?: StoredFile[];
  research?: StoredLink[];
};

function SignalRoom() {
  const { projectId } = Route.useParams();
  const { project } = useWorkspace(projectId);
  const data = (project.signal_room ?? {}) as SignalRoomData;
  const qc = useQueryClient();
  const updateFn = useServerFn(updateProjectStep);

  const save = useMutation({
    mutationFn: async (next: SignalRoomData) =>
      updateFn({ data: { id: projectId, step: "signal-room", data: next as Record<string, unknown> } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engine", "workspace", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Step 2</div>
        <h2 className="font-display text-3xl text-ink mt-1">Signal Room</h2>
        <p className="text-sm text-ink/60 mt-1">Raw truth. Everything the roadmap will be built from.</p>
      </header>

      <ExtractedSignalsPanel projectId={projectId} />


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FileUploader
          projectId={projectId}
          title="Uploaded files"
          hint="PDFs, decks, transcripts, spreadsheets."
          icon={<Upload className="w-4 h-4" />}
          accept="*/*"
          files={data.uploads ?? []}
          onChange={(uploads) => save.mutate({ ...data, uploads })}
          pending={save.isPending}
        />
        <FileUploader
          projectId={projectId}
          title="Screenshots"
          hint="Product screens, funnel drop-offs, dashboards."
          icon={<ImagePlus className="w-4 h-4" />}
          accept="image/*"
          preview
          files={data.screenshots ?? []}
          onChange={(screenshots) => save.mutate({ ...data, screenshots })}
          pending={save.isPending}
        />
        <LinksManager
          links={data.research ?? []}
          onChange={(research) => save.mutate({ ...data, research })}
          pending={save.isPending}
        />
        <TextField
          title="Website / product URL"
          icon={<Link2 className="w-4 h-4" />}
          value={data.website ?? ""}
          placeholder="https://example.com"
          onSave={(website) => save.mutate({ ...data, website })}
          pending={save.isPending}
        />
        <TextArea
          title="Client brief"
          icon={<FileText className="w-4 h-4" />}
          value={data.brief ?? ""}
          rows={8}
          placeholder="Paste the client brief here."
          onSave={(brief) => save.mutate({ ...data, brief })}
          pending={save.isPending}
        />
        <TextArea
          title="Transcript"
          icon={<FileText className="w-4 h-4" />}
          value={data.transcript ?? ""}
          rows={8}
          placeholder="Paste the discovery call transcript here."
          onSave={(transcript) => save.mutate({ ...data, transcript })}
          pending={save.isPending}
        />
        <TextArea
          title="Working notes"
          icon={<StickyNote className="w-4 h-4" />}
          value={data.notes ?? ""}
          rows={6}
          placeholder="Anything the roadmap needs to remember."
          onSave={(notes) => save.mutate({ ...data, notes })}
          pending={save.isPending}
        />
        <TextArea
          title="Previous roadmap"
          icon={<FileText className="w-4 h-4" />}
          value={data.previous_roadmap ?? ""}
          rows={6}
          placeholder="Notes on any prior roadmap or plan the client has."
          onSave={(previous_roadmap) => save.mutate({ ...data, previous_roadmap })}
          pending={save.isPending}
        />
      </div>

      <SectionCard title="Advanced (JSON)">
        <StepEditor projectId={projectId} step="signal-room" data={project.signal_room} />
      </SectionCard>
    </div>
  );
}

function FileUploader({
  projectId, title, hint, icon, accept, preview, files, onChange, pending,
}: {
  projectId: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  accept: string;
  preview?: boolean;
  files: StoredFile[];
  onChange: (files: StoredFile[]) => void;
  pending: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      const added: StoredFile[] = [];
      for (const file of Array.from(list)) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name} is over 25 MB`);
          continue;
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `${projectId}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }
        added.push({
          name: file.name,
          path,
          size: file.size,
          type: file.type,
          added_at: new Date().toISOString(),
        });
      }
      if (added.length > 0) {
        onChange([...files, ...added]);
        toast.success(`${added.length} file(s) uploaded`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (f: StoredFile) => {
    await supabase.storage.from(BUCKET).remove([f.path]);
    onChange(files.filter((x) => x.path !== f.path));
  };

  const openPreview = async (f: StoredFile) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const loadPreview = async (f: StoredFile) => {
    if (previews[f.path]) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60 * 10);
    if (data?.signedUrl) setPreviews((p) => ({ ...p, [f.path]: data.signedUrl }));
  };

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">{icon}{title}</span>
      }
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
        className="border-2 border-dashed border-border rounded-lg p-4 text-center bg-paper-soft"
      >
        <p className="text-xs text-ink/60">{hint}</p>
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading || pending}
            className="inline-flex items-center gap-1.5 text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading" : "Choose files"}
          </button>
          <span className="text-[11px] text-ink/40 ml-2">or drag & drop</span>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="mt-3"><EmptyState title="Nothing uploaded yet" /></div>
      ) : preview ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files.map((f) => {
            if (!previews[f.path]) loadPreview(f);
            return (
              <div key={f.path} className="relative group border border-border rounded-md overflow-hidden bg-white">
                {previews[f.path] ? (
                  <img src={previews[f.path]} alt={f.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center bg-paper-soft">
                    <Loader2 className="w-4 h-4 animate-spin text-ink/40" />
                  </div>
                )}
                <div className="p-1.5 text-[10px] text-ink/70 truncate">{f.name}</div>
                <button
                  onClick={() => remove(f)}
                  className="absolute top-1 right-1 p-1 rounded bg-white/90 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove"
                >
                  <Trash2 className="w-3 h-3 text-red-700" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {files.map((f) => (
            <li key={f.path} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="truncate text-ink">{f.name}</div>
                <div className="text-[11px] text-ink/50">{(f.size / 1024).toFixed(0)} KB · {new Date(f.added_at).toLocaleDateString()}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openPreview(f)} className="p-1.5 rounded hover:bg-paper-soft" aria-label="Open">
                  <ExternalLink className="w-3.5 h-3.5 text-ink/70" />
                </button>
                <button onClick={() => remove(f)} className="p-1.5 rounded hover:bg-paper-soft" aria-label="Remove">
                  <Trash2 className="w-3.5 h-3.5 text-red-700" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function LinksManager({
  links, onChange, pending,
}: {
  links: StoredLink[];
  onChange: (links: StoredLink[]) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");

  const add = () => {
    if (!url.trim()) {
      toast.error("URL is required");
      return;
    }
    try { new URL(url); } catch { toast.error("Enter a valid URL"); return; }
    onChange([
      ...links,
      { title: title.trim() || url, url: url.trim(), note: note.trim() || undefined, added_at: new Date().toISOString() },
    ]);
    setTitle(""); setUrl(""); setNote("");
  };
  const remove = (i: number) => onChange(links.filter((_, idx) => idx !== i));

  return (
    <SectionCard title={<span className="inline-flex items-center gap-2"><Link2 className="w-4 h-4" />Source links & research</span>}>
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink"
          maxLength={200}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink"
          maxLength={2000}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink"
          maxLength={300}
        />
        <button
          onClick={add}
          disabled={pending}
          className="text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-50"
        >
          Add link
        </button>
      </div>
      {links.length === 0 ? (
        <div className="mt-3"><EmptyState title="No links yet" /></div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {links.map((l, i) => (
            <li key={i} className="py-2 flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <a href={l.url} target="_blank" rel="noreferrer" className="text-royal hover:underline truncate block">
                  {l.title}
                </a>
                <div className="text-[11px] text-ink/50 truncate">{l.url}</div>
                {l.note ? <div className="text-xs text-ink/70 mt-0.5">{l.note}</div> : null}
              </div>
              <button onClick={() => remove(i)} className="p-1.5 rounded hover:bg-paper-soft" aria-label="Remove">
                <Trash2 className="w-3.5 h-3.5 text-red-700" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function TextField({
  title, icon, value, placeholder, onSave, pending,
}: {
  title: string; icon: React.ReactNode; value: string; placeholder: string;
  onSave: (v: string) => void; pending: boolean;
}) {
  const [v, setV] = useState(value);
  return (
    <SectionCard title={<span className="inline-flex items-center gap-2">{icon}{title}</span>}>
      <div className="flex gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink"
          maxLength={500}
        />
        <button
          onClick={() => onSave(v)}
          disabled={pending || v === value}
          className="text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </SectionCard>
  );
}

function TextArea({
  title, icon, value, rows, placeholder, onSave, pending,
}: {
  title: string; icon: React.ReactNode; value: string; rows: number; placeholder: string;
  onSave: (v: string) => void; pending: boolean;
}) {
  const [v, setV] = useState(value);
  return (
    <SectionCard title={<span className="inline-flex items-center gap-2">{icon}{title}</span>}>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-sm border border-border rounded-md px-3 py-2 bg-white text-ink font-mono"
        maxLength={20000}
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => onSave(v)}
          disabled={pending || v === value}
          className="text-xs bg-ink text-white rounded-md px-3 py-1.5 hover:bg-ink/90 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </SectionCard>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  goal: "Client goals",
  pain: "Pain points",
  opportunity: "Opportunities",
  deadline: "Deadlines",
  constraint: "Constraints",
  decision_maker: "Decision makers",
  hidden_asset: "Hidden assets",
  risk: "Risks",
  required_system: "Required systems",
  milestone_candidate: "Milestone candidates",
  investment_signal: "Investment signals",
  client_language: "Client language",
  open_question: "Open questions",
};

function ExtractedSignalsPanel({ projectId }: { projectId: string }) {
  const listSignals = useServerFn(listExtractedSignals);
  const listRuns = useServerFn(listExtractionRuns);
  const signalsQ = useQuery({
    queryKey: ["engine", "signals", projectId],
    queryFn: () => listSignals({ data: { projectId } }),
    refetchInterval: (q) => {
      // Poll while a run is active
      const runs = (q.state.data as { rows?: Array<{ status: string }> } | undefined)?.rows ?? [];
      return runs.length === 0 ? 5000 : 15000;
    },
  });
  const runsQ = useQuery({
    queryKey: ["engine", "extraction-runs", projectId],
    queryFn: () => listRuns({ data: { projectId } }),
    refetchInterval: (q) => {
      const rows = (q.state.data as { rows?: Array<{ status: string }> } | undefined)?.rows ?? [];
      return rows.some((r) => r.status === "running" || r.status === "pending") ? 3000 : 20000;
    },
  });

  const runs = runsQ.data?.rows ?? [];
  const activeRun = runs.find((r) => r.status === "running" || r.status === "pending");
  const latestRun = runs[0];
  const signals = signalsQ.data?.rows ?? [];

  const grouped = signals.reduce<Record<string, typeof signals>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-royal" />
          Extracted signals
          <span className="text-xs font-normal text-ink/50">
            {signals.length} signal{signals.length === 1 ? "" : "s"}
            {latestRun?.model_structured ? ` · ${latestRun.provider_structured}/${latestRun.model_structured}` : ""}
          </span>
        </span>
      }
    >
      {activeRun ? (
        <div className="flex items-center gap-2 text-sm text-ink/70 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-royal" />
          Intelligence pipeline running — signals will appear here shortly.
        </div>
      ) : signals.length === 0 ? (
        <EmptyState
          title="No signals extracted yet"
          hint="Add a source (transcript, brief, URL) and run the pipeline from the Versions tab."
        />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[11px] uppercase tracking-wider text-ink/50 font-mono mb-2">
                {CATEGORY_LABELS[cat] ?? cat} · {items.length}
              </div>
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className="text-sm text-ink border-l-2 border-royal/30 pl-3 py-1"
                  >
                    <div className="font-medium">{s.label}</div>
                    {s.detail && <div className="text-xs text-ink/60 mt-0.5">{s.detail}</div>}
                    <div className="text-[10px] text-ink/40 mt-1 font-mono">
                      confidence {s.confidence}% · from AI extraction
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
