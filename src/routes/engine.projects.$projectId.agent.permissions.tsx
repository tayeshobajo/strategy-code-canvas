/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Lock, Save } from "lucide-react";
import { SectionCard } from "@/components/engine/primitives";
import { getPermissions, updatePermissions } from "@/lib/engine-execution.functions";

export const Route = createFileRoute("/engine/projects/$projectId/agent/permissions")({
  component: AgentPermissionsPage,
  errorComponent: ({ error }) => (
    <div className="text-red-700 text-sm">Failed: {(error as Error).message}</div>
  ),
});

const MODES: Array<{ value: "draft_only" | "propose_updates" | "execute_approved"; label: string; hint: string }> = [
  { value: "draft_only", label: "Draft only", hint: "Agent writes drafts. Tai applies everything." },
  { value: "propose_updates", label: "Propose updates", hint: "Agent proposes module edits. Tai approves." },
  { value: "execute_approved", label: "Execute approved actions", hint: "Agent applies actions Tai has pre-approved." },
];

const ACTIONS: Array<{ key: string; label: string; locked?: "blocked" }> = [
  { key: "generate_milestone_briefs", label: "Generate milestone briefs" },
  { key: "create_acceptance_criteria", label: "Create acceptance criteria" },
  { key: "draft_developer_prompts", label: "Draft developer prompts" },
  { key: "create_tasks", label: "Create tasks" },
  { key: "update_roadmap_drafts", label: "Update roadmap drafts" },
  { key: "compare_versions", label: "Compare versions" },
  { key: "prepare_client_facing_copy", label: "Prepare client-facing copy" },
  { key: "export_pdf", label: "Export PDF" },
  { key: "send_delivery", label: "Send delivery", locked: "blocked" },
  { key: "move_project_to_execution", label: "Move project to execution", locked: "blocked" },
];

const CHOICES: Array<"allowed" | "needs_approval" | "blocked"> = ["allowed", "needs_approval", "blocked"];
const CHOICE_LABEL = { allowed: "Allowed", needs_approval: "Needs approval", blocked: "Blocked" };
const CHOICE_TONE = {
  allowed: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]",
  needs_approval: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]",
  blocked: "bg-[#fbe9ec] text-[#a4283c] border-[#f3ced5]",
};

function AgentPermissionsPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getPermissions);
  const updFn = useServerFn(updatePermissions);

  const q = useQuery({
    queryKey: ["engine", "permissions", projectId],
    queryFn: () => getFn({ data: { projectId } }),
  });
  const perms = (q.data as any)?.permissions;
  const safetyRules = (q.data as any)?.safety_rules ?? [];

  const [mode, setMode] = useState<"draft_only" | "propose_updates" | "execute_approved">("draft_only");
  const [actionPerms, setActionPerms] = useState<Record<string, "allowed" | "needs_approval" | "blocked">>({});

  useEffect(() => {
    if (perms) {
      setMode(perms.permission_mode);
      setActionPerms(perms.action_permissions ?? {});
    }
  }, [perms]);

  const save = useMutation({
    mutationFn: () => updFn({ data: { projectId, permission_mode: mode, action_permissions: actionPerms } }),
    onSuccess: () => { toast.success("Permissions saved"); qc.invalidateQueries({ queryKey: ["engine", "permissions", projectId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-ink flex items-center gap-2">
            Agent Permissions & Control Center <ShieldCheck className="w-5 h-5 text-royal" />
          </h1>
          <p className="text-sm text-ink/60 mt-1">Control what the project agent is allowed to do.</p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="text-sm bg-royal text-white rounded-md px-4 py-2 flex items-center gap-1.5 hover:bg-royal/90 disabled:opacity-60"
        ><Save className="w-4 h-4" /> Save Changes</button>
      </div>

      {/* Permission mode */}
      <SectionCard title="Permission Mode">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`text-left rounded-lg border p-4 ${
                mode === m.value ? "border-royal bg-royal/5" : "border-border hover:border-royal/40"
              }`}
            >
              <div className="font-display text-base text-ink">{m.label}</div>
              <div className="text-xs text-ink/60 mt-1">{m.hint}</div>
              {mode === m.value && <div className="mt-2 text-[10px] uppercase tracking-wide text-royal font-mono">Active</div>}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Action permissions */}
      <SectionCard title="Action Permissions">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink/50 border-b border-border">
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3 w-96">Permission</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => {
                const value = actionPerms[a.key] ?? "needs_approval";
                const locked = a.locked;
                return (
                  <tr key={a.key} className="border-b border-border/60">
                    <td className="py-3 pr-3 text-ink flex items-center gap-2">
                      {a.label}
                      {locked && <Lock className="w-3.5 h-3.5 text-ink/40" />}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex gap-1.5">
                        {CHOICES.map((c) => {
                          const disabled = locked === "blocked" && c !== "blocked";
                          const on = value === c;
                          return (
                            <button
                              key={c}
                              disabled={disabled}
                              onClick={() => setActionPerms((prev) => ({ ...prev, [a.key]: c }))}
                              className={`text-[11px] rounded-md px-2.5 py-1 border ${
                                on ? CHOICE_TONE[c] : "border-border text-ink/60 hover:border-royal/40"
                              } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                            >{CHOICE_LABEL[c]}</button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Non-negotiable safety rules */}
      <SectionCard
        title={<span className="flex items-center gap-2"><Lock className="w-4 h-4 text-ink/60" />Non-Negotiable Safety Rules</span>}
        right={<span className="text-[#a4283c]">Cannot be disabled</span>}
      >
        <ul className="space-y-2">
          {safetyRules.map((rule: string, i: number) => (
            <li key={i} className="flex items-start gap-3 p-3 rounded-md bg-canvas/50 border border-border">
              <Lock className="w-4 h-4 text-[#a4283c] mt-0.5 shrink-0" />
              <div className="text-sm text-ink flex-1">{rule}</div>
              <span className="text-[10px] uppercase tracking-wide text-[#a4283c] font-mono">Locked</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
