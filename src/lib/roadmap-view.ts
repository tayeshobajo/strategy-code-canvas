/**
 * Roadmap Read Model — pure, no DB, no React.
 *
 * Derives the Roadmap tab's view model from durable inputs. Mirrors the
 * doctrine in the Roadmap implementation brief: phases → milestones →
 * dependencies → critical path → health → captain brief scaffold.
 *
 * Every visible roadmap state must be backed by durable records. Drafts
 * remain drafts. Approved baselines remain protected.
 */

import type { SpineMilestone } from "@/lib/engine.functions";

export type RoadmapPhaseStatus =
  | "planned"
  | "ready"
  | "active"
  | "at_risk"
  | "blocked"
  | "complete";

export type RoadmapPhaseHealth = "on_track" | "needs_attention" | "at_risk" | "unknown";

export type RoadmapPhase = {
  key: string;
  order: number;
  name: string;
  outcome: string | null;
  rationale: string | null;
  status: RoadmapPhaseStatus;
  health: RoadmapPhaseHealth;
  client_safe_summary: string | null;
  owner: string | null;
  start: string | null;
  end: string | null;
  milestone_ids: string[];
  milestone_count: number;
  completed_count: number;
  active_count: number;
  blocked_count: number;
};

export type RoadmapMilestoneView = {
  id: string;
  name: string;
  outcome: string | null;
  phase: string | null;
  status: string;
  approval_status: string;
  health: RoadmapPhaseHealth;
  due_date: string | null;
  start_date: string | null;
  owner: string | null;
  on_critical_path: boolean;
  blocked_by: string[];
  readiness: SpineMilestone["readiness"];
  parent_project_id?: string | null;
};

export type RoadmapDependency = {
  id: string;
  from_id: string;
  to_id: string;
  type: "milestone" | "phase" | "cross_project" | "external";
  status: "ok" | "at_risk" | "blocked";
  reason: string | null;
};

export type RoadmapCriticalPath = {
  bottleneck_id: string | null;
  bottleneck_name: string | null;
  downstream_impact_count: number;
  delay_days: number | null;
  reason: string | null;
  recovery: string | null;
};

export type RoadmapHealth = {
  score: number;
  label: "excellent" | "good" | "needs_attention" | "at_risk" | "unknown";
  drivers: string[];
};

export type RoadmapCaptainBrief = {
  what_changed: string | null;
  what_matters_now: string | null;
  recommendation: string | null;
  watch_for: string | null;
};

export type RoadmapChangeSummary = {
  since_label: string | null;
  since_date: string | null;
  added: string[];
  changed: string[];
  removed: string[];
  resequenced: string[];
};

export type RoadmapMode =
  | "no_truth"
  | "draft_generating"
  | "draft"
  | "approved"
  | "error";

export type RoadmapVersionMeta = {
  id: string;
  label: string;
  status: "draft" | "approved" | "archived";
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  locked: boolean;
};

export type RoadmapSummary = {
  current_phase_name: string | null;
  current_phase_range: string | null;
  phases_complete: number;
  phases_total: number;
  active_milestones: number;
  blocked_milestones: number;
  ready_for_build: number;
  ready_for_qa: number;
  target_date: string | null;
  target_days_remaining: number | null;
  roadmap_health_label: RoadmapHealth["label"];
  roadmap_health_score: number;
};

export type RoadmapView = {
  mode: RoadmapMode;
  version: RoadmapVersionMeta | null;
  point_a: { title: string; description: string | null } | null;
  point_b: { title: string; description: string | null } | null;
  phases: RoadmapPhase[];
  milestones: RoadmapMilestoneView[];
  dependencies: RoadmapDependency[];
  critical_path: RoadmapCriticalPath;
  health: RoadmapHealth;
  summary: RoadmapSummary;
  captain_brief: RoadmapCaptainBrief;
  change_summary: RoadmapChangeSummary;
  missing_for_approval: string[];
  totals: {
    completed: number;
    in_progress: number;
    blocked: number;
    planned: number;
    total: number;
    by_phase: Array<{ key: string; name: string; done: number; total: number }>;
  };
  cross_project_dependencies: Array<{
    id: string;
    label: string;
    status: "on_track" | "at_risk" | "blocked";
  }>;
  last_change: { title: string; at: string } | null;
};

