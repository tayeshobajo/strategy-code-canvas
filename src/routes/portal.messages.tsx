import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  Paperclip,
  X,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { sendPortalMessage, getPortalRoadmapContextOptions } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePortalContext } from "@/hooks/use-portal-context";
import { toast } from "sonner";

const messagesSearchSchema = z.object({
  milestone: fallback(z.string().optional(), undefined),
  prefill: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/portal/messages")({
  validateSearch: zodValidator(messagesSearchSchema),
  head: () => ({
    meta: [
      { title: "Messages — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

type Message = {
  id: string;
  project_id: string;
  sender_type: string;
  author_email: string | null;
  subject: string | null;
  body: string;
  message_type: string;
  action_required: boolean;
  action_completed_at: string | null;
  related_file_ids: string[];
  related_milestone_id: string | null;
  related_phase_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FileMeta = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  bucket_id: string;
  storage_path: string;
};

type Tab = "all" | "updates" | "replies" | "actions";

const BUCKET = "client-portal-files";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = new Set([
  "pdf","doc","docx","txt","md","rtf",
  "xls","xlsx","csv",
  "ppt","pptx","key",
  "png","jpg","jpeg","gif","webp","svg","heic",
  "zip","fig",
  "mp4","mov","webm",
  "json","yaml","yml",
]);

function useMessages(projectId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "messages", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("client_portal_messages")
        .select(
          "id, project_id, sender_type, author_email, subject, body, message_type, action_required, action_completed_at, related_file_ids, related_milestone_id, related_phase_id, metadata, created_at",
        )
        .eq("project_id", projectId!)
        .eq("visible_to_client", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Message[];
    },
    refetchOnWindowFocus: true,
  });
}

function useMessageFiles(projectId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "message-files", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Record<string, FileMeta>> => {
      const { data, error } = await supabase
        .from("client_portal_files")
        .select("id, file_name, mime_type, size_bytes, bucket_id, storage_path")
        .eq("project_id", projectId!);
      if (error) throw new Error(error.message);
      const map: Record<string, FileMeta> = {};
      for (const f of (data ?? []) as FileMeta[]) map[f.id] = f;
      return map;
    },
  });
}

type Attachment = {
  clientId: string;
  file: File;
  status: "queued" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  uploadedId?: string;
};

function validateAttachment(file: File): string | null {
  if (file.size === 0) return "File is empty";
  if (file.size > MAX_BYTES) return "File exceeds 25 MB";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !ALLOWED_EXT.has(ext)) return `.${ext || "unknown"} not allowed`;
  return null;
}

function MessagesPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const { data: messages, isLoading, isError, refetch } = useMessages(projectId);
  const { data: fileMap } = useMessageFiles(projectId);
  const loadCtxOptions = useServerFn(getPortalRoadmapContextOptions);
  const { data: ctxOptions } = useQuery({
    queryKey: ["portal", "messages", "ctx-options", projectId],
    enabled: !!projectId,
    queryFn: () => loadCtxOptions({ data: { portalProjectId: projectId! } }),
  });
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
  const [composerPhase, setComposerPhase] = useState<string>("");
  const [composerMilestone, setComposerMilestone] = useState<string>("");
  const [filterPhase, setFilterPhase] = useState<string>("");
  const [filterMilestone, setFilterMilestone] = useState<string>("");
  const [filterProject, setFilterProject] = useState<"any" | "mine">("any");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefillApplied = useRef(false);

  const email = ctx.data?.email ?? "";


  // Pre-fill compose textarea when linked from a roadmap milestone.
  useEffect(() => {
    if (prefillApplied.current) return;
    if (!search.prefill && !search.milestone) return;
    prefillApplied.current = true;
    const seed = search.prefill
      ? search.prefill
      : `I have a question about the "${search.milestone}" milestone in our roadmap:\n\n`;
    setBody((current) => (current ? current : seed));
  }, [search.prefill, search.milestone]);

  const updateAttachment = useCallback((clientId: string, patch: Partial<Attachment>) => {
    setAttachments((a) => a.map((it) => (it.clientId === clientId ? { ...it, ...patch } : it)));
  }, []);

  const uploadAttachment = useCallback(
    async (att: Attachment) => {
      if (!projectId) return;
      const path = `${projectId}/messages/${crypto.randomUUID()}-${att.file.name}`;
      updateAttachment(att.clientId, { status: "uploading", progress: 0, error: undefined });
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, att.file, {
          upsert: false,
          contentType: att.file.type || undefined,
        });
      if (upErr) {
        updateAttachment(att.clientId, { status: "error", error: upErr.message });
        return;
      }
      const { data: row, error: rowErr } = await supabase
        .from("client_portal_files")
        .insert({
          project_id: projectId,
          bucket_id: BUCKET,
          storage_path: path,
          file_name: att.file.name,
          category: "message_attachments",
          file_type: att.file.name.split(".").pop() ?? null,
          mime_type: att.file.type || null,
          size_bytes: att.file.size,
          uploaded_by_email: email,
          uploaded_by_role: "client",
          client_visible: true,
          is_internal: false,
        })
        .select("id")
        .single();
      if (rowErr || !row) {
        await supabase.storage.from(BUCKET).remove([path]);
        updateAttachment(att.clientId, { status: "error", error: rowErr?.message ?? "DB insert failed" });
        return;
      }
      updateAttachment(att.clientId, { status: "success", progress: 100, uploadedId: row.id });
      qc.invalidateQueries({ queryKey: ["portal", "message-files", projectId] });
    },
    [projectId, email, qc, updateAttachment],
  );

  const enqueueAttachments = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const arr = Array.from(list);
      const toAdd: Attachment[] = [];
      for (const file of arr) {
        const err = validateAttachment(file);
        const clientId = crypto.randomUUID();
        if (err) {
          toast.error(`${file.name}: ${err}`);
          toAdd.push({ clientId, file, status: "error", progress: 0, error: err });
        } else {
          toAdd.push({ clientId, file, status: "queued", progress: 0 });
        }
      }
      setAttachments((prev) => [...prev, ...toAdd]);
      toAdd.filter((a) => a.status === "queued").forEach((a) => void uploadAttachment(a));
    },
    [uploadAttachment],
  );

  const removeAttachment = useCallback((clientId: string) => {
    setAttachments((a) => a.filter((x) => x.clientId !== clientId));
  }, []);

  const uploadsPending = attachments.some((a) => a.status === "uploading" || a.status === "queued");

  const send = useMutation({
    mutationFn: async (payload: { text: string; fileIds: string[] }) => {
      if (!projectId) throw new Error("No workspace yet");
      await sendPortalMessage({
        data: {
          portalProjectId: projectId,
          body: payload.text,
          relatedFileIds: payload.fileIds,
          messageType: "reply",
        },
      });
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["portal", "messages", projectId] });
      const previous = qc.getQueryData<Message[]>(["portal", "messages", projectId]);
      const optimistic: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        project_id: projectId ?? "",
        sender_type: "client",
        author_email: email,
        subject: null,
        body: payload.text,
        message_type: "reply",
        action_required: false,
        action_completed_at: null,
        related_file_ids: payload.fileIds,
        related_milestone_id: null,
        related_phase_id: null,
        metadata: null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<Message[]>(
        ["portal", "messages", projectId],
        (prev) => [...(prev ?? []), optimistic],
      );
      setBody("");
      setAttachments([]);
      return { previous };
    },
    onError: (e: Error, _p, ctx) => {
      if (ctx?.previous)
        qc.setQueryData(["portal", "messages", projectId], ctx.previous);
      toast.error(e.message || "Message did not send. Try again.");
    },
    onSuccess: () => {
      toast.success("Message sent.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["portal", "messages", projectId] });
    },
  });

  const filtered = useMemo(() => {
    if (!messages) return [];
    if (tab === "updates") return messages.filter((m) => m.sender_type !== "client");
    if (tab === "replies") return messages.filter((m) => m.sender_type === "client");
    if (tab === "actions") return messages.filter((m) => m.action_required && !m.action_completed_at);
    return messages;
  }, [messages, tab]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const counts = useMemo(() => {
    const all = messages ?? [];
    return {
      updates: all.filter((m) => m.sender_type !== "client").length,
      replies: all.filter((m) => m.sender_type === "client").length,
      openActions: all.filter((m) => m.action_required && !m.action_completed_at).length,
    };
  }, [messages]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [filtered.length]);

  const canSend = body.trim().length > 0 && !!projectId && !send.isPending && !uploadsPending;

  return (
    <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <header className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" /> Messages
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">Messages & Updates</h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-2">
            Updates from Trust Tai and a place for our aligned communication.
          </p>
        </header>

        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden flex flex-col min-h-[520px]">
          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-rule-soft px-6 py-3 text-[13px]">
            {(
              [
                ["all", "All"],
                ["updates", "Updates from Trust Tai"],
                ["replies", "Your replies"],
                ["actions", "Action items"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`pb-2 border-b-2 -mb-[13px] transition-colors ${
                  tab === id
                    ? "border-royal text-ink font-medium"
                    : "border-transparent text-ink/60 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scroller */}
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 max-h-[60vh]"
          >
            {isLoading && <SkeletonThread />}
            {isError && (
              <ErrorState onRetry={() => refetch()} message="Couldn't load messages." />
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <EmptyState tab={tab} />
            )}
            {grouped.map(([date, msgs]) => (
              <div key={date} className="space-y-4">
                <div className="text-center text-[12px] text-ink/50">{date}</div>
                {msgs.map((m) => (
                  <MessageCard key={m.id} m={m} fileMap={fileMap ?? {}} onPreview={setPreviewFile} />
                ))}
              </div>
            ))}
          </div>

          {/* Composer */}
          <form
            className="border-t border-rule-soft p-4 sm:p-5 bg-paper-soft"
            onSubmit={(e) => {
              e.preventDefault();
              const text = body.trim();
              if (!text || !projectId) return;
              if (uploadsPending) {
                toast.error("Wait for uploads to finish.");
                return;
              }
              const fileIds = attachments
                .filter((a) => a.status === "success" && a.uploadedId)
                .map((a) => a.uploadedId!) as string[];
              send.mutate({ text, fileIds });
            }}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={projectId ? "Write your message…" : "Workspace not ready yet."}
              disabled={!projectId || send.isPending}
              rows={2}
              className="resize-none bg-card border-rule-soft focus-visible:ring-royal/40"
            />

            {attachments.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {attachments.map((a) => (
                  <li
                    key={a.clientId}
                    className={`flex items-center gap-2 rounded-lg border pl-3 pr-1.5 py-1.5 text-[12px] ${
                      a.status === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : a.status === "success"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-rule-soft bg-card text-ink/70"
                    }`}
                  >
                    {a.status === "uploading" || a.status === "queued" ? (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    ) : a.status === "error" ? (
                      <AlertCircle className="w-3 h-3 shrink-0" />
                    ) : (
                      <Paperclip className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate flex-1 min-w-0" title={a.file.name}>
                      {a.file.name}
                    </span>
                    {a.status === "error" && a.error && (
                      <span className="hidden sm:inline text-[11px] opacity-80 truncate max-w-[220px]">
                        {a.error}
                      </span>
                    )}
                    {a.status === "error" && (
                      <button
                        type="button"
                        onClick={() => void uploadAttachment(a)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive"
                        aria-label={`Retry upload of ${a.file.name}`}
                      >
                        <RotateCw className="w-3 h-3" /> Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.clientId)}
                      className="p-0.5 rounded-full hover:bg-black/5"
                      aria-label={`Remove ${a.file.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    enqueueAttachments(e.target.files);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!projectId || send.isPending}
                  className="text-ink/70 hover:text-ink"
                >
                  <Paperclip className="w-4 h-4 mr-1.5" /> Attach files
                </Button>
                <span className="text-[11px] text-ink/50">
                  or reference existing in{" "}
                  <Link to="/portal/files" className="underline hover:text-ink">
                    Files
                  </Link>
                </span>
              </div>
              <Button
                type="submit"
                disabled={!canSend}
                className="bg-ink hover:bg-ink/90 text-white"
              >
                {send.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
                  </>
                ) : uploadsPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    Send message <Send className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Right rail */}
      <aside className="hidden lg:flex flex-col gap-4">
        <RailCard title="Conversation summary">
          <ul className="text-[13px] space-y-3">
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Updates from Trust Tai</span>
              <span className="font-medium">{counts.updates}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Your replies</span>
              <span className="font-medium">{counts.replies}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink/70">Open action items</span>
              <span className="font-medium">{counts.openActions}</span>
            </li>
          </ul>
        </RailCard>
        <RailCard title="Have a question?">
          <p className="text-[13px] text-ink/70 leading-relaxed">
            We typically respond within one business day.
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-3 w-full border-ink/20 text-ink"
          >
            <a href="mailto:tai@trusttai.com">Email Tai</a>
          </Button>
        </RailCard>
      </aside>
      <MessagePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}

function MessageCard({
  m,
  fileMap,
  onPreview,
}: {
  m: Message;
  fileMap: Record<string, FileMeta>;
  onPreview: (f: FileMeta) => void;
}) {
  const isClient = m.sender_type === "client";
  const initials = isClient
    ? (m.author_email ?? "?").slice(0, 2).toUpperCase()
    : "TT";
  const time = new Date(m.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const attachments = (m.related_file_ids ?? [])
    .map((id) => fileMap[id])
    .filter(Boolean) as FileMeta[];

  return (
    <article className="flex gap-4">
      <div
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
          isClient ? "bg-paper-soft text-ink border border-rule-soft" : "bg-ink text-white"
        }`}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-ink">
            {isClient ? "You" : "Trust Tai Team"}
          </span>
          <span className="text-[12px] text-ink/50">{time}</span>
          <span
            className={`ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isClient
                ? "bg-royal/10 text-royal"
                : m.action_required
                  ? "bg-amber-100 text-amber-800"
                  : "bg-paper-soft text-ink/60 border border-rule-soft"
            }`}
          >
            {isClient ? "Your reply" : m.action_required ? "Action" : "Update"}
          </span>
        </div>
        {m.subject && (
          <div className="mt-1 font-display text-lg text-ink">{m.subject}</div>
        )}
        <p className="mt-1 text-[14px] leading-[1.7] text-ink/80 whitespace-pre-wrap">
          {m.body}
        </p>
        {attachments.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {attachments.map((f) => (
              <li key={f.id}>
                <AttachmentChip file={f} onPreview={onPreview} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function isPreviewable(file: { mime_type: string | null; file_name: string }) {
  const ext = file.file_name.split(".").pop()?.toLowerCase() ?? "";
  if (file.mime_type?.startsWith("image/")) return "image" as const;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image" as const;
  if (file.mime_type === "application/pdf" || ext === "pdf") return "pdf" as const;
  if (file.mime_type?.startsWith("text/") || ["txt", "md", "json", "csv", "yaml", "yml"].includes(ext))
    return "text" as const;
  return null;
}

function AttachmentChip({
  file,
  onPreview,
}: {
  file: FileMeta;
  onPreview: (f: FileMeta) => void;
}) {
  const [busy, setBusy] = useState(false);
  const kind = isPreviewable(file);
  const handleClick = async () => {
    if (kind) {
      onPreview(file);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.storage
      .from(file.bucket_id)
      .createSignedUrl(file.storage_path, 60);
    setBusy(false);
    if (error || !data?.signedUrl) {
      toast.error("Could not open attachment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-rule-soft bg-paper-soft/70 hover:bg-paper-soft px-2.5 py-1.5 text-[12.5px] text-ink transition-colors max-w-[260px]"
      title={kind ? `Preview ${file.file_name}` : file.file_name}
    >
      <AttachmentIcon mime={file.mime_type} name={file.file_name} />
      <span className="truncate">{file.file_name}</span>
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin text-ink/50 shrink-0" />
      ) : (
        <Download className="w-3 h-3 text-ink/50 shrink-0" />
      )}
    </button>
  );
}

// How long signed URLs are valid, and when to proactively refresh them.
const PREVIEW_URL_TTL_SECONDS = 60 * 15; // 15 minutes
const PREVIEW_URL_REFRESH_BUFFER_MS = 60 * 1000; // refresh 60s before expiry

function MessagePreviewModal({
  file,
  onClose,
}: {
  file: FileMeta | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (target: FileMeta) => {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase.storage
        .from(target.bucket_id)
        .createSignedUrl(target.storage_path, PREVIEW_URL_TTL_SECONDS);
      if (e || !data?.signedUrl) {
        setError(e?.message ?? "Could not load preview.");
        setUrl(null);
        setExpiresAt(null);
      } else {
        setUrl(data.signedUrl);
        setExpiresAt(Date.now() + PREVIEW_URL_TTL_SECONDS * 1000);
      }
      setLoading(false);
    },
    [],
  );

  // (Re)load whenever the target file or manual retry attempt changes.
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setExpiresAt(null);
      setError(null);
      return;
    }
    void load(file);
  }, [file, attempt, load]);

  // Proactively refresh the signed URL before it expires so the preview
  // doesn't 403 mid-view (matters for PDFs the user leaves open).
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (!file || !expiresAt) return;
    const delay = Math.max(0, expiresAt - Date.now() - PREVIEW_URL_REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(() => {
      void load(file);
    }, delay);
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [file, expiresAt, load]);

  const kind = file ? isPreviewable(file) : null;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Keyboard: R to retry after an error. Radix Dialog already handles Esc,
  // focus trap, and focus return to the trigger — do not reimplement those.
  useEffect(() => {
    if (!file) return;
    const handler = (e: KeyboardEvent) => {
      if (error && (e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        retry();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [file, error, retry]);

  // Treat iframe/image load failures as expired URLs and offer retry.
  const onMediaError = useCallback(() => {
    setError("This preview link expired or failed to load.");
  }, []);

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-2rem)] p-0 overflow-hidden bg-card"
        aria-describedby="attachment-preview-description"
      >
        <DialogHeader className="px-5 py-3 pr-12 border-b border-rule-soft flex-row items-center justify-between gap-4 space-y-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[14px] font-medium text-ink truncate">
              {file?.file_name ?? "Attachment"}
            </DialogTitle>
            <DialogDescription
              id="attachment-preview-description"
              className="sr-only"
            >
              Attachment preview. Press Escape to close.
              {error ? " Press R to retry." : ""}
            </DialogDescription>
          </div>
          {url && !error && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-royal hover:underline inline-flex items-center gap-1 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal rounded-sm px-1"
            >
              Open in new tab <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </DialogHeader>
        <div
          className="bg-paper-soft min-h-[60vh] max-h-[75vh] overflow-auto flex items-center justify-center"
          role="region"
          aria-label={file ? `Preview of ${file.file_name}` : "Preview"}
          aria-busy={loading}
        >
          {loading && (
            <div className="flex items-center gap-2 text-ink/60">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading preview</span>
            </div>
          )}
          {!loading && error && (
            <div className="text-center p-8 max-w-sm" role="alert">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" aria-hidden="true" />
              <p className="text-[13.5px] text-ink font-medium">Couldn't load preview</p>
              <p className="text-[12.5px] text-ink/60 mt-1">{error}</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  onClick={retry}
                  variant="outline"
                  className="border-ink/20 text-ink"
                  autoFocus
                >
                  <RotateCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  Try again
                </Button>
                {file && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-ink/60"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from(file.bucket_id)
                        .createSignedUrl(file.storage_path, 60);
                      if (data?.signedUrl) {
                        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                      } else {
                        toast.error("Download unavailable.");
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Download
                  </Button>
                )}
              </div>
              <p className="mt-3 text-[11px] text-ink/40">
                Tip: press R to retry, Esc to close.
              </p>
            </div>
          )}
          {!loading && !error && url && kind === "image" && (
            <img
              src={url}
              alt={file?.file_name ?? ""}
              onError={onMediaError}
              className="max-h-[75vh] w-auto object-contain"
            />
          )}
          {!loading && !error && url && (kind === "pdf" || kind === "text") && (
            <iframe
              src={url}
              title={file?.file_name ?? "Preview"}
              onError={onMediaError}
              className="w-full h-[75vh] bg-white"
            />
          )}
          {!loading && !error && url && !kind && (
            <div className="text-center p-8">
              <p className="text-[13px] text-ink/70">Preview not available.</p>
              <Button asChild variant="outline" className="mt-3 border-ink/20 text-ink">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Download
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



function AttachmentIcon({ mime, name }: { mime: string | null; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image") || ["png","jpg","jpeg","gif","webp"].includes(ext))
    return <FileImage className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
  if (ext === "pdf") return <FileText className="w-3.5 h-3.5 text-red-600 shrink-0" />;
  if (["xls","xlsx","csv"].includes(ext))
    return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />;
  if (["doc","docx","md","txt"].includes(ext))
    return <FileText className="w-3.5 h-3.5 text-royal shrink-0" />;
  return <FileIcon className="w-3.5 h-3.5 text-ink/60 shrink-0" />;
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function SkeletonThread() {
  return (
    <div className="space-y-6 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="h-9 w-9 rounded-full bg-paper-soft" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/4 bg-paper-soft rounded" />
            <div className="h-3 w-3/4 bg-paper-soft rounded" />
            <div className="h-3 w-2/3 bg-paper-soft rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, string> = {
    all: "No messages yet. Trust Tai will post updates here.",
    updates: "No updates from Trust Tai yet.",
    replies: "You haven't sent any replies yet.",
    actions: "No open action items. Nice.",
  };
  return (
    <div className="text-center py-16 text-ink/60">
      <MessageSquare className="w-6 h-6 mx-auto mb-3 opacity-40" />
      <p className="text-[14px]">{copy[tab]}</p>
    </div>
  );
}

function ErrorState({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div className="text-center py-16">
      <AlertCircle className="w-6 h-6 mx-auto mb-3 text-destructive" />
      <p className="text-[14px] text-ink/70">{message}</p>
      <Button onClick={onRetry} variant="outline" className="mt-4 border-ink/20 text-ink">
        Try again
      </Button>
    </div>
  );
}

function groupByDate(msgs: Message[]): [string, Message[]][] {
  const groups: Record<string, Message[]> = {};
  for (const m of msgs) {
    const key = new Date(m.created_at).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    (groups[key] ??= []).push(m);
  }
  return Object.entries(groups);
}
