import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Eye, Loader2, Sparkles } from "lucide-react";
import { Card, PageHeader } from "@/components/ops/Primitives";
import { StatusBadge } from "@/components/ops/StatusBadge";
import {
  addNote,
  approveSubmission,
  archiveSubmission,
  getSubmission,
  rejectSubmission,
  setReviewStatus,
} from "@/lib/ops.functions";
import type { IntakeAnswer } from "@/lib/ops/intake-types";


export const Route = createFileRoute("/ops/submissions/$id")({
  component: SubmissionPage,
});

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function SubmissionPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const detail = useQuery({
    queryKey: ["ops", "submission", id],
    queryFn: () => getSubmission({ data: { id } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ops", "submission", id] });
    qc.invalidateQueries({ queryKey: ["ops", "queue"] });
    qc.invalidateQueries({ queryKey: ["ops", "queue-stats"] });
  };

  const markInReview = useMutation({
    mutationFn: () =>
      setReviewStatus({ data: { id, status: "in_review", reason: "" } }),
    onSuccess: () => {
      toast.success("Marked as in review");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => approveSubmission({ data: { submission_id: id } }),
    onSuccess: (res) => {
      toast.success(res.notified ? "Approved · operator notice queued" : "Approved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (reason: string) =>
      rejectSubmission({ data: { submission_id: id, reason } }),
    onSuccess: () => {
      toast.success("Rejected");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: () => archiveSubmission({ data: { submission_id: id } }),
    onSuccess: () => {
      toast.success("Archived");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noteAdd = useMutation({
    mutationFn: (body: string) =>
      addNote({ data: { submission_id: id, body } }),
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="px-6 py-10 md:px-10">
        <div className="flex items-center gap-2 text-sm text-[#5d6079]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading submission…
        </div>
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="px-6 py-10 md:px-10 text-sm text-[#a4283c]">
        {(detail.error as Error | undefined)?.message ?? "Submission not found"}
      </div>
    );
  }

  const { submission, review, draft, notes, audit } = detail.data;
  const answers: IntakeAnswer[] = submission.answers ?? [];
  const artifact = review?.artifact ?? null;
  const status = review?.status ?? "needs_review";

  return (
    <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="inline-flex items-center gap-2 text-sm text-[#3a4fcf] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </button>
        <Link
          to="/ops/editor/$id"
          params={{ id }}
          className="inline-flex items-center gap-2 rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm font-medium text-[#171c38] hover:bg-[#f9f9f4]"
        >
          <Eye className="h-4 w-4" /> Open in editor
        </Link>
      </div>

      <PageHeader
        title={submission.name}
        subtitle={
          <span className="flex items-center gap-3">
            <span>{submission.business ?? "—"}</span>
            {submission.website ? (
              <a
                href={submission.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#3a4fcf] hover:underline"
              >
                {submission.website.replace(/^https?:\/\//, "")}{" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <StatusBadge status={status} />
            <span className="text-[#7d8095]">
              Submitted {formatStamp(submission.created_at)}
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column — founder & answers */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Founder summary
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Founder" v={submission.name} />
              <Row k="Company" v={submission.business ?? "—"} />
              <Row k="Email" v={submission.email} />
              <Row k="Authorized scan" v={submission.authorizes_scan ? "Yes" : "No"} />
              <Row k="Source" v={submission.source ?? "direct"} />
            </dl>
          </Card>

          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Original intake answers
            </div>
            <div className="mt-2 divide-y divide-[#f1f1ea]">
              {answers.length === 0 ? (
                <div className="py-4 text-sm text-[#7d8095]">No answers captured.</div>
              ) : (
                answers.map((a, i) => (
                  <details key={a.key ?? i} className="group py-2">
                    <summary className="cursor-pointer list-none text-sm font-medium text-[#171c38] flex items-center justify-between">
                      <span className="truncate">
                        {a.question || a.key || `Answer ${i + 1}`}
                      </span>
                      <span className="text-[11px] text-[#9ca0b8] group-open:hidden">expand</span>
                      <span className="hidden text-[11px] text-[#9ca0b8] group-open:inline">collapse</span>
                    </summary>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#3b3f55]">
                      {a.response || <span className="text-[#9ca0b8]">— skipped —</span>}
                    </p>
                  </details>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Center column — generated artifact */}
        <div className="lg:col-span-6">
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
                Generated roadmap
              </div>
              <Link
                to="/ops/editor/$id"
                params={{ id }}
                className="text-xs font-medium text-[#3a4fcf] hover:underline"
              >
                Edit roadmap
              </Link>
            </div>
            {artifact ? (
              <div className="mt-4 space-y-5">
                <ArtifactBlock label="What we heard" body={artifact.draft?.point_a} />
                <ArtifactBlock label="The weight" body={artifact.gap_analysis?.current_weight} />
                <ArtifactBlock label="Why now" body={artifact.gap_analysis?.why_now} />
                <ArtifactBlock label="Opportunity" body={artifact.draft?.point_b} />
                <ArtifactBlock
                  label="Gap hypothesis"
                  body={artifact.draft?.gap_hypothesis}
                />
                <ArtifactBlock label="Suggested first move" body={artifact.draft?.first_move} />
                <ArtifactBlock
                  label="Recommended next step"
                  body={artifact.draft?.point_c}
                />
                {artifact.gap_analysis?.review_questions?.length ? (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-[#7d8095]">
                      Review questions
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-[#3b3f55] space-y-1">
                      {artifact.gap_analysis.review_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#d8d8cf] p-6 text-sm text-[#7d8095]">
                No generated artifact yet for this submission.
              </div>
            )}
            <div className="mt-6 rounded-md bg-[#eef1fb] px-4 py-3 text-xs text-[#2842a4]">
              This roadmap is a draft. Review the signals, add notes, and approve to begin
              delivery. Nothing is sent automatically.
            </div>
          </Card>
        </div>

        {/* Right column — decision + notes + audit */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">Decision</div>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#0c1130] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1a1f48] disabled:opacity-60"
              >
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Approve
              </button>
              <button
                type="button"
                disabled={reject.isPending}
                onClick={() => {
                  const reason = window.prompt("Reason for rejecting? (optional)") ?? "";
                  reject.mutate(reason);
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#a4283c]/40 px-3 py-2.5 text-sm font-medium text-[#a4283c] hover:bg-[#fbe9ec]"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={archive.isPending}
                onClick={() => archive.mutate()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#e0e0d8] px-3 py-2.5 text-sm font-medium text-[#171c38] hover:bg-[#f9f9f4]"
              >
                Archive
              </button>
              <button
                type="button"
                disabled={markInReview.isPending}
                onClick={() => markInReview.mutate()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[#e0e0d8] px-3 py-2.5 text-sm font-medium text-[#171c38] hover:bg-[#f9f9f4]"
              >
                Mark in review
              </button>
            </div>
            {review?.decided_at ? (
              <div className="mt-3 text-[11px] text-[#7d8095]">
                Last decision: {formatStamp(review.decided_at)} · {review.reviewer_email ?? "—"}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Internal notes
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Private to the review team. Founders never see this."
              className="mt-2 w-full rounded-md border border-[#e0e0d8] bg-white p-2 text-sm outline-none focus:border-[#3a4fcf] focus:ring-2 focus:ring-[#3a4fcf]/15"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-[#9ca0b8]">{note.length} / 4000</span>
              <button
                type="button"
                disabled={!note.trim() || noteAdd.isPending}
                onClick={() => noteAdd.mutate(note.trim())}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3a4fcf] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f41a8] disabled:opacity-50"
              >
                {noteAdd.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Add note
              </button>
            </div>
            <ul className="mt-4 space-y-3 max-h-[260px] overflow-auto pr-1">
              {notes.length === 0 ? (
                <li className="text-xs text-[#9ca0b8]">No notes yet.</li>
              ) : (
                notes.map((n) => (
                  <li key={n.id} className="rounded-md bg-[#fafaf5] p-3">
                    <div className="flex items-center justify-between text-[11px] text-[#7d8095]">
                      <span>{n.author_email}</span>
                      <span>{formatStamp(n.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#171c38]">{n.body}</p>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card>
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Audit history
            </div>
            <ol className="mt-3 space-y-2 text-xs">
              {audit.length === 0 ? (
                <li className="text-[#9ca0b8]">No activity yet.</li>
              ) : (
                audit.slice(0, 20).map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[#171c38]">{a.action.replaceAll("_", " ")}</div>
                      <div className="truncate text-[#9ca0b8]">{a.actor_email ?? "system"}</div>
                    </div>
                    <span className="shrink-0 text-[#7d8095]">{formatStamp(a.created_at)}</span>
                  </li>
                ))
              )}
            </ol>
          </Card>
          {draft ? (
            <div className="text-[11px] text-[#7d8095]">
              Editor draft v{draft.version} · last saved {formatStamp(draft.updated_at)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[12px] uppercase tracking-wider text-[#9ca0b8]">{k}</dt>
      <dd className="text-right text-[#171c38]">{v}</dd>
    </div>
  );
}

function ArtifactBlock({
  label,
  body,
}: {
  label: string;
  body?: string | null;
}) {
  if (!body || !body.trim()) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-[#7d8095]">{label}</div>
      <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[#3b3f55]">
        {body}
      </p>
    </div>
  );
}
