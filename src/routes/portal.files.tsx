import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePortalContext } from "@/hooks/use-portal-context";
import { toast } from "sonner";

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

const BUCKET = "client-portal-files";
const MAX_BYTES = 100 * 1024 * 1024;
const STORAGE_QUOTA = 10 * 1024 * 1024 * 1024; // 10 GB display quota

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
  const { data: files, isLoading, isError, refetch } = useFiles(projectId);
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!projectId) throw new Error("Workspace not ready.");
      if (file.size > MAX_BYTES) throw new Error("Max file size is 100 MB.");
      setUploading(file.name);
      const path = `${projectId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { error: rowErr } = await supabase.from("client_portal_files").insert({
        project_id: projectId,
        bucket_id: BUCKET,
        storage_path: path,
        file_name: file.name,
        category: "client_uploads",
        file_type: file.name.split(".").pop() ?? null,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by_email: ctx.data?.email ?? null,
        uploaded_by_role: "client",
        client_visible: true,
        is_internal: false,
      });
      if (rowErr) {
        // best-effort cleanup of the orphan object
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(rowErr.message);
      }
    },
    onSuccess: () => {
      toast.success("File uploaded.");
      qc.invalidateQueries({ queryKey: ["portal", "files", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(null),
  });

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

  function handleFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((f) => upload.mutate(f));
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

        <div className="rounded-2xl bg-card border border-border shadow-sm">
          {/* Filters */}
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

          {/* Table */}
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
                        <Button
                          onClick={() => download(f)}
                          size="sm"
                          variant="ghost"
                          className="text-ink hover:text-royal"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
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
              handleFiles(e.dataTransfer.files);
            }}
            className="rounded-xl border-2 border-dashed border-rule-soft bg-paper-soft p-6 text-center"
          >
            <div className="mx-auto h-10 w-10 rounded-full bg-card border border-rule-soft flex items-center justify-center mb-3">
              {upload.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-royal" />
              ) : (
                <UploadCloud className="w-4 h-4 text-ink/60" />
              )}
            </div>
            <p className="text-[13px] text-ink/70">
              {uploading ? `Uploading ${uploading}…` : "Drag & drop files here"}
            </p>
            <p className="text-[11px] text-ink/50 mt-1">or</p>
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending || !projectId}
              className="mt-3 bg-ink hover:bg-ink/90 text-white"
            >
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <p className="text-[11px] text-ink/50 mt-3">Max file size: 100 MB</p>
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
    </div>
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
