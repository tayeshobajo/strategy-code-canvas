import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdaptiveIntakeReview,
  type AdaptiveIntakeReview,
} from "@/lib/engine-intake-review.functions";
import { SectionCard, EmptyState, formatDate } from "@/components/engine/primitives";
import { ShieldAlert, Lock } from "lucide-react";

const reviewQueryOptions = (
  projectId: string,
  fn: (i: { data: { projectId: string } }) => Promise<AdaptiveIntakeReview>,
) =>
  queryOptions({
    queryKey: ["engine", "intake-review", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/engine/projects/$projectId/intake")({
  component: AdaptiveIntakeReviewPage,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(
      reviewQueryOptions(
        params.projectId,
        (i) =>
          (
            getAdaptiveIntakeReview as unknown as (i: {
              data: { projectId: string };
            }) => Promise<AdaptiveIntakeReview>
          )(i),
      ),
    );
  },
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">
      Failed to load intake review: {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => <div className="text-sm text-ink/60">No intake linked.</div>,
});

function AdaptiveIntakeReviewPage() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getAdaptiveIntakeReview);
  const { data } = useSuspenseQuery(
    reviewQueryOptions(
      projectId,
      fn as unknown as (i: { data: { projectId: string } }) => Promise<AdaptiveIntakeReview>,
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-[#f1e3b9] bg-[#fbf3e0] px-4 py-3 text-[#7c5c14]">
        <Lock className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Internal command visibility</div>
          <div className="text-xs mt-0.5">
            Everything on this page is operator-only. Nothing here reaches the client portal.
          </div>
        </div>
      </div>

      {!data.linked ? (
        <SectionCard title="No adaptive intake linked">
          <EmptyState
            title="This project was not created from the adaptive intake"
            hint="Engine artifacts below are still shown if the pipeline has run on other sources."
          />
        </SectionCard>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Original first answer">
            {data.detection.first_answer ? (
              <div className="space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-ink/50">
                  {data.detection.first_answer.question || "opening question"}
                </div>
                <div className="rounded-lg border border-border bg-paper-soft p-3 text-sm text-ink whitespace-pre-wrap">
                  {data.detection.first_answer.response}
                </div>
              </div>
            ) : (
              <EmptyState title="No opening answer captured" />
            )}
          </SectionCard>

          <SectionCard title="Detected frame">
            <div className="flex items-center gap-3 flex-wrap">
              <Pill label="Frame" value={data.detection.frame ?? "—"} />
              <Pill label="Subtype" value={data.detection.subtype ?? "—"} />
            </div>
            {data.detection.confirmation_history.length > 0 ? (
              <div className="mt-4">
                <div className="text-xs font-mono uppercase tracking-wider text-ink/50 mb-2">
                  Confirmation history
                </div>
                <ul className="space-y-1 text-xs text-ink/70">
                  {data.detection.confirmation_history.map((c, i) => (
                    <li key={i} className="font-mono">
                      {c.at ? formatDate(c.at) : "—"} · {c.frame}
                      {c.subtype ? ` / ${c.subtype}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={`Questions asked & answers given (${data.conversation.answered.length})`}>
            {data.conversation.answered.length === 0 ? (
              <EmptyState title="No answers recorded" />
            ) : (
              <ol className="space-y-4">
                {data.conversation.answered.map((a, i) => {
                  const reflection = data.conversation.reflections.find((r) => r.key === a.key);
                  const score = data.conversation.objective_scores[a.key];
                  return (
                    <li key={`${a.key}-${i}`} className="border-l-2 border-border pl-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs font-mono uppercase tracking-wider text-ink/50">
                          {a.key}
                          {typeof score === "number" ? ` · score ${score}` : ""}
                        </div>
                      </div>
                      <div className="text-sm text-ink mt-1">{a.question}</div>
                      <div className="mt-1 text-sm text-ink/80 whitespace-pre-wrap">
                        {a.response || <span className="text-ink/40 italic">no response</span>}
                      </div>
                      {reflection && reflection.reflection ? (
                        <div className="mt-2 rounded-md bg-paper-soft border border-border px-2 py-1.5 text-xs text-ink/70">
                          <span className="font-mono uppercase tracking-wider text-ink/50 mr-1">
                            clearer version:
                          </span>
                          {reflection.reflection}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>

          <SectionCard title={`Extracted signals (${data.signals.length})`}>
            {data.signals.length === 0 ? (
              <EmptyState title="No signals extracted yet" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(data.signals_by_category).map(([cat, n]) => (
                    <span
                      key={cat}
                      className="text-[11px] font-mono uppercase tracking-wider rounded-full bg-paper-soft border border-border px-2 py-0.5 text-ink/70"
                    >
                      {cat} · {n}
                    </span>
                  ))}
                </div>
                <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {data.signals.slice(0, 60).map((s) => (
                    <li
                      key={s.id}
                      className="rounded-md border border-border p-2 text-sm"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-medium text-ink">{s.label}</div>
                        <div className="text-[11px] font-mono text-ink/50">
                          {s.category} · {s.confidence}
                          {s.client_safe ? " · safe" : " · internal"}
                        </div>
                      </div>
                      {s.detail ? (
                        <div className="text-xs text-ink/70 mt-1 whitespace-pre-wrap">
                          {s.detail}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {data.signals.length > 60 ? (
                  <div className="text-[11px] text-ink/50 mt-2 font-mono">
                    Showing 60 of {data.signals.length}. Full list in Signal Room.
                  </div>
                ) : null}
              </>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Submission">
            {data.submission ? (
              <ul className="text-sm space-y-1.5 text-ink/80">
                <li>
                  <span className="text-ink/50 text-xs mr-1">Name</span>
                  {data.submission.name || "—"}
                </li>
                <li>
                  <span className="text-ink/50 text-xs mr-1">Business</span>
                  {data.submission.business || "—"}
                </li>
                <li>
                  <span className="text-ink/50 text-xs mr-1">Email</span>
                  {data.submission.email || "—"}
                </li>
                <li>
                  <span className="text-ink/50 text-xs mr-1">Website</span>
                  {data.submission.website || "—"}
                </li>
                <li>
                  <span className="text-ink/50 text-xs mr-1">Role</span>
                  {data.submission.role || "—"}
                </li>
                <li className="text-xs text-ink/50 font-mono pt-1">
                  submitted {formatDate(data.submission.submitted_at)}
                </li>
              </ul>
            ) : (
              <EmptyState title="No submission linked" />
            )}
          </SectionCard>

          <SectionCard title={`Open objectives (${data.conversation.open_objectives.length})`}>
            {data.conversation.open_objectives.length === 0 ? (
              <div className="text-sm text-ink/60">All objectives cleared the bar.</div>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {data.conversation.open_objectives.map((k) => (
                  <li
                    key={k}
                    className="inline-flex items-center gap-1 text-[11px] rounded-full border border-[#f1e3b9] bg-[#fbf3e0] text-[#8a6713] px-2 py-0.5 font-mono"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    {k}
                    <span className="text-[10px] bg-white/70 rounded px-1 ml-0.5">
                      {data.conversation.objective_scores[k] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Sources (${data.sources.length})`}>
            {data.sources.length === 0 ? (
              <EmptyState title="No sources on this project" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.sources.map((s) => (
                  <li key={s.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                    <div className="font-medium text-ink">{s.name}</div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mt-0.5">
                      {s.type} · {s.status}
                      {s.current_stage ? ` · ${s.current_stage}` : ""} · {s.visibility}
                    </div>
                    <div className="text-[11px] text-ink/50 mt-0.5">
                      {s.signals_count} signal{s.signals_count === 1 ? "" : "s"} ·{" "}
                      {formatDate(s.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Pipeline status">
            {data.extraction_runs.length === 0 ? (
              <EmptyState title="No extraction runs yet" />
            ) : (
              <ul className="space-y-3 text-sm">
                {data.extraction_runs.map((r) => (
                  <li key={r.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-ink capitalize">{r.status}</span>
                      <span className="text-[11px] font-mono text-ink/50">
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mt-0.5">
                      {r.signals_count} signals
                      {r.model_intake ? ` · ${r.model_intake}` : ""}
                      {r.model_structured && r.model_structured !== r.model_intake
                        ? ` / ${r.model_structured}`
                        : ""}
                    </div>
                    {r.error ? (
                      <div className="text-xs text-red-700 mt-1 whitespace-pre-wrap">
                        {r.error}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Draft roadmap versions (${data.versions.length})`}>
            {data.versions.length === 0 ? (
              <EmptyState title="No versions yet" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.versions.map((v) => (
                  <li key={v.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">
                        {v.version}
                        {v.label ? ` — ${v.label}` : ""}
                      </span>
                      <span className="text-[11px] font-mono text-ink/50 capitalize">
                        {v.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mt-0.5">
                      by {v.created_by} · preview {v.client_preview_status} ·{" "}
                      {formatDate(v.created_at)}
                    </div>
                    {v.summary ? (
                      <div className="text-xs text-ink/70 mt-1 line-clamp-3">{v.summary}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Review items (${data.review_items.length})`}>
            {data.review_items.length === 0 ? (
              <EmptyState title="No review items" />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.review_items.map((r) => (
                  <li key={r.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                    <div className="font-medium text-ink">{r.title}</div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mt-0.5">
                      {r.item_type} · impact {r.impact} · {r.status} · {formatDate(r.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/50">
        {label}
      </div>
      <div className="text-ink text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
