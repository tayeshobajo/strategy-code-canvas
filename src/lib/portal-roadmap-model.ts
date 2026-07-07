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

export type RoadmapPointSource = "authored" | "fallback";

export type RoadmapPoint = {
  label: string;
  detail?: string;
  /**
   * "authored" — the detail is real engine/canvas truth authored for this
   * client. "fallback" — derived filler (diagnosis / executive summary),
   * shown as best-effort until the real point is authored.
   */
  source: RoadmapPointSource;
};

/**
 * Resolve the client-facing label for a phase key from real journey data.
 * Never invents demo copy — unknown keys fall back to a neutral "Phase N".
 */
export function phaseDisplayLabel(journey: RoadmapJourney, key: string): string {
  const i = journey.phases.findIndex((p) => p.key === key);
  if (i < 0) return `Phase ${key}`;
  return journey.phases[i].label || `Phase ${i + 1}`;
}

/** "Phase N · Label" heading used by cluster popovers and overlay cards. */
export function phaseDisplayTitle(journey: RoadmapJourney, key: string): string {
  const i = journey.phases.findIndex((p) => p.key === key);
  if (i < 0) return `Phase ${key}`;
  return `Phase ${i + 1} · ${journey.phases[i].label || i + 1}`;
}

export type RoadmapJourney = {
  title: string;
  versionLabel: string | null;
  approvedAt: string | null;
  currentFocus: string | null;
  ownerName: string | null;
  nextMeetingAt: string | null;
  acknowledgedAt: string | null;
  pointA: RoadmapPoint;
  pointB: RoadmapPoint;
  phases: RoadmapPhase[];
  milestones: RoadmapMilestone[];
  activeMilestone: RoadmapMilestone | null;
  nextMilestone: RoadmapMilestone | null;
  /** Single source of truth for "which phase the client is in right now". */
  currentPhaseKey: PhaseKey;
  /** Slug of the next upcoming decision awaiting client input. */
  nextDecisionSlug: string | null;
  /** Slug of the next major deadline. */
  nextDeadlineSlug: string | null;
  /** Ordered slugs on the critical path to the next major deadline. */
  criticalPathSlugs: string[];
  progressPercent: number;
  executiveSummary: string | null;
  recommendedNextMove: string | null;
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
 * Build the phase list from a typed client_safe_canvas snapshot. Canvas
 * phases can have arbitrary IDs; we map the first three (in `sequence`
 * order) onto the UI's now/next/later keys so the existing canvas layout
 * keeps working. Any additional phases roll into "later". Items without a
 * matching phaseId are placed in the first phase.
 */
function phasesFromCanvas(canvas: AnyJson, usedSlugs: Set<string>): RoadmapPhase[] {
  const canvasPhases: AnyJson[] = Array.isArray(canvas?.phases) ? [...canvas.phases] : [];
  canvasPhases.sort((a, b) => (a?.sequence ?? 0) - (b?.sequence ?? 0));

  const phaseKeys: PhaseKey[] = ["now", "next", "later"];
  const idToKey: Record<string, PhaseKey> = {};
  const phases: RoadmapPhase[] = phaseKeys.map((key, i) => {
    const cp = canvasPhases[i];
    if (cp?.id) idToKey[String(cp.id)] = key;
    return {
      key,
      label: cp?.label ? String(cp.label) : PHASE_LABELS[key].label,
      timeframe: cp?.timeframe ? String(cp.timeframe) : PHASE_LABELS[key].timeframe,
      summary: cp?.summary ? String(cp.summary) : undefined,
      milestones: [],
    };
  });
  // Extra canvas phases (beyond 3) collapse into "later".
  for (let i = 3; i < canvasPhases.length; i++) {
    const cp = canvasPhases[i];
    if (cp?.id) idToKey[String(cp.id)] = "later";
  }

  const push = (items: AnyJson[]) => {
    if (!Array.isArray(items)) return;
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const phaseKey: PhaseKey = idToKey[String(raw.phaseId ?? "")] ?? phases[0].key;
      // Adapt canvas item shape to the toMilestone() input contract.
      const mapped = {
        title: raw.title,
        status: raw.status,
        type: raw.type,
        description: raw.clientSafeDescription,
        summary: raw.clientSafeDescription,
        detail: raw.whyItMatters,
        unlocks: raw.whatItUnlocks,
        target_date: raw.targetDate,
        due_date: raw.targetDate,
        client_action_needed: raw.actionNeeded,
        file_url: Array.isArray(raw.relatedFiles) && raw.relatedFiles[0]?.url,
      };
      const idx = phases.find((p) => p.key === phaseKey)!.milestones.length;
      const m = toMilestone(mapped, phaseKey, idx, usedSlugs);
      // Preserve canvas-provided stable id when present.
      if (typeof raw.id === "string" && raw.id.trim()) {
        usedSlugs.delete(m.slug);
        let id = raw.id.trim();
        let attempt = 1;
        while (usedSlugs.has(id)) id = `${raw.id}-${++attempt}`;
        usedSlugs.add(id);
        m.slug = id;
      }
      phases.find((p) => p.key === phaseKey)!.milestones.push(m);
    }
  };

  push(canvas?.milestones);
  push(canvas?.decisions);
  push(canvas?.deliverables);
  push(canvas?.deadlines);
  push(canvas?.clientActions);

  return phases;
}


