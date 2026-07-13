import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getProjectFamily,
  createChildProject,
  reparentProject,
  type ProjectFamilyPayload,
} from "@/lib/engine-project-family.functions";
import { getFamilyImpact, type FamilyImpactPayload } from "@/lib/engine-project-impact.functions";

export const Route = createFileRoute("/engine/projects/$projectId/family")({
  component: FamilyPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed to load family: {(error as Error).message}</div>
  ),
});

function FamilyPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const familyFn = useServerFn(getProjectFamily);
  const impactFn = useServerFn(getFamilyImpact);
  const createFn = useServerFn(createChildProject);
  const reparentFn = useServerFn(reparentProject);

  const familyOpts = queryOptions({
    queryKey: ["engine", "family", projectId],
    queryFn: () => familyFn({ data: { projectId } }) as Promise<ProjectFamilyPayload>,
  });
  const impactOpts = queryOptions({
    queryKey: ["engine", "family-impact", projectId],
    queryFn: () => impactFn({ data: { projectId } }) as Promise<FamilyImpactPayload>,
  });

  const { data: family } = useSuspenseQuery(familyOpts);
  const { data: impact } = useSuspenseQuery(impactOpts);

  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [reparentTarget, setReparentTarget] = useState<string | null>(null);
  const [newParent, setNewParent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (input: { parentProjectId: string; name: string }) =>
      createFn({ data: input }),
    onSuccess: () => {
      setShowAdd(null);
      setChildName("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["engine", "family", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "family-impact", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const reparentMut = useMutation({
    mutationFn: (input: { projectId: string; newParentId: string | null }) =>
      reparentFn({ data: input }),
    onSuccess: () => {
      setReparentTarget(null);
      setNewParent("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["engine", "family", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "family-impact", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const nodesById = useMemo(
    () => new Map(family.nodes.map((n) => [n.id, n])),
    [family.nodes],
  );
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, typeof family.nodes>();
    for (const n of family.nodes) {
      const arr = m.get(n.parent_project_id) ?? [];
      arr.push(n);
      m.set(n.parent_project_id, arr);
    }
    return m;
  }, [family.nodes]);

  const rootNode = nodesById.get(family.rootId);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#3E68B2]">
              Phase 5D
            </div>
            <h1 className="mt-1 font-display text-2xl text-[#0A0F1F]">Project family</h1>
            <p className="mt-1 text-sm text-[#667085]">
              Ancestry:{" "}
              {family.ancestry.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && <span className="mx-1 text-[#B8B0A2]">›</span>}
                  <Link
                    to="/engine/projects/$projectId/family"
                    params={{ projectId: a.id }}
                    className="underline decoration-dotted underline-offset-2 hover:text-[#0A0F1F]"
                  >
                    {a.name}
                  </Link>
                </span>
              ))}
            </p>
          </div>
          <div className="text-right text-xs text-[#667085]">
            {impact.summary.total} nodes · {impact.summary.approved} approved ·{" "}
            {impact.summary.completed} completed
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg text-[#0A0F1F]">Family tree</h2>
        <div className="mt-4 space-y-1">
          {rootNode ? (
            <FamilyRow
              node={rootNode}
              currentProjectId={projectId}
              childrenByParent={childrenByParent}
              onAdd={setShowAdd}
              onReparent={setReparentTarget}
            />
          ) : (
            <div className="text-sm text-[#667085]">Family root not resolvable.</div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg text-[#0A0F1F]">Impact & blockers</h2>
        {impact.blockers.length === 0 ? (
          <p className="mt-2 text-sm text-[#667085]">No blockers detected.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {impact.blockers.map((b, i) => (
              <li
                key={`${b.parentId}-${b.childId}-${b.reason}-${i}`}
                className="rounded-md border border-[#F2EDE4] bg-[#FBF9F4] px-3 py-2"
              >
                <span className="font-medium text-[#0A0F1F]">{b.parentName}</span>{" "}
                <span className="text-[#667085]">
                  blocked by{" "}
                  <Link
                    to="/engine/projects/$projectId/overview"
                    params={{ projectId: b.childId }}
                    className="underline decoration-dotted"
                  >
                    {b.childName}
                  </Link>{" "}
                  ({b.childStatus}) — {reasonLabel(b.reason)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAdd && (
        <Dialog title={`Add child under ${nodesById.get(showAdd)?.name ?? ""}`} onClose={() => setShowAdd(null)}>
          <label className="block text-sm">
            <span className="text-[#475467]">Name</span>
            <input
              className="mt-1 w-full rounded-md border border-[#E8E1D6] px-3 py-2 text-sm"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="e.g. Website Rebuild — Phase 2"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-[#E8E1D6] px-3 py-2 text-sm"
              onClick={() => setShowAdd(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-[#0A0F1F] px-3 py-2 text-sm text-white disabled:opacity-40"
              disabled={!childName.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({ parentProjectId: showAdd, name: childName.trim() })
              }
            >
              {createMut.isPending ? "Creating…" : "Create child"}
            </button>
          </div>
        </Dialog>
      )}

      {reparentTarget && (
        <Dialog
          title={`Reparent ${nodesById.get(reparentTarget)?.name ?? ""}`}
          onClose={() => setReparentTarget(null)}
        >
          <label className="block text-sm">
            <span className="text-[#475467]">New parent</span>
            <select
              className="mt-1 w-full rounded-md border border-[#E8E1D6] px-3 py-2 text-sm"
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
            >
              <option value="">(root — no parent)</option>
              {family.nodes
                .filter((n) => n.id !== reparentTarget)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {"  ".repeat(n.depth)}
                    {n.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-[#E8E1D6] px-3 py-2 text-sm"
              onClick={() => setReparentTarget(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-[#0A0F1F] px-3 py-2 text-sm text-white disabled:opacity-40"
              disabled={reparentMut.isPending}
              onClick={() =>
                reparentMut.mutate({
                  projectId: reparentTarget,
                  newParentId: newParent || null,
                })
              }
            >
              {reparentMut.isPending ? "Moving…" : "Reparent"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function FamilyRow({
  node,
  currentProjectId,
  childrenByParent,
  onAdd,
  onReparent,
}: {
  node: {
    id: string;
    name: string;
    status: string;
    depth: number;
    approved_at: string | null;
    completed_at: string | null;
    child_count: number;
    approved_child_count: number;
    completed_child_count: number;
    parent_project_id: string | null;
  };
  currentProjectId: string;
  childrenByParent: Map<string | null, Array<any>>;
  onAdd: (parentId: string) => void;
  onReparent: (projectId: string) => void;
}) {
  const kids = childrenByParent.get(node.id) ?? [];
  const isCurrent = node.id === currentProjectId;
  return (
    <div>
      <div
        className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 ${
          isCurrent ? "bg-[#EEF3FB] ring-1 ring-[#3E68B2]/30" : "hover:bg-[#FBF9F4]"
        }`}
        style={{ marginLeft: node.depth * 16 }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId: node.id }}
              className="truncate text-sm font-medium text-[#0A0F1F] hover:underline"
            >
              {node.name}
            </Link>
            <StatusPill status={node.status} />
          </div>
          <div className="mt-0.5 text-[11px] text-[#667085]">
            {node.child_count > 0
              ? `${node.approved_child_count}/${node.child_count} approved · ${node.completed_child_count}/${node.child_count} completed`
              : "no children"}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <button
            className="rounded-md border border-[#E8E1D6] px-2 py-1 hover:bg-white"
            onClick={() => onAdd(node.id)}
          >
            + child
          </button>
          <button
            className="rounded-md border border-[#E8E1D6] px-2 py-1 hover:bg-white"
            onClick={() => onReparent(node.id)}
          >
            move
          </button>
        </div>
      </div>
      {kids.map((k) => (
        <FamilyRow
          key={k.id}
          node={k}
          currentProjectId={currentProjectId}
          childrenByParent={childrenByParent}
          onAdd={onAdd}
          onReparent={onReparent}
        />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    approved: "bg-[#E7F1E9] text-[#2E8B57]",
    completed: "bg-[#E7F1E9] text-[#2E8B57]",
    planning: "bg-[#F2EDE4] text-[#667085]",
    blocked: "bg-[#F9E3E4] text-[#a4283c]",
  };
  const cls = tone[status] ?? "bg-[#F2EDE4] text-[#667085]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-[#0A0F1F]">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "child_not_approved":
      return "child not yet approved";
    case "child_not_completed":
      return "child not yet completed";
    case "stale_rollup_child_added_after_approval":
      return "child added after parent was approved (stale rollup)";
    case "child_added_after_completion":
      return "child added after parent was completed";
    default:
      return reason;
  }
}
