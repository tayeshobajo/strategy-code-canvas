/**
 * Pure transformer that maps an approved `client_portal_roadmaps` row into a
 * structured journey model (Point A → phases → Point B) that the interactive
 * canvas can render. No React, no server access — safe to unit-test.
 */

export type MilestoneStatus =
  | "completed"
  | "in_progress"
  | "upcoming"
  | "blocked"
  | "optional";

export type PhaseKey = "now" | "next" | "later";

export type MilestoneKind = "milestone" | "decision" | "deliverable" | "meeting";

export type RoadmapMilestone = {
  slug: string;
  title: string;
  phase: PhaseKey;
  status: MilestoneStatus;
  kind: MilestoneKind;
  summary?: string;
  detail?: string;
  successLooksLike?: string;
  dependencies?: string[];
  actions?: string[];
  ownerNote?: string;
  targetDate?: string;
  dueDate?: string;
  unlocks?: string[];
  latestUpdate?: string;
  clientActionNeeded?: string;
  // Decision-specific
  options?: string[];
  recommendedOption?: string;
  // Deliverable-specific
  fileUrl?: string;
  fileType?: string;
  version?: string;
  publishedAt?: string;
  // Meeting-specific
  meetingAt?: string;
  meetingPurpose?: string;
  meetingUrl?: string;
};

export type RoadmapPhase = {
  key: PhaseKey;
  label: string;
  timeframe: string;
  summary?: string;
  milestones: RoadmapMilestone[];
};

export type RoadmapJourney = {
  title: string;
  versionLabel: string | null;
  approvedAt: string | null;
  currentFocus: string | null;
  ownerName: string | null;
  nextMeetingAt: string | null;
  acknowledgedAt: string | null;
  pointA: { label: string; detail?: string };
  pointB: { label: string; detail?: string };
  phases: RoadmapPhase[];
  milestones: RoadmapMilestone[];
  activeMilestone: RoadmapMilestone | null;
  nextMilestone: RoadmapMilestone | null;
  progressPercent: number;
  executiveSummary: string | null;
  recommendedNextMove: string | null;
  supportingNotes: string | null;
  risksDependencies: string[];
  strategicPriorities: Array<{ title: string; detail?: string }>;
  shareUrl: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

const PHASE_LABELS: Record<PhaseKey, { label: string; timeframe: string }> = {
  now: { label: "Now", timeframe: "First 30 days" },
  next: { label: "Next", timeframe: "Days 31–60" },
  later: { label: "Later", timeframe: "Days 61–90" },
};

function slugify(input: string, seed: number): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  return base || `milestone-${seed}`;
}

function toStringArray(input: AnyJson): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return (
            item.title ??
            item.name ??
            item.risk ??
            item.summary ??
            item.detail ??
            item.description ??
            JSON.stringify(item)
          );
        }
        return String(item);
      })
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\n+|•|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePriorities(
  input: AnyJson,
): Array<{ title: string; detail?: string }> {
  if (!input || !Array.isArray(input)) return [];
  return input
    .map((p, i) => {
      if (typeof p === "string") return { title: p };
      if (p && typeof p === "object") {
        return {
          title: p.title ?? p.name ?? `Priority ${i + 1}`,
          detail: p.detail ?? p.description ?? p.summary ?? undefined,
        };
      }
      return { title: String(p) };
    })
    .filter((p) => p.title);
}

/**
 * Try to coerce the free-form `sequence_30_60_90` JSON into three phase
 * buckets. Accepts a handful of shapes commonly emitted by the roadmap engine:
 *   { now: [...], next: [...], later: [...] }
 *   { "0-30": [...], "31-60": [...], "61-90": [...] }
 *   { days_30: [...], days_60: [...], days_90: [...] }
 *   [{ phase: "now", items: [...] }, ...]
 *   [{ horizon: "30-60", milestones: [...] }, ...]
 */
