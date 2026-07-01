import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePortalContext } from "@/hooks/use-portal-context";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/messages")({
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
          "id, project_id, sender_type, author_email, subject, body, message_type, action_required, action_completed_at, related_file_ids, created_at",
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
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const email = ctx.data?.email ?? "";

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
      const { error } = await supabase.from("client_portal_messages").insert({
        project_id: projectId,
        sender_type: "client",
        author_email: email,
        body: payload.text,
        message_type: "reply",
        visible_to_client: true,
        related_file_ids: payload.fileIds,
      });
      if (error) throw new Error(error.message);
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
                  <MessageCard key={m.id} m={m} fileMap={fileMap ?? {}} />
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
    </div>
  );
}

function MessageCard({ m, fileMap }: { m: Message; fileMap: Record<string, FileMeta> }) {
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
                <AttachmentChip file={f} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function AttachmentChip({ file }: { file: FileMeta }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
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
      onClick={open}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-rule-soft bg-paper-soft/70 hover:bg-paper-soft px-2.5 py-1.5 text-[12.5px] text-ink transition-colors max-w-[260px]"
      title={file.file_name}
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
