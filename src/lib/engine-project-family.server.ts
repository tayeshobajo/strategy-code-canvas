// Server-only helpers for the project-family surface (Phase 5D app layer).
// Keeping helpers out of *.functions.ts avoids the split-transform
// ReferenceError trap (see tanstack-serverfn-splitting knowledge).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

export type FamilyNode = {
  id: string;
  name: string;
  status: string;
  parent_project_id: string | null;
  client_id: string;
  approved_at: string | null;
  completed_at: string | null;
  updated_at: string;
  current_step: string;
  progress_pct: number;
  client_portal_project_id: string | null;
  child_count: number;
  approved_child_count: number;
  completed_child_count: number;
  depth: number;
};

const FROZEN_PARENT_STATUSES = new Set(["approved", "completed"]);

export function isFrozenStatus(status: string | null | undefined): boolean {
  return !!status && FROZEN_PARENT_STATUSES.has(status);
}

// Walk parent pointers up to the root of the family. Bounded to avoid any
// pathological cycle (guarded at DB layer by tg_engine_projects_cycle_guard,
// but defence in depth is cheap).
export async function findFamilyRootId(sb: Sb, projectId: string): Promise<string> {
  let currentId = projectId;
  for (let i = 0; i < 32; i++) {
    const { data, error } = await sb
      .from("engine_projects")
      .select("id, parent_project_id")
      .eq("id", currentId)
      .maybeSingle();
    if (error) throw new Error(`family root walk failed: ${error.message}`);
    if (!data) throw new Error(`project not found: ${currentId}`);
    if (!data.parent_project_id) return data.id as string;
    currentId = data.parent_project_id as string;
  }
  throw new Error("family root walk exceeded max depth");
}

// Fetch the entire subtree rooted at rootId (BFS), producing a normalized
// list of FamilyNodes annotated with child counts + depth.
export async function fetchFamilySubtree(
  sb: Sb,
  rootId: string,
): Promise<FamilyNode[]> {
  const cols =
    "id,name,status,parent_project_id,client_id,approved_at,completed_at,updated_at,current_step,progress_pct,client_portal_project_id";

  const collected = new Map<string, any>();
  const depthById = new Map<string, number>();
  let frontier: string[] = [rootId];
  depthById.set(rootId, 0);

  for (let hop = 0; hop < 32 && frontier.length > 0; hop++) {
    const { data, error } = await sb
      .from("engine_projects")
      .select(cols)
      .in("id", frontier);
    if (error) throw new Error(`family subtree fetch failed: ${error.message}`);
    for (const row of data ?? []) collected.set(row.id as string, row);

    const { data: childRows, error: childErr } = await sb
      .from("engine_projects")
      .select("id,parent_project_id")
      .in("parent_project_id", frontier);
    if (childErr) throw new Error(`family child scan failed: ${childErr.message}`);

    const next: string[] = [];
    for (const c of childRows ?? []) {
      const cid = c.id as string;
      const pid = c.parent_project_id as string;
      if (!depthById.has(cid)) {
        depthById.set(cid, (depthById.get(pid) ?? 0) + 1);
        next.push(cid);
      }
    }
    frontier = next;
  }

  // Fetch children in bulk once more to compute counts per node (approved /
  // completed rollups) — cheaper than N queries and matches what the DB
  // triggers use to gate parent transitions.
  const ids = [...collected.keys()];
  const childrenByParent = new Map<string, any[]>();
  if (ids.length > 0) {
    const { data: allChildren } = await sb
      .from("engine_projects")
      .select("id,parent_project_id,status,approved_at,completed_at")
      .in("parent_project_id", ids);
    for (const c of allChildren ?? []) {
      const pid = c.parent_project_id as string;
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(c);
      childrenByParent.set(pid, arr);
    }
  }

  const nodes: FamilyNode[] = [];
  for (const [id, row] of collected) {
    const kids = childrenByParent.get(id) ?? [];
    nodes.push({
      id,
      name: row.name,
      status: row.status,
      parent_project_id: row.parent_project_id,
      client_id: row.client_id,
      approved_at: row.approved_at,
      completed_at: row.completed_at,
      updated_at: row.updated_at,
      current_step: row.current_step ?? "",
      progress_pct: row.progress_pct ?? 0,
      client_portal_project_id: row.client_portal_project_id ?? null,
      child_count: kids.length,
      approved_child_count: kids.filter((k: any) => !!k.approved_at).length,
      completed_child_count: kids.filter((k: any) => !!k.completed_at).length,
      depth: depthById.get(id) ?? 0,
    });
  }
  // Deterministic order: depth-first by depth then updated_at desc within.
  nodes.sort((a, b) =>
    a.depth === b.depth
      ? (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
      : a.depth - b.depth,
  );
  return nodes;
}

// Ancestry chain (root → … → project) for breadcrumbs.
export async function fetchAncestryChain(sb: Sb, projectId: string): Promise<Array<{ id: string; name: string; status: string }>> {
  const chain: Array<{ id: string; name: string; status: string }> = [];
  let currentId: string | null = projectId;
  for (let i = 0; i < 32 && currentId; i++) {
    const { data, error } = await sb
      .from("engine_projects")
      .select("id,name,status,parent_project_id")
      .eq("id", currentId)
      .maybeSingle();
    if (error) throw new Error(`ancestry chain failed: ${error.message}`);
    if (!data) break;
    chain.unshift({ id: data.id, name: data.name, status: data.status });
    currentId = (data.parent_project_id as string | null) ?? null;
  }
  return chain;
}

// Walk ancestry of `candidateAncestorId`; if `projectId` appears, reparenting
// under it would create a cycle.
export async function wouldCreateCycle(
  sb: Sb,
  projectId: string,
  candidateAncestorId: string,
): Promise<boolean> {
  if (projectId === candidateAncestorId) return true;
  let currentId: string | null = candidateAncestorId;
  for (let i = 0; i < 32 && currentId; i++) {
    const { data } = await sb
      .from("engine_projects")
      .select("parent_project_id")
      .eq("id", currentId)
      .maybeSingle();
    if (!data) return false;
    const parent = (data.parent_project_id as string | null) ?? null;
    if (parent === projectId) return true;
    currentId = parent;
  }
  return false;
}
