import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Card, PageHeader } from "@/components/ops/Primitives";
import { StatusBadge } from "@/components/ops/StatusBadge";
import {
  approveSubmission,
  getSubmission,
  saveDraft,
} from "@/lib/ops.functions";
import {
  DRAFT_SECTIONS,
  type DraftContent,
  emptyDraft,
  seedDraftFromArtifact,
} from "@/lib/ops/intake-types";

export const Route = createFileRoute("/ops/editor/$id")({
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [content, setContent] = useState<DraftContent>(emptyDraft());
  const [seeded, setSeeded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const detail = useQuery({
    queryKey: ["ops", "submission", id],
    queryFn: () => getSubmission({ data: { id } }),
  });

  useEffect(() => {
    if (!detail.data || seeded) return;
    const existing = detail.data.draft?.content as Partial<DraftContent> | null | undefined;
    const seed = existing
      ? { ...emptyDraft(), ...existing }
      : seedDraftFromArtifact(detail.data.review?.artifact ?? null);
    setContent(seed);
    setSeeded(true);
  }, [detail.data, seeded]);

  const save = useMutation({
    mutationFn: () => saveDraft({ data: { submission_id: id, content } }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["ops", "submission", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async () => {
      await saveDraft({ data: { submission_id: id, content } });
      return approveSubmission({ data: { submission_id: id } });
    },
    onSuccess: () => {
      toast.success("Approved and saved");
      qc.invalidateQueries({ queryKey: ["ops", "submission", id] });
      qc.invalidateQueries({ queryKey: ["ops", "queue"] });
      router.navigate({ to: "/ops/submissions/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="px-6 py-10 md:px-10 flex items-center gap-2 text-sm text-[#5d6079]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!detail.data) {
    return <div className="px-6 py-10 md:px-10 text-sm text-[#a4283c]">Not found.</div>;
  }

  const { submission, review, draft } = detail.data;
  const status = review?.status ?? "needs_review";
  const original = seedDraftFromArtifact(review?.artifact ?? null);

  const wordCount = Object.values(content).reduce(
    (sum, v) => sum + (v?.trim() ? v.trim().split(/\s+/).length : 0),
    0,
  );

  return (
    <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/ops/submissions/$id"
          params={{ id }}
          className="inline-flex items-center gap-2 text-sm text-[#3a4fcf] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm font-medium text-[#171c38] hover:bg-[#f9f9f4]"
          >
            {showOriginal ? "Hide original" : "Compare with original"}
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-2 rounded-md border border-[#3a4fcf]/30 bg-white px-3 py-2 text-sm font-medium text-[#3a4fcf] hover:bg-[#eef1fb] disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </button>
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() => approve.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-[#3a4fcf] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f41a8] disabled:opacity-60"
          >
            {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Approve and prepare send
          </button>
        </div>
      </div>

      <PageHeader
        title={submission.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <span>{submission.business ?? "—"}</span>
            <StatusBadge status={status} />
            <span className="text-[#7d8095]">
              {draft
                ? `Editing draft v${draft.version} · saved ${new Date(draft.updated_at).toLocaleString()}`
                : "Editing draft v1 (unsaved)"}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">Structure</div>
            <ol className="mt-3 space-y-1.5 text-sm">
              {DRAFT_SECTIONS.map((s, i) => (
                <li key={s.key}>
                  <a
                    href={`#${s.key}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-[#171c38] hover:bg-[#fafaf5]"
                  >
                    <span>
                      <span className="text-[#9ca0b8] mr-2">{i + 1}.</span>
                      {s.label}
                    </span>
                    <span className="text-[10px] text-[#9ca0b8]">
                      {(content[s.key] ?? "").trim().length > 0 ? "●" : "○"}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-4 text-[11px] text-[#7d8095]">Word count: {wordCount}</div>
          </Card>
        </div>

        <div className="lg:col-span-9">
          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Roadmap draft for {submission.business ?? submission.name}
            </div>
            <div className="mt-4 space-y-6">
              {DRAFT_SECTIONS.map((s) => (
                <section key={s.key} id={s.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-xl text-[#171c38]">{s.label}</h3>
                    <span className="text-[11px] text-[#9ca0b8]">{s.hint}</span>
                  </div>
                  <textarea
                    value={content[s.key] ?? ""}
                    onChange={(e) =>
                      setContent((c) => ({ ...c, [s.key]: e.target.value }))
                    }
                    rows={5}
                    className="mt-2 w-full rounded-md border border-[#e0e0d8] bg-white p-3 text-sm leading-relaxed text-[#171c38] outline-none focus:border-[#3a4fcf] focus:ring-2 focus:ring-[#3a4fcf]/15"
                  />
                  {showOriginal && (original[s.key] ?? "").trim().length > 0 ? (
                    <div className="mt-2 rounded-md bg-[#fafaf5] p-3 text-xs text-[#5d6079]">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-[#9ca0b8]">
                        Original generation
                      </div>
                      <div className="whitespace-pre-wrap">{original[s.key]}</div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
            <div className="mt-6 rounded-md bg-[#eef1fb] px-4 py-3 text-xs text-[#2842a4]">
              This is a draft. Edits are not delivered until you approve and explicitly send.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