function bucketSequence(
  input: AnyJson,
): Record<PhaseKey, Array<AnyJson>> {
  const buckets: Record<PhaseKey, AnyJson[]> = { now: [], next: [], later: [] };
  if (!input) return buckets;

  const assign = (key: PhaseKey, items: AnyJson[]) => {
    for (const it of items) buckets[key].push(it);
  };

  const detect = (raw: string): PhaseKey | null => {
    const k = raw.toLowerCase();
    if (/(^|[^a-z])(now|first|0-?30|30 ?day|month ?1)/.test(k)) return "now";
    if (/(next|31-?60|60 ?day|month ?2)/.test(k)) return "next";
    if (/(later|61-?90|90 ?day|month ?3)/.test(k)) return "later";
    return null;
  };

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== "object") continue;
      const label =
        entry.phase ?? entry.horizon ?? entry.window ?? entry.timeframe ?? "";
      const key = detect(String(label));
      const items = entry.items ?? entry.milestones ?? entry.tasks ?? [];
      if (key && Array.isArray(items)) assign(key, items);
    }
    return buckets;
  }

  if (typeof input === "object") {
    for (const [rawKey, val] of Object.entries(input)) {
      const key = detect(rawKey);
      if (!key || !Array.isArray(val)) continue;
      assign(key, val as AnyJson[]);
    }
  }
  return buckets;
}

function toMilestone(
  item: AnyJson,
  phase: PhaseKey,
  index: number,
  usedSlugs: Set<string>,
): RoadmapMilestone {
  const raw =
    typeof item === "string"
      ? { title: item }
      : item && typeof item === "object"
        ? item
        : { title: String(item ?? `Milestone ${index + 1}`) };

  const title = String(
    raw.title ?? raw.name ?? raw.milestone ?? `Milestone ${index + 1}`,
  );
  let slug = slugify(title, index);
  let attempt = 1;
  while (usedSlugs.has(slug)) slug = `${slug}-${++attempt}`;
  usedSlugs.add(slug);

  const rawStatus = String(raw.status ?? "").toLowerCase();
  const status: MilestoneStatus =
    rawStatus === "completed" || rawStatus === "done"
      ? "completed"
      : rawStatus === "in_progress" || rawStatus === "active"
        ? "in_progress"
        : rawStatus === "blocked"
          ? "blocked"
          : rawStatus === "optional" || rawStatus === "future"
            ? "optional"
            : "upcoming";

  const rawKind = String(raw.kind ?? raw.type ?? "").toLowerCase();
  const kind: MilestoneKind =
    rawKind === "decision"
      ? "decision"
      : rawKind === "deliverable" || raw.file_url || raw.fileUrl
        ? "deliverable"
        : rawKind === "meeting" || raw.meeting_at || raw.meetingAt
          ? "meeting"
          : "milestone";

  return {
    slug,
    title,
    phase,
    status,
    kind,
    summary: raw.summary ?? raw.description ?? raw.goal ?? undefined,
    detail: raw.detail ?? raw.description ?? raw.summary ?? undefined,
    successLooksLike:
      raw.success ?? raw.success_looks_like ?? raw.outcome ?? undefined,
    dependencies: toStringArray(raw.dependencies ?? raw.deps),
    actions: toStringArray(raw.actions ?? raw.key_actions ?? raw.next_actions),
    ownerNote: raw.owner_note ?? raw.notes ?? raw.tai_note ?? undefined,
    targetDate: raw.target_date ?? raw.targetDate ?? undefined,
    dueDate: raw.due_date ?? raw.dueDate ?? undefined,
    unlocks: toStringArray(raw.unlocks ?? raw.enables),
    latestUpdate: raw.latest_update ?? raw.latestUpdate ?? undefined,
    clientActionNeeded:
      raw.client_action_needed ?? raw.clientActionNeeded ?? undefined,
    options: toStringArray(raw.options ?? raw.choices),
    recommendedOption:
      raw.recommended_option ?? raw.recommendedOption ?? undefined,
    fileUrl: raw.file_url ?? raw.fileUrl ?? undefined,
    fileType: raw.file_type ?? raw.fileType ?? undefined,
    version: raw.version ?? undefined,
    publishedAt: raw.published_at ?? raw.publishedAt ?? undefined,
    meetingAt: raw.meeting_at ?? raw.meetingAt ?? undefined,
    meetingPurpose: raw.meeting_purpose ?? raw.meetingPurpose ?? undefined,
    meetingUrl: raw.meeting_url ?? raw.meetingUrl ?? undefined,
  };
}