export type RoadmapViewInputs = {
  point_a_approved: boolean;
  point_b_approved: boolean;
  point_a_summary: { title: string; description: string | null } | null;
  point_b_summary: { title: string; description: string | null } | null;
  version:
    | (RoadmapVersionMeta & { payload?: unknown })
    | null;
  milestones: ReadonlyArray<SpineMilestone & { start_date?: string | null; owner?: string | null }>;
  prior_version_payload?: unknown;
  activity: ReadonlyArray<{ id: string; kind: string; title: string; severity: string; created_at: string }>;
  reviews: ReadonlyArray<{ id: string; title: string; item_type: string; impact: string; status: string; created_at: string }>;
  family: ReadonlyArray<{ id: string; name: string; status: "on_track" | "at_risk" | "blocked" }>;
  today?: Date;
};

// ---------- helpers ----------

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function readPayloadPhases(payload: unknown): Array<{
  key?: string;
  name?: string;
  outcome?: string;
  rationale?: string;
  order?: number;
  owner?: string;
  status?: string;
  health?: string;
  client_safe_summary?: string;
  start?: string;
  end?: string;
}> {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const phases = p.phases ?? (p.roadmap as Record<string, unknown> | undefined)?.phases;
  return Array.isArray(phases) ? (phases as Array<Record<string, unknown>>) : [];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function phaseStatusFromMilestones(ms: RoadmapMilestoneView[]): RoadmapPhaseStatus {
  if (ms.length === 0) return "planned";
  const allComplete = ms.every((m) => m.status === "complete" || m.approval_status === "approved" && m.status === "done");
  if (allComplete) return "complete";
  const anyBlocked = ms.some((m) => m.status === "blocked");
  if (anyBlocked) return "blocked";
  const anyActive = ms.some((m) => m.status === "in_progress" || m.status === "active");
  const anyAtRisk = ms.some((m) => m.health === "at_risk");
  if (anyActive && anyAtRisk) return "at_risk";
  if (anyActive) return "active";
  const anyReady = ms.some((m) => m.readiness.criteria === "done");
  return anyReady ? "ready" : "planned";
}

function milestoneHealth(m: SpineMilestone): RoadmapPhaseHealth {
  if (m.status === "blocked" || m.approval_status === "rejected") return "at_risk";
  const r = m.readiness;
  const anyBlocked = [r.criteria, r.build, r.qa_auto, r.qa_human, r.dependencies, r.blockers].includes("blocked");
  if (anyBlocked) return "needs_attention";
  const anyReview = [r.criteria, r.build, r.qa_auto, r.qa_human].some((s) => s === "review");
  if (anyReview) return "needs_attention";
  return "on_track";
}

// ---------- main ----------

export function deriveRoadmapView(input: RoadmapViewInputs): RoadmapView {
  const today = input.today ?? new Date();

  // Mode
  const mode: RoadmapMode = (() => {
    if (!input.point_a_approved || !input.point_b_approved) {
      // legacy escape hatch — if milestones or a version exist, treat as draft/approved
      if (input.version || input.milestones.length > 0) {
        return input.version?.status === "approved" ? "approved" : "draft";
      }
      return "no_truth";
    }
    if (!input.version) return "draft_generating";
    return input.version.status === "approved" ? "approved" : "draft";
  })();

  // Milestones view
  const milestones: RoadmapMilestoneView[] = input.milestones.map((m) => {
    const deps = Array.isArray(m.dependencies)
      ? (m.dependencies as unknown[]).filter((v) => typeof v === "string") as string[]
      : [];
    return {
      id: m.id,
      name: m.name,
      outcome: m.brief_md ? m.brief_md.split(/\n/)[0].slice(0, 200) : null,
      phase: m.phase,
      status: m.status,
      approval_status: m.approval_status,
      health: milestoneHealth(m),
      due_date: m.due_date,
      start_date: m.start_date ?? null,
      owner: m.owner ?? null,
      on_critical_path: false, // filled below
      blocked_by: deps,
      readiness: m.readiness,
    };
  });

  // Phases — payload first, fall back to distinct phase strings.
  const payloadPhases = readPayloadPhases(input.version?.payload);
  const phaseKeys = new Map<string, RoadmapPhase>();

  payloadPhases.forEach((p, idx) => {
    const name = String(p.name ?? `Phase ${idx + 1}`);
    const key = String(p.key ?? slug(name) ?? `phase-${idx + 1}`);
    phaseKeys.set(key, {
      key,
      order: typeof p.order === "number" ? p.order : idx + 1,
      name,
      outcome: (p.outcome as string) ?? null,
      rationale: (p.rationale as string) ?? null,
      status: (p.status as RoadmapPhaseStatus) ?? "planned",
      health: (p.health as RoadmapPhaseHealth) ?? "unknown",
      client_safe_summary: (p.client_safe_summary as string) ?? null,
      owner: (p.owner as string) ?? null,
      start: (p.start as string) ?? null,
      end: (p.end as string) ?? null,
      milestone_ids: [],
      milestone_count: 0,
      completed_count: 0,
      active_count: 0,
      blocked_count: 0,
    });
  });

  // Group milestones under phases; create fallback phases for orphans.
  for (const m of milestones) {
    const phaseName = m.phase ?? "Unphased";
    const key = slug(phaseName) || "unphased";
    if (!phaseKeys.has(key)) {
      phaseKeys.set(key, {
        key,
        order: phaseKeys.size + 1,
        name: phaseName,
        outcome: null,
        rationale: null,
        status: "planned",
        health: "unknown",
        client_safe_summary: null,
        owner: null,
        start: null,
        end: null,
        milestone_ids: [],
        milestone_count: 0,
        completed_count: 0,
        active_count: 0,
        blocked_count: 0,
      });
    }
    const ph = phaseKeys.get(key)!;
    ph.milestone_ids.push(m.id);
  }

  const phases: RoadmapPhase[] = Array.from(phaseKeys.values()).sort(
    (a, b) => a.order - b.order,
  );

  // Fill per-phase derived fields
  for (const ph of phases) {
    const ms = ph.milestone_ids
      .map((id) => milestones.find((m) => m.id === id))
      .filter(Boolean) as RoadmapMilestoneView[];
    ph.milestone_count = ms.length;
    ph.completed_count = ms.filter((m) => m.status === "complete" || m.status === "done").length;
    ph.active_count = ms.filter((m) => m.status === "in_progress" || m.status === "active").length;
    ph.blocked_count = ms.filter((m) => m.status === "blocked").length;
    if (!ph.start || !ph.end) {
      const dues = ms.map((m) => parseDate(m.due_date)).filter(Boolean) as Date[];
      const starts = ms.map((m) => parseDate(m.start_date)).filter(Boolean) as Date[];
      const all = [...dues, ...starts];
      if (all.length > 0) {
        ph.start = ph.start ?? new Date(Math.min(...all.map((d) => d.getTime()))).toISOString();
        ph.end = ph.end ?? new Date(Math.max(...dues.map((d) => d.getTime()))).toISOString();
      }
    }
    if (ph.status === "planned") ph.status = phaseStatusFromMilestones(ms);
    if (ph.health === "unknown") {
      if (ph.blocked_count > 0) ph.health = "at_risk";
      else if (ms.some((m) => m.health === "needs_attention")) ph.health = "needs_attention";
      else if (ms.length > 0) ph.health = "on_track";
    }
  }

  // Dependencies from milestone.dependencies + cross-project family links
  const dependencies: RoadmapDependency[] = [];
  for (const m of milestones) {
    for (const dep of m.blocked_by) {
      const upstream = milestones.find((x) => x.id === dep);
      const status: RoadmapDependency["status"] =
        upstream?.status === "blocked"
          ? "blocked"
          : upstream?.health === "at_risk"
            ? "at_risk"
            : "ok";
      dependencies.push({
        id: `${dep}->${m.id}`,
        from_id: dep,
        to_id: m.id,
        type: "milestone",
        status,
        reason: upstream?.status === "blocked" ? `${upstream.name} is blocked` : null,
      });
    }
  }

  // Critical path — longest chain by due-date; mark milestones on it.
  const criticalPath = computeCriticalPath(milestones, dependencies);
  for (const id of criticalPath.chain) {
    const m = milestones.find((x) => x.id === id);
    if (m) m.on_critical_path = true;
  }

  // Summary + health
  const totalPhases = phases.length;
  const phasesComplete = phases.filter((p) => p.status === "complete").length;
  const activePhase = phases.find((p) => p.status === "active" || p.status === "at_risk")
    ?? phases.find((p) => p.status === "ready")
    ?? phases[phasesComplete] ?? null;

  const activeMs = milestones.filter((m) => m.status === "in_progress" || m.status === "active").length;
  const blockedMs = milestones.filter((m) => m.status === "blocked").length;
  const readyBuild = milestones.filter((m) =>
    m.readiness.criteria === "done" &&
    (m.readiness.mockups === "done" || m.readiness.mockups === "not_configured" || m.readiness.mockups === "not_applicable") &&
    m.readiness.build !== "done" && m.readiness.build !== "blocked",
  ).length;
  const readyQa = milestones.filter((m) =>
    m.readiness.build === "done" &&
    m.readiness.qa_human !== "done",
  ).length;

  // Target date = latest due date in approved milestones
  const dueDates = milestones.map((m) => parseDate(m.due_date)).filter(Boolean) as Date[];
  const targetDate = dueDates.length > 0
    ? new Date(Math.max(...dueDates.map((d) => d.getTime())))
    : null;
  const daysRemaining = targetDate ? daysBetween(today, targetDate) : null;

  const health = computeHealth(milestones, criticalPath);

  const summary: RoadmapSummary = {
    current_phase_name: activePhase?.name ?? null,
    current_phase_range: activePhase && activePhase.start && activePhase.end
      ? `${activePhase.start.slice(0, 10)} – ${activePhase.end.slice(0, 10)}`
      : null,
    phases_complete: phasesComplete,
    phases_total: totalPhases,
    active_milestones: activeMs,
    blocked_milestones: blockedMs,
    ready_for_build: readyBuild,
    ready_for_qa: readyQa,
    target_date: targetDate ? targetDate.toISOString() : null,
    target_days_remaining: daysRemaining,
    roadmap_health_label: health.label,
    roadmap_health_score: health.score,
  };

  // Change summary vs prior version payload
  const change_summary = diffVersions(input.version?.payload, input.prior_version_payload, milestones);

  // Captain Brief
  const brief = buildCaptainBrief({
    activity: input.activity,
    critical: criticalPath,
    milestones,
    change: change_summary,
    version: input.version,
  });

  // Missing for approval
  const missing: string[] = [];
  if (!input.point_a_approved) missing.push("Approve Point A");
  if (!input.point_b_approved) missing.push("Approve Point B");
  if (phases.length === 0) missing.push("Define roadmap phases");
  if (milestones.length === 0) missing.push("Add at least one milestone");
  if (dueDates.length === 0) missing.push("Set milestone due dates");

  // Totals + by phase
  const totals = {
    completed: milestones.filter((m) => m.status === "complete" || m.status === "done").length,
    in_progress: activeMs,
    blocked: blockedMs,
    planned: milestones.filter((m) => m.status === "planned" || m.status === "draft" || m.status === "todo").length,
    total: milestones.length,
    by_phase: phases.map((p) => ({
      key: p.key,
      name: p.name,
      done: p.completed_count,
      total: p.milestone_count,
    })),
  };

  const last_change = input.activity[0]
    ? { title: input.activity[0].title, at: input.activity[0].created_at }
    : null;

  return {
    mode,
    version: input.version
      ? {
          id: input.version.id,
          label: input.version.label,
          status: input.version.status,
          created_at: input.version.created_at,
          approved_at: input.version.approved_at,
          approved_by: input.version.approved_by,
          locked: input.version.locked ?? input.version.status === "approved",
        }
      : null,
    point_a: input.point_a_summary,
    point_b: input.point_b_summary,
    phases,
    milestones,
    dependencies,
    critical_path: {
      bottleneck_id: criticalPath.bottleneck_id,
      bottleneck_name: criticalPath.bottleneck_name,
      downstream_impact_count: criticalPath.downstream_impact_count,
      delay_days: criticalPath.delay_days,
      reason: criticalPath.reason,
      recovery: criticalPath.recovery,
    },
    health,
    summary,
    captain_brief: brief,
    change_summary,
    missing_for_approval: missing,
    totals,
    cross_project_dependencies: input.family.map((f) => ({
      id: f.id,
      label: f.name,
      status: f.status,
    })),
    last_change,
  };
}

// ---------- critical path ----------

function computeCriticalPath(
  milestones: ReadonlyArray<RoadmapMilestoneView>,
  deps: ReadonlyArray<RoadmapDependency>,
): {
  chain: string[];
  bottleneck_id: string | null;
  bottleneck_name: string | null;
  downstream_impact_count: number;
  delay_days: number | null;
  reason: string | null;
  recovery: string | null;
} {
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const downstream = new Map<string, string[]>();
  for (const d of deps) {
    if (!downstream.has(d.from_id)) downstream.set(d.from_id, []);
    downstream.get(d.from_id)!.push(d.to_id);
  }
  // Longest path via memoized DFS on due-date ordering.
  const memo = new Map<string, string[]>();
  const walk = (id: string, seen: Set<string>): string[] => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return [id];
    const next = seen.add(id);
    const children = downstream.get(id) ?? [];
    let best: string[] = [id];
    for (const c of children) {
      const path = [id, ...walk(c, new Set(next))];
      if (path.length > best.length) best = path;
    }
    memo.set(id, best);
    return best;
  };
  let bestChain: string[] = [];
  for (const m of milestones) {
    const p = walk(m.id, new Set());
    if (p.length > bestChain.length) bestChain = p;
  }

  // Bottleneck = first blocked or at_risk in chain
  const bottleneck = bestChain
    .map((id) => byId.get(id))
    .find((m) => m && (m.status === "blocked" || m.health === "at_risk"));

  const downstreamCount = bottleneck
    ? (downstream.get(bottleneck.id)?.length ?? 0)
    : 0;

  return {
    chain: bestChain,
    bottleneck_id: bottleneck?.id ?? null,
    bottleneck_name: bottleneck?.name ?? null,
    downstream_impact_count: downstreamCount,
    delay_days: bottleneck?.status === "blocked" ? 5 : bottleneck ? 2 : null,
    reason: bottleneck?.status === "blocked" ? `${bottleneck.name} is blocked` : null,
    recovery: bottleneck ? `Unblock ${bottleneck.name} to protect the target date.` : null,
  };
}

