import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  UploadCloud,
  Download,
  Search,
  Loader2,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  X,
  RotateCcw,
  CheckCircle2,
  Eye,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePortalContext } from "@/hooks/use-portal-context";
import { useServerFn } from "@tanstack/react-start";
import { logPortalFileEvent } from "@/lib/portal.functions";
import { toast } from "sonner";


function isPreviewable(row: { mime_type: string | null; file_name: string }) {
  const ext = row.file_name.split(".").pop()?.toLowerCase() ?? "";
  if (row.mime_type?.startsWith("image/")) return "image" as const;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image" as const;
  if (row.mime_type === "application/pdf" || ext === "pdf") return "pdf" as const;
  if (row.mime_type?.startsWith("text/") || ["txt", "md", "json", "csv", "yaml", "yml"].includes(ext))
    return "text" as const;
  return null;
}

export const Route = createFileRoute("/portal/files")({
  head: () => ({
    meta: [
      { title: "Files — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FilesPage,
});

type FileRow = {
  id: string;
  project_id: string;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  category: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_email: string | null;
  uploaded_by_role: string;
  created_at: string;
  updated_at: string;
};

type UploadStatus = "queued" | "uploading" | "success" | "error";
type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  xhr?: XMLHttpRequest;
};

const BUCKET = "client-portal-files";
const MAX_BYTES = 100 * 1024 * 1024;
const STORAGE_QUOTA = 10 * 1024 * 1024 * 1024;

// Allowed types — extensions + mime prefixes. Broad by design (client work).
const ALLOWED_EXT = new Set([
  "pdf", "doc", "docx", "txt", "md", "rtf",
  "xls", "xlsx", "csv", "numbers",
  "ppt", "pptx", "key",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic",
  "zip", "figma", "fig", "sketch",
  "mp4", "mov", "webm",
  "json", "yaml", "yml",
]);

function validateFile(file: File): string | null {
  if (file.size === 0) return "File is empty.";
  if (file.size > MAX_BYTES) return "File exceeds 100 MB limit.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return `“.${ext || "unknown"}” files aren't allowed.`;
  }
  return null;
}

function useFiles(projectId?: string) {
  return useQuery({
    queryKey: ["portal", "files", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from("client_portal_files")
        .select(
          "id, project_id, bucket_id, storage_path, file_name, category, mime_type, size_bytes, uploaded_by_email, uploaded_by_role, created_at, updated_at",
        )
        .eq("project_id", projectId!)
        .eq("client_visible", true)
        .eq("is_internal", false)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FileRow[];
    },
  });
}

function FilesPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const projectId = project?.id;
  const email = ctx.data?.email ?? null;
  const { data: files, isLoading, isError, refetch } = useFiles(projectId);
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      if (!projectId) {
        updateItem(item.id, { status: "error", error: "Workspace not ready." });
        return;
      }
      const path = `${projectId}/${crypto.randomUUID()}-${item.file.name}`;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        updateItem(item.id, { status: "error", error: "Session expired. Sign in again." });
        return;
      }

      updateItem(item.id, { status: "uploading", progress: 0, error: undefined });

      // Upload to Supabase Storage via XHR so we can watch real byte progress.
      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
        );
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "false");
        if (item.file.type) xhr.setRequestHeader("Content-Type", item.file.type);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateItem(item.id, {
              progress: Math.round((e.loaded / e.total) * 100),
            });
          }
        };
        xhr.onerror = () => {
          updateItem(item.id, {
            status: "error",
            error: "Network error. Check your connection and retry.",
          });
          resolve();
        };
        xhr.onabort = () => {
          updateItem(item.id, { status: "error", error: "Cancelled." });
          resolve();
        };
        xhr.onload = async () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            let msg = `Upload failed (${xhr.status}).`;
            try {
              const parsed = JSON.parse(xhr.responseText);
              if (parsed?.message) msg = parsed.message;
            } catch {
              /* ignore */
            }
            updateItem(item.id, { status: "error", error: msg });
            resolve();
            return;
          }
          // Insert DB row.
          const { error: rowErr } = await supabase.from("client_portal_files").insert({
            project_id: projectId,
            bucket_id: BUCKET,
            storage_path: path,
            file_name: item.file.name,
            category: "client_uploads",
            file_type: item.file.name.split(".").pop() ?? null,
            mime_type: item.file.type || null,
            size_bytes: item.file.size,
            uploaded_by_email: email,
            uploaded_by_role: "client",
            client_visible: true,
            is_internal: false,
          });
          if (rowErr) {
            await supabase.storage.from(BUCKET).remove([path]);
            updateItem(item.id, { status: "error", error: rowErr.message });
            resolve();
            return;
          }
          updateItem(item.id, { status: "success", progress: 100, xhr: undefined });
          resolve();
        };

        updateItem(item.id, { xhr });
        xhr.send(item.file);
      });

      qc.invalidateQueries({ queryKey: ["portal", "files", projectId] });
    },
    [projectId, email, qc, updateItem],
  );

  const enqueueFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const arr = Array.from(list);
      const items: UploadItem[] = [];
      let rejected = 0;
      for (const file of arr) {
        const err = validateFile(file);
        const id = crypto.randomUUID();
        if (err) {
          rejected += 1;
          items.push({ id, file, status: "error", progress: 0, error: err });
        } else {
          items.push({ id, file, status: "queued", progress: 0 });
        }
      }
      if (rejected > 0) toast.error(`${rejected} file(s) rejected. See queue below.`);
      setQueue((q) => [...items, ...q]);
      // Fire uploads for the valid ones.
      items
        .filter((it) => it.status === "queued")
        .forEach((it) => void uploadOne(it));
    },
    [uploadOne],
  );

  const retry = useCallback(
    (id: string) => {
      const it = queue.find((x) => x.id === id);
      if (!it) return;
      const err = validateFile(it.file);
      if (err) {
        updateItem(id, { status: "error", error: err, progress: 0 });
        return;
      }
      updateItem(id, { status: "queued", progress: 0, error: undefined });
      void uploadOne({ ...it, status: "queued", progress: 0, error: undefined });
    },
    [queue, updateItem, uploadOne],
  );

  const removeFromQueue = useCallback(
    (id: string) => {
      const it = queue.find((x) => x.id === id);
      if (it?.status === "uploading") it.xhr?.abort();
      setQueue((q) => q.filter((x) => x.id !== id));
    },
    [queue],
  );

  const clearFinished = useCallback(() => {
    setQueue((q) => q.filter((x) => x.status !== "success"));
  }, []);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    (files ?? []).forEach((f) => map.set(f.category, (map.get(f.category) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [files]);

  const filtered = useMemo(() => {
    let list = files ?? [];
    if (category !== "all") list = list.filter((f) => f.category === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.file_name.toLowerCase().includes(q));
    }
    return list;
  }, [files, query, category]);

  const totalBytes = useMemo(
    () => (files ?? []).reduce((sum, f) => sum + (f.size_bytes ?? 0), 0),
    [files],
  );

  const activeUploads = queue.filter((q) => q.status === "uploading" || q.status === "queued").length;

  async function download(row: FileRow) {
    const { data, error } = await supabase.storage
      .from(row.bucket_id)
      .createSignedUrl(row.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="max-w-6xl mx-auto grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal flex items-center gap-2">
            <Folder className="w-3.5 h-3.5" /> Files
          </div>
          <h1 className="font-display text-3xl text-ink mt-2">Files</h1>
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-2">
            All documents and assets shared between you and Trust Tai.
          </p>
        </header>

        {/* Upload queue */}
        {queue.length > 0 && (
          <div className="rounded-2xl bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-rule-soft">
              <div className="text-[13px] font-medium text-ink">
                Uploads
                {activeUploads > 0 && (
                  <span className="ml-2 text-ink/60 font-normal">
                    ({activeUploads} in progress)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={clearFinished}
                className="text-[12px] text-ink/60 hover:text-ink"
              >
                Clear completed
              </button>
            </div>
            <ul className="divide-y divide-rule-soft">
              {queue.map((it) => (
                <li key={it.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <FileTypeIcon mime={it.file.type} name={it.file.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] text-ink truncate">
                          {it.file.name}
                        </span>
                        <span className="text-[11px] text-ink/50 shrink-0">
                          {formatBytes(it.file.size)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-paper-soft overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            it.status === "error"
                              ? "bg-destructive"
                              : it.status === "success"
                                ? "bg-emerald-600"
                                : "bg-royal"
                          }`}
                          style={{ width: `${it.status === "error" ? 100 : it.progress}%` }}
                        />
                      </div>
                      <div
                        className={`text-[11px] mt-1 ${
                          it.status === "error"
                            ? "text-destructive"
                            : "text-ink/60"
                        }`}
                      >
                        {it.status === "uploading" && `Uploading… ${it.progress}%`}
                        {it.status === "queued" && "Queued"}
                        {it.status === "success" && "Uploaded"}
                        {it.status === "error" && (it.error ?? "Upload failed")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {it.status === "error" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => retry(it.id)}
                          className="text-royal hover:text-royal"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
                        </Button>
                      )}
                      {it.status === "success" && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mr-1" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFromQueue(it.id)}
                        className="p-1 text-ink/50 hover:text-ink"
                        aria-label="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-card border border-border shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule-soft p-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files…"
                className="pl-9 bg-paper-soft border-rule-soft"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-rule-soft bg-paper-soft px-3 text-[13px] text-ink"
            >
              <option value="all">All categories</option>
              {categoryCounts.map(([c]) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto min-h-[280px]">
            {isLoading && <SkeletonRows />}
            {isError && (
              <div className="p-12 text-center">
                <AlertCircle className="w-6 h-6 mx-auto mb-3 text-destructive" />
                <p className="text-[14px] text-ink/70">Couldn't load files.</p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                  className="mt-4 border-ink/20 text-ink"
                >
                  Try again
                </Button>
              </div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <div className="p-16 text-center text-ink/60">
                <Folder className="w-6 h-6 mx-auto mb-3 opacity-40" />
                <p className="text-[14px]">
                  {files?.length === 0
                    ? "Nothing shared yet."
                    : "No files match your filters."}
                </p>
              </div>
            )}
            {!isLoading && !isError && filtered.length > 0 && (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wider text-ink/50 border-b border-rule-soft">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Uploaded by</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Size</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-rule-soft/60 hover:bg-paper-soft/60"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <FileTypeIcon mime={f.mime_type} name={f.file_name} />
                          <span className="text-ink font-medium">{f.file_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-paper-soft text-ink/70 border border-rule-soft">
                          {formatCategory(f.category)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-ink/70">
                        {f.uploaded_by_role === "client" ? "You" : "Trust Tai Team"}
                      </td>
                      <td className="px-5 py-3 text-ink/70">
                        {new Date(f.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 text-ink/70">{formatBytes(f.size_bytes)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isPreviewable(f) && (
                            <Button
                              onClick={() => setPreview(f)}
                              size="sm"
                              variant="ghost"
                              className="text-ink hover:text-royal"
                              aria-label={`Preview ${f.file_name}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            onClick={() => download(f)}
                            size="sm"
                            variant="ghost"
                            className="text-ink hover:text-royal"
                            aria-label={`Download ${f.file_name}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right rail */}
      <aside className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Upload files
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              enqueueFiles(e.dataTransfer.files);
            }}
            className="rounded-xl border-2 border-dashed border-rule-soft bg-paper-soft p-6 text-center"
          >
            <div className="mx-auto h-10 w-10 rounded-full bg-card border border-rule-soft flex items-center justify-center mb-3">
              {activeUploads > 0 ? (
                <Loader2 className="w-4 h-4 animate-spin text-royal" />
              ) : (
                <UploadCloud className="w-4 h-4 text-ink/60" />
              )}
            </div>
            <p className="text-[13px] text-ink/70">Drag & drop files here</p>
            <p className="text-[11px] text-ink/50 mt-1">or</p>
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!projectId}
              className="mt-3 bg-ink hover:bg-ink/90 text-white"
            >
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                enqueueFiles(e.target.files);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
            <p className="text-[11px] text-ink/50 mt-3">
              Docs, images, video, archives. Max 100 MB.
            </p>
          </div>
        </div>

        {categoryCounts.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
              Categories
            </div>
            <ul className="text-[13px] space-y-2">
              <li>
                <button
                  type="button"
                  onClick={() => setCategory("all")}
                  className={`w-full flex items-center justify-between py-1.5 ${
                    category === "all" ? "text-ink font-medium" : "text-ink/70"
                  }`}
                >
                  <span>All files</span>
                  <span className="text-ink/50">{files?.length ?? 0}</span>
                </button>
              </li>
              {categoryCounts.map(([c, n]) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`w-full flex items-center justify-between py-1.5 ${
                      category === c ? "text-ink font-medium" : "text-ink/70"
                    }`}
                  >
                    <span>{formatCategory(c)}</span>
                    <span className="text-ink/50">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal mb-3">
            Storage
          </div>
          <div className="text-[13px] text-ink/70">
            {formatBytes(totalBytes)} of {formatBytes(STORAGE_QUOTA)} used
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-paper-soft overflow-hidden">
            <div
              className="h-full bg-royal"
              style={{
                width: `${Math.min(100, (totalBytes / STORAGE_QUOTA) * 100)}%`,
              }}
            />
          </div>
        </div>
      </aside>
      <PreviewModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PreviewModal({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.storage
      .from(file.bucket_id)
      .createSignedUrl(file.storage_path, 300)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e || !data?.signedUrl) {
          setError(e?.message ?? "Could not load preview.");
        } else {
          setUrl(data.signedUrl);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const kind = file ? isPreviewable(file) : null;

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] p-0 overflow-hidden bg-card">
        <DialogHeader className="px-5 py-3 border-b border-rule-soft flex-row items-center justify-between gap-4 space-y-0">
          <DialogTitle className="text-[14px] font-medium text-ink truncate">
            {file?.file_name}
          </DialogTitle>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-royal hover:underline inline-flex items-center gap-1 shrink-0 mr-6"
            >
              Open in new tab <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </DialogHeader>
        <div className="bg-paper-soft min-h-[60vh] max-h-[75vh] overflow-auto flex items-center justify-center">
          {loading && <Loader2 className="w-5 h-5 animate-spin text-ink/50" />}
          {!loading && error && (
            <div className="text-center p-8">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-destructive" />
              <p className="text-[13px] text-ink/70">{error}</p>
            </div>
          )}
          {!loading && !error && url && kind === "image" && (
            <img
              src={url}
              alt={file?.file_name ?? ""}
              className="max-h-[75vh] w-auto object-contain"
            />
          )}
          {!loading && !error && url && kind === "pdf" && (
            <iframe
              src={url}
              title={file?.file_name ?? "PDF"}
              className="w-full h-[75vh] bg-white"
            />
          )}
          {!loading && !error && url && kind === "text" && (
            <iframe
              src={url}
              title={file?.file_name ?? "Text"}
              className="w-full h-[75vh] bg-white"
            />
          )}
          {!loading && !error && url && !kind && (
            <div className="text-center p-8">
              <p className="text-[13px] text-ink/70">Preview not available for this file type.</p>
              <Button
                asChild
                variant="outline"
                className="mt-3 border-ink/20 text-ink"
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-1.5" /> Download
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SkeletonRows() {
  return (
    <div className="p-6 space-y-3 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-paper-soft rounded" />
      ))}
    </div>
  );
}

function FileTypeIcon({ mime, name }: { mime: string | null; name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
    return <FileImage className="w-4 h-4 text-emerald-600" />;
  }
  if (ext === "pdf") return <FileText className="w-4 h-4 text-red-600" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet className="w-4 h-4 text-emerald-700" />;
  if (["doc", "docx", "md", "txt"].includes(ext))
    return <FileText className="w-4 h-4 text-royal" />;
  return <FileIcon className="w-4 h-4 text-ink/60" />;
}

function formatBytes(n: number | null | undefined) {
  const v = n ?? 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCategory(c: string) {
  return c
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
