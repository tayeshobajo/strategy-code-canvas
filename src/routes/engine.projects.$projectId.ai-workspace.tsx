import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SectionCard } from "@/components/engine/primitives";
import { getAiWorkspace, saveAiWorkspace, type AiWorkspace, type AiWorkspaceProvider } from "@/lib/engine-ai-workspace.functions";
import {
  BrainCircuit,
  ExternalLink,
  Save,
  Plus,
  Trash2,
  MessageSquare,
  Bot,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/engine/projects/$projectId/ai-workspace")({
  component: AiWorkspacePage,
});

// ─────────── sub-components ─────────────────────────────────────────────────

function ProviderField({
  label,
  icon,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: Partial<AiWorkspaceProvider>;
  placeholder: string;
  onChange: (v: Partial<AiWorkspaceProvider>) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">{icon}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
          {label}
        </span>
      </div>
      <div className="space-y-2">
        <input
          type="url"
          value={value.url ?? ""}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder={placeholder}
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60"
        />
        <textarea
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="What context does this conversation have? (optional)"
          rows={2}
          className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60 resize-none"
        />
      </div>
      {value.url && (
        <a
          href={value.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition"
        >
          <ExternalLink className="w-3 h-3" />
          Open {label}
        </a>
      )}
    </div>
  );
}

function OtherProviderRow({
  provider,
  index,
  onChange,
  onRemove,
}: {
  provider: Partial<AiWorkspaceProvider>;
  index: number;
  onChange: (i: number, v: Partial<AiWorkspaceProvider>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-white/40" />
          <input
            type="text"
            value={provider.name ?? ""}
            onChange={(e) => onChange(index, { ...provider, name: e.target.value })}
            placeholder="Tool name (e.g. Gemini, Perplexity)"
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60"
          />
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-red-400/60 hover:text-red-400 transition"
          aria-label="Remove tool"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <input
        type="url"
        value={provider.url ?? ""}
        onChange={(e) => onChange(index, { ...provider, url: e.target.value })}
        placeholder="https://..."
        className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60"
      />
      <textarea
        value={provider.notes ?? ""}
        onChange={(e) => onChange(index, { ...provider, notes: e.target.value })}
        placeholder="What context does this tool have? (optional)"
        rows={2}
        className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60 resize-none"
      />
      {provider.url && (
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition"
        >
          <ExternalLink className="w-3 h-3" />
          Open {provider.name || "tool"}
        </a>
      )}
    </div>
  );
}

// ─────────── main component ─────────────────────────────────────────────────

function AiWorkspacePage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const getFn = useServerFn(getAiWorkspace);
  const saveFn = useServerFn(saveAiWorkspace);

  const { data, isLoading } = useQuery({
    queryKey: ["engine", "ai-workspace", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    staleTime: 30_000,
  });

  const workspace = data?.workspace;

  // Form state — initialised from query, editable
  const [chatgpt, setChatgpt] = useState<Partial<AiWorkspaceProvider>>({});
  const [claude, setClaude] = useState<Partial<AiWorkspaceProvider>>({});
  const [other, setOther] = useState<Partial<AiWorkspaceProvider>[]>([]);
  const [contextNote, setContextNote] = useState("");
  const [initialised, setInitialised] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync form from query once loaded
  if (workspace && !initialised) {
    setChatgpt(workspace.chatgpt ?? {});
    setClaude(workspace.claude ?? {});
    setOther(workspace.other ?? []);
    setContextNote(workspace.context_note ?? "");
    setInitialised(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          projectId,
          chatgpt: chatgpt.url ? { name: "ChatGPT", ...chatgpt, updated_at: new Date().toISOString() } : undefined,
          claude: claude.url ? { name: "Claude", ...claude, updated_at: new Date().toISOString() } : undefined,
          other: other.filter((o) => o.url && o.name).map((o) => ({
            name: o.name!,
            url: o.url!,
            notes: o.notes,
            updated_at: new Date().toISOString(),
          })),
          context_note: contextNote,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["engine", "ai-workspace", projectId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  // Handlers for other tools
  function handleOtherChange(i: number, v: Partial<AiWorkspaceProvider>) {
    setOther((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  }
  function handleOtherRemove(i: number) {
    setOther((prev) => prev.filter((_, idx) => idx !== i));
  }
  function handleAddOther() {
    setOther((prev) => [...prev, { name: "", url: "", notes: "" }]);
  }

  // Quick-link cards for fast navigation
  const links: Array<{ label: string; url?: string; icon: React.ReactNode; hint: string }> = [
    {
      label: "ChatGPT",
      url: chatgpt.url,
      icon: <MessageSquare className="w-5 h-5" />,
      hint: "Open saved ChatGPT conversation",
    },
    {
      label: "Claude",
      url: claude.url,
      icon: <Bot className="w-5 h-5" />,
      hint: "Open saved Claude project",
    },
    ...other
      .filter((o) => o.url && o.name)
      .map((o) => ({
        label: o.name!,
        url: o.url,
        icon: <Layers className="w-5 h-5" />,
        hint: `Open ${o.name}`,
      })),
  ];

  const hasAnyLinks = links.some((l) => !!l.url);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BrainCircuit className="w-6 h-6 text-amber-400 shrink-0" />
        <div>
          <h2 className="text-xl font-semibold text-white">AI Workspace</h2>
          <p className="text-sm text-white/50 mt-0.5">
            Attach AI conversations and projects to this engine project. Links open in a new tab.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-white/40">Loading workspace…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left — form */}
          <div className="xl:col-span-2 space-y-6">
            <SectionCard title="AI Tool Links">
              <div className="space-y-4">
                <ProviderField
                  label="ChatGPT Conversation"
                  icon={<MessageSquare className="w-4 h-4" />}
                  value={chatgpt}
                  placeholder="https://chat.openai.com/c/..."
                  onChange={setChatgpt}
                />
                <ProviderField
                  label="Claude Project"
                  icon={<Bot className="w-4 h-4" />}
                  value={claude}
                  placeholder="https://claude.ai/project/..."
                  onChange={setClaude}
                />

                {/* Other tools */}
                {other.map((o, i) => (
                  <OtherProviderRow
                    key={i}
                    provider={o}
                    index={i}
                    onChange={handleOtherChange}
                    onRemove={handleOtherRemove}
                  />
                ))}

                <button
                  type="button"
                  onClick={handleAddOther}
                  className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition border border-white/10 rounded px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add another AI tool
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Context Note">
              <div className="space-y-2">
                <p className="text-xs text-white/40">
                  Document what context you've loaded into your AI tools — key decisions, project constraints,
                  documents shared, etc. This is internal-only.
                </p>
                <textarea
                  value={contextNote}
                  onChange={(e) => setContextNote(e.target.value)}
                  placeholder="e.g. Loaded full intake transcript, approved spine v3, decided to skip Phase 2 QA gate..."
                  rows={6}
                  className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/60 resize-none"
                />
              </div>
            </SectionCard>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50 transition"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? "Saving…" : "Save workspace"}
              </button>
              {saved && (
                <span className="text-xs text-emerald-400">✓ Saved</span>
              )}
              {saveMutation.isError && (
                <span className="text-xs text-red-400">
                  {(saveMutation.error as Error).message}
                </span>
              )}
            </div>
          </div>

          {/* Right — quick links + context */}
          <div className="space-y-6">
            <SectionCard title="Quick Links">
              {!hasAnyLinks ? (
                <div className="text-sm text-white/30 italic">
                  Add AI tool links on the left to see them here.
                </div>
              ) : (
                <div className="space-y-2">
                  {links
                    .filter((l) => !!l.url)
                    .map((l) => (
                      <a
                        key={l.label}
                        href={l.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.hint}
                        className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10 hover:border-amber-400/30 transition group"
                      >
                        <span className="text-amber-400/70 group-hover:text-amber-400 transition">
                          {l.icon}
                        </span>
                        <span className="text-sm text-white truncate">{l.label}</span>
                        <ExternalLink className="w-3 h-3 text-white/20 group-hover:text-white/40 ml-auto shrink-0 transition" />
                      </a>
                    ))}
                </div>
              )}
            </SectionCard>

            {workspace?.saved_at && (
              <SectionCard title="Last Saved">
                <div className="text-sm text-white/50">
                  {new Date(workspace.saved_at).toLocaleString()}
                </div>
                {workspace.chatgpt?.updated_at && (
                  <div className="mt-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
                      ChatGPT last updated
                    </div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {new Date(workspace.chatgpt.updated_at).toLocaleString()}
                    </div>
                  </div>
                )}
                {workspace.claude?.updated_at && (
                  <div className="mt-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
                      Claude last updated
                    </div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {new Date(workspace.claude.updated_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            <SectionCard title="How to use">
              <ul className="space-y-2 text-xs text-white/50">
                <li className="flex gap-2">
                  <span className="text-amber-400 shrink-0">1.</span>
                  Start a new ChatGPT conversation or Claude project for this client.
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 shrink-0">2.</span>
                  Paste the conversation or project URL into the field above.
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 shrink-0">3.</span>
                  Add a context note — what you've loaded in, key decisions made.
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 shrink-0">4.</span>
                  Save. Quick Links panel will update with one-click access.
                </li>
              </ul>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