// ---------- health ----------

function computeHealth(
  milestones: ReadonlyArray<RoadmapMilestoneView>,
  crit: { bottleneck_id: string | null },
): RoadmapHealth {
  if (milestones.length === 0) return { score: 0, label: "unknown", drivers: [] };
  const drivers: string[] = [];
  let score = 100;
  const blocked = milestones.filter((m) => m.status === "blocked").length;
  const atRisk = milestones.filter((m) => m.health === "at_risk").length;
  const needs = milestones.filter((m) => m.health === "needs_attention").length;
  score -= blocked * 12;
  score -= atRisk * 6;
  score -= needs * 2;
  if (crit.bottleneck_id) {
    drivers.push("Critical path has a bottleneck");
    score -= 5;
  }
  if (blocked > 0) drivers.push(`${blocked} milestone${blocked > 1 ? "s" : ""} blocked`);
  if (atRisk > 0) drivers.push(`${atRisk} at risk`);
  score = Math.max(0, Math.min(100, score));
  const label: RoadmapHealth["label"] =
    score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 55 ? "needs_attention" : "at_risk";
  return { score, label, drivers };
}

// ---------- captain brief ----------

function buildCaptainBrief(input: {
  activity: ReadonlyArray<{ title: string; severity: string; created_at: string }>;
  critical: { bottleneck_name: string | null; reason: string | null; recovery: string | null };
  milestones: ReadonlyArray<RoadmapMilestoneView>;
  change: RoadmapChangeSummary;
  version: RoadmapVersionMeta | null;
}): RoadmapCaptainBrief {
  const latest = input.activity[0];
  const blocked = input.milestones.find((m) => m.status === "blocked");
  const changedSummary =
    input.change.changed[0] ??
    input.change.added[0] ??
    input.change.removed[0] ??
    (latest ? latest.title : null);

  return {
    what_changed: changedSummary,
    what_matters_now: blocked
      ? `${blocked.name} is blocking downstream work.`
      : input.critical.bottleneck_name
        ? `${input.critical.bottleneck_name} sits on the critical path.`
        : "Continue delivering the current phase milestones.",
    recommendation: input.critical.recovery
      ?? (blocked ? `Unblock ${blocked.name} before the next milestone starts.` : "No intervention required."),
    watch_for: input.milestones.some((m) => m.health === "at_risk")
      ? "One or more milestones are trending at risk."
      : null,
  };
}

