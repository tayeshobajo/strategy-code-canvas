type SpineVersionHistoryProps = {
  auditCount: number;
  currentVersionLabel: string | null;
};

export function SpineVersionHistory({
  auditCount,
  currentVersionLabel,
}: SpineVersionHistoryProps) {
  return (
    <details className="rounded-2xl border border-[#E8E1D6] bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-lg text-[#0A0F1F]">Spine Version History</div>
            <div className="mt-1 text-sm text-[#667085]">
              Version history pending migration
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.22em] text-[#667085]">
            Click to expand
          </div>
        </div>
      </summary>
      <div className="border-t border-[#E8E1D6] px-5 py-4">
        <div className="rounded-xl border border-[#F3E6C7] bg-[#FFF8E8] p-4 text-sm text-[#6F5612]">
          Approved spine changes are not yet field-versioned in the database. The current codebase
          writes Point A / Point B edits directly to `engine_projects`, so diff history and
          approver-linked reason tracking are blocked until the new table is added.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard
            label="Current roadmap version"
            value={currentVersionLabel ?? "No labeled version"}
            tone="text-[#0A0F1F]"
          />
          <StatCard
            label="Recent audit rows"
            value={String(auditCount)}
            tone="text-[#0A0F1F]"
          />
          <StatCard
            label="Blocking dependency"
            value="engine_spine_versions migration"
            tone="text-[#A4283C]"
          />
        </div>

        <div className="mt-4 space-y-2 text-sm text-[#667085]">
          <p>Required before full Phase 4B implementation:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Add an `engine_spine_versions` table with field name, old value, new value,
              changed_by, changed_at, reason, approver, and project linkage.
            </li>
            <li>
              Update the approved spine mutation path to require a reason and insert both
              `engine_spine_versions` and `engine_activity` records.
            </li>
            <li>
              Load those records here for operator diff review once the migration is applied.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
        {label}
      </div>
      <div className={`mt-2 text-sm font-medium ${tone}`}>{value}</div>
    </div>
  );
}