/**
 * Transform an approved roadmap row into a journey model. Missing fields fall
 * back to a small illustrative default so the canvas still tells a story.
 */
export function buildRoadmapJourney(
  row: AnyJson,
  project?: { point_a?: string | null; point_b?: string | null } | null,
): RoadmapJourney {
  const buckets = bucketSequence(row?.sequence_30_60_90);
  const priorities = normalizePriorities(row?.strategic_priorities);

  // Seed Now bucket with strategic priorities so anchor milestones always exist.
  if (buckets.now.length === 0 && priorities.length > 0) {
    buckets.now = priorities.map((p) => ({
      title: p.title,
      summary: p.detail,
    }));
  }

  const usedSlugs = new Set<string>();
  const phases: RoadmapPhase[] = (Object.keys(PHASE_LABELS) as PhaseKey[]).map(
    (key) => {
      const items = buckets[key];
      const milestones = items.map((it, i) =>
        toMilestone(it, key, i, usedSlugs),
      );
      return {
        key,
        label: PHASE_LABELS[key].label,
        timeframe: PHASE_LABELS[key].timeframe,
        milestones,
      };
    },
  );

  // Ensure every phase has at least a placeholder so the canvas keeps shape.
  for (const p of phases) {
    if (p.milestones.length === 0) {
      p.milestones.push({
        slug: `${p.key}-placeholder`,
        title: `${p.label} — coming into focus`,
        phase: p.key,
        status: "upcoming",
        summary: "Tai will populate this horizon as the roadmap evolves.",
      });
    }
  }

  const acknowledgedAt = row?.acknowledged_at ?? null;
  const flat: RoadmapMilestone[] = phases.flatMap((p) => p.milestones);

  // Derive statuses when the raw data didn't specify:
  //   - If the client has acknowledged, mark the first Now milestone as
  //     in_progress; earlier explicit "completed" statuses are preserved.
  //   - Otherwise the first Now milestone is in_progress, rest upcoming.
  const firstNow = phases[0].milestones[0];
  if (firstNow && firstNow.status === "upcoming") {
    firstNow.status = "in_progress";
  }
  if (acknowledgedAt) {
    // Mark milestones flagged as done in metadata; otherwise leave.
    for (const m of flat) {
      if (m.slug.endsWith("-placeholder")) continue;
      if (m.status === "upcoming" && m === firstNow) m.status = "in_progress";
    }
  }

  const completed = flat.filter((m) => m.status === "completed").length;
  const inProgress = flat.filter((m) => m.status === "in_progress").length;
  const total = flat.filter((m) => !m.slug.endsWith("-placeholder")).length || 1;
  const progressPercent = Math.min(
    100,
    Math.round(((completed + inProgress * 0.5) / total) * 100),
  );

  const activeMilestone =
    flat.find((m) => m.status === "in_progress") ??
    flat.find((m) => m.status === "upcoming") ??
    null;
  const nextMilestone =
    flat.find(
      (m) => m.status === "upcoming" && m.slug !== activeMilestone?.slug,
    ) ?? null;

  return {
    title: row?.title ?? "Your Roadmap",
    versionLabel: row?.version_label ?? null,
    approvedAt: row?.approved_at ?? null,
    currentFocus: row?.current_focus ?? null,
    ownerName: row?.owner_name ?? "Trust Tai",
    nextMeetingAt: row?.next_meeting_at ?? null,
    acknowledgedAt,
    pointA: {
      label: "Current state",
      detail: project?.point_a ?? row?.current_diagnosis ?? undefined,
    },
    pointB: {
      label: "Destination",
      detail: project?.point_b ?? row?.executive_summary ?? undefined,
    },
    phases,
    milestones: flat,
    activeMilestone,
    nextMilestone,
    progressPercent,
    executiveSummary: row?.executive_summary ?? null,
    recommendedNextMove: row?.recommended_next_move ?? null,
    supportingNotes: row?.supporting_notes ?? null,
    risksDependencies: toStringArray(row?.risks_dependencies),
    strategicPriorities: priorities,
    shareUrl: row?.share_url ?? null,
  };
}