// ---------- diff ----------

export function diffVersions(
  next: unknown,
  prior: unknown,
  currentMilestones: ReadonlyArray<{ id: string; name: string }>,
): RoadmapChangeSummary {
  const empty: RoadmapChangeSummary = {
    since_label: null,
    since_date: null,
    added: [],
    changed: [],
    removed: [],
    resequenced: [],
  };
  if (!prior || typeof prior !== "object") return empty;
  const priorObj = prior as Record<string, unknown>;
  const nextObj = (next && typeof next === "object" ? next : {}) as Record<string, unknown>;

  const priorMs = Array.isArray(priorObj.milestones) ? (priorObj.milestones as Array<Record<string, unknown>>) : [];
  const nextMs = Array.isArray(nextObj.milestones) ? (nextObj.milestones as Array<Record<string, unknown>>) : currentMilestones as unknown as Array<Record<string, unknown>>;

  const priorIds = new Set(priorMs.map((m) => String(m.id ?? "")));
  const nextIds = new Set(nextMs.map((m) => String(m.id ?? "")));
  const added = [...nextIds].filter((id) => !priorIds.has(id)).map((id) => {
    const m = nextMs.find((x) => String(x.id) === id);
    return String(m?.name ?? id);
  });
  const removed = [...priorIds].filter((id) => !nextIds.has(id)).map((id) => {
    const m = priorMs.find((x) => String(x.id) === id);
    return String(m?.name ?? id);
  });
  const changed: string[] = [];
  for (const p of priorMs) {
    const n = nextMs.find((x) => String(x.id) === String(p.id));
    if (!n) continue;
    if (String(p.due_date ?? "") !== String(n.due_date ?? "") ||
        String(p.phase ?? "") !== String(n.phase ?? "") ||
        String(p.name ?? "") !== String(n.name ?? "")) {
      changed.push(String(n.name ?? p.name ?? ""));
    }
  }

  return {
    since_label: (priorObj.label as string) ?? null,
    since_date: (priorObj.approved_at as string) ?? (priorObj.created_at as string) ?? null,
    added,
    changed,
    removed,
    resequenced: [],
  };
}