/**
 * Transform an approved roadmap row into a journey model. Missing fields fall
 * back to a small illustrative default so the canvas still tells a story.
 */
export function buildRoadmapJourney(
  row: AnyJson,
  project?: { point_a?: string | null; point_b?: string | null } | null,
): RoadmapJourney {
  // Prefer the typed client_safe_canvas snapshot generated at publish time.
  // Falls back to the legacy sequence_30_60_90 pipeline when the snapshot is
  // missing (older published rows) or intentionally empty.
  const canvas = row?.client_safe_canvas && typeof row.client_safe_canvas === "object"
    ? row.client_safe_canvas
    : null;
  const canvasItemCount =
    (Array.isArray(canvas?.milestones) ? canvas.milestones.length : 0) +
    (Array.isArray(canvas?.decisions) ? canvas.decisions.length : 0) +
    (Array.isArray(canvas?.deliverables) ? canvas.deliverables.length : 0) +
    (Array.isArray(canvas?.deadlines) ? canvas.deadlines.length : 0) +
    (Array.isArray(canvas?.clientActions) ? canvas.clientActions.length : 0);
  const useCanvas = !!canvas && canvasItemCount > 0;

  const priorities = normalizePriorities(row?.strategic_priorities);
  const usedSlugs = new Set<string>();
  let phases: RoadmapPhase[];

  if (useCanvas) {
    phases = phasesFromCanvas(canvas, usedSlugs);
  } else {
    const buckets = bucketSequence(row?.sequence_30_60_90);
    // Seed Now bucket with strategic priorities so anchor milestones always exist.
    if (buckets.now.length === 0 && priorities.length > 0) {
      buckets.now = priorities.map((p) => ({ title: p.title, summary: p.detail }));
    }
    phases = (Object.keys(PHASE_LABELS) as PhaseKey[]).map((key) => {
      const items = buckets[key];
      const milestones = items.map((it, i) => toMilestone(it, key, i, usedSlugs));
      return {
        key,
        label: PHASE_LABELS[key].label,
        timeframe: PHASE_LABELS[key].timeframe,
        milestones,
      };
    });
  }

  // Ensure every phase has at least a placeholder so the canvas keeps shape.
  for (const p of phases) {
    if (p.milestones.length === 0) {
      p.milestones.push({
        slug: `${p.key}-placeholder`,
        title: `${p.label} — coming into focus`,
        phase: p.key,
        status: "upcoming",
        kind: "milestone",
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

  // --- Single source of truth for the "current phase" -----------------
  // Precedence:
  //   1. First phase that contains an in_progress milestone
  //   2. Phase of the activeMilestone
  //   3. First phase with any non-complete milestone
  //   4. First phase
  let currentPhaseKey: PhaseKey = phases[0].key;
  const phaseWithInProgress = phases.find((p) =>
    p.milestones.some((m) => m.status === "in_progress"),
  );
  if (phaseWithInProgress) {
    currentPhaseKey = phaseWithInProgress.key;
  } else if (activeMilestone) {
    currentPhaseKey = activeMilestone.phase;
  } else {
    const phaseWithPending = phases.find((p) =>
      p.milestones.some((m) => m.status !== "completed"),
    );
    if (phaseWithPending) currentPhaseKey = phaseWithPending.key;
  }

  // Next decision awaiting the client.
  const nextDecisionSlug =
    flat.find(
      (m) =>
        m.kind === "decision" &&
        (m.status === "in_progress" || m.status === "upcoming"),
    )?.slug ?? null;

  // Next major deadline: the earliest dueDate among non-completed items.
  const withDeadlines = flat
    .filter((m) => m.dueDate && m.status !== "completed")
    .map((m) => ({ m, t: new Date(m.dueDate!).getTime() }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  const nextDeadlineSlug = withDeadlines[0]?.m.slug ?? null;

  // Critical path: from the current active milestone forward through
  // in_progress + upcoming milestones (excluding placeholders) up to the
  // next deadline, plus the deadline milestone itself.
  const criticalPathSlugs: string[] = [];
  const startIdx = activeMilestone
    ? flat.findIndex((m) => m.slug === activeMilestone.slug)
    : 0;
  for (let i = Math.max(0, startIdx); i < flat.length; i++) {
    const m = flat[i];
    if (m.slug.endsWith("-placeholder")) continue;
    if (m.status === "completed") continue;
    criticalPathSlugs.push(m.slug);
    if (m.slug === nextDeadlineSlug) break;
  }

  return {
    title: row?.title ?? "Your Roadmap",
    versionLabel: row?.version_label ?? null,
    approvedAt: row?.approved_at ?? null,
    currentFocus: row?.current_focus ?? null,
    ownerName: row?.owner_name ?? "Trust Tai",
    nextMeetingAt: row?.next_meeting_at ?? null,
    acknowledgedAt,
    // Real authored labels when the published canvas carries them; neutral
    // defaults otherwise — never demo copy. The source tag distinguishes
    // authored truth (canvas / engine project field) from derived filler
    // (diagnosis / executive summary).
    pointA: {
      label: (canvas?.pointA?.label as string | undefined)?.trim() || "Current state",
      detail:
        (canvas?.pointA?.detail as string | undefined) ??
        project?.point_a ??
        row?.current_diagnosis ??
        undefined,
      source:
        canvas?.pointA?.source === "authored" || canvas?.pointA?.source === "fallback"
          ? (canvas.pointA.source as RoadmapPointSource)
          : canvas?.pointA?.detail || project?.point_a
            ? "authored"
            : "fallback",
    },
    pointB: {
      label: (canvas?.pointB?.label as string | undefined)?.trim() || "Destination",
      detail:
        (canvas?.pointB?.detail as string | undefined) ??
        project?.point_b ??
        row?.executive_summary ??
        undefined,
      source:
        canvas?.pointB?.source === "authored" || canvas?.pointB?.source === "fallback"
          ? (canvas.pointB.source as RoadmapPointSource)
          : canvas?.pointB?.detail || project?.point_b
            ? "authored"
            : "fallback",
    },
    phases,
    milestones: flat,
    activeMilestone,
    nextMilestone,
    currentPhaseKey,
    nextDecisionSlug,
    nextDeadlineSlug,
    criticalPathSlugs,
    progressPercent,
    executiveSummary: row?.executive_summary ?? null,
    recommendedNextMove: row?.recommended_next_move ?? null,
    risksDependencies: toStringArray(row?.risks_dependencies),
    strategicPriorities: priorities,
    shareUrl: row?.share_url ?? null,
  };
}
