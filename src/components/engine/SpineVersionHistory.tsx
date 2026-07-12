import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSpineFieldHistory, type SpineFieldHistoryEntry } from "@/lib/engine.functions";

type SpineVersionHistoryProps = {
  projectId: string;
  currentVersionLabel: string | null;
};

export function SpineVersionHistory({
  projectId,
  currentVersionLabel,
}: SpineVersionHistoryProps) {
  const fetchHistory = useServerFn(getSpineFieldHistory);
  const q = useQuery({
    queryKey: ["engine", "spine-history", projectId],
    queryFn: () => fetchHistory({ data: { projectId, limit: 25 } }),
    staleTime: 30_000,
  });

  const entries = q.data?.entries ?? [];

  return (
    <details className="rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-lg text-[#0A0F1F]">Spine Version History</div>
            <div className="mt-1 text-sm text-[#667085]">
              {q.isPending
                ? "Loading history…"
                : entries.length
                  ? `${entries.length} recent spine field change${entries.length === 1 ? "" : "s"}`
                  : "No spine field changes recorded yet"}
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.22em] text-[#667085]">
            Click to expand
          </div>
        </div>
      </summary>
      <div className="border-t border-[#E8E1D6] px-5 py-4">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <StatCard
            label="Current roadmap version"
            value={currentVersionLabel ?? "No labeled version"}
          />
          <StatCard label="Field-change entries loaded" value={String(entries.length)} />
        </div>

        {q.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {(q.error as Error | null)?.message ?? "Failed to load spine history."}
          </div>
        ) : entries.length === 0 && !q.isPending ? (
          <p className="text-sm text-[#667085]">
            No approved spine field changes have been recorded for this project. Edits to Point A
            or Point B will appear here with old → new diffs, the acting operator, and any reason
            provided.
          </p>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry) => (
              <SpineHistoryRow key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

function SpineHistoryRow({ entry }: { entry: SpineFieldHistoryEntry }) {
  const when = new Date(entry.created_at);
  const whenLabel = Number.isNaN(when.getTime())
    ? entry.created_at
    : when.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  const oldPreview = formatJsonPreview(entry.old_value_json);
  const newPreview = formatJsonPreview(entry.new_value_json);

  return (
    <li className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
            {entry.field_changed ?? "spine"}
          </div>
          <div className="mt-1 text-sm font-medium text-[#0A0F1F]">
            {entry.summary ?? "Spine field updated"}
          </div>
        </div>
        <div className="text-xs text-[#667085]">
          {entry.actor_email ?? "system"} · {whenLabel}
        </div>
      </div>

      {entry.reason ? (
        <div className="mt-3 rounded-lg border border-[#F3E6C7] bg-[#FFF8E8] px-3 py-2 text-xs text-[#6F5612]">
          Reason: {entry.reason}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DiffBlock label="Previous" value={oldPreview} tone="text-[#8a6713]" />
        <DiffBlock label="New" value={newPreview} tone="text-[#0A0F1F]" />
      </div>
    </li>
  );
}

function DiffBlock({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-[#E8E1D6] bg-white p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <pre className={`mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs ${tone}`}>
        {value}
      </pre>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[#0A0F1F]">{value}</div>
    </div>
  );
}

function formatJsonPreview(json: string | null): string {
  if (json == null) return "—";
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "string") return parsed;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}
