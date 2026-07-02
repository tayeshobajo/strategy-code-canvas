import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/ops/access";

export type EngineRole = "admin" | "operator" | "team_member" | "guest";

export interface EngineRoleState {
  role: EngineRole;
  email: string | null;
  loading: boolean;
  canApprove: boolean;      // approve / reject / lifecycle transitions
  canEdit: boolean;         // edit content fields
  canRegenerate: boolean;   // trigger AI regenerate
  canSendTasks: boolean;
  approvalDeniedReason: string;
  editDeniedReason: string;
}

/**
 * Resolves the current signed-in user's role for engine UI gating.
 * team_member = read-only reviewer: cannot approve, edit, regenerate or send.
 * operator = full read/write except role administration.
 * admin = everything.
 */
export function useEngineRole(): EngineRoleState {
  const [role, setRole] = useState<EngineRole>("guest");
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data.user?.email ?? "").toLowerCase();
      if (!mounted) return;
      setEmail(em || null);
      if (!em) { setRole("guest"); setLoading(false); return; }
      if (isAdminEmail(em)) { setRole("admin"); setLoading(false); return; }
      try {
        const [{ data: isAdmin }, { data: isOp }, { data: isTeam }] = await Promise.all([
          supabase.rpc("has_role_email", { _email: em, _role: "admin" }),
          supabase.rpc("has_role_email", { _email: em, _role: "operator" }),
          supabase.rpc("has_role_email", { _email: em, _role: "team_member" }),
        ]);
        if (!mounted) return;
        if (isAdmin === true) setRole("admin");
        else if (isOp === true) setRole("operator");
        else if (isTeam === true) setRole("team_member");
        else setRole("guest");
      } catch {
        if (mounted) setRole("guest");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const canApprove = role === "admin" || role === "operator";
  const canEdit = role === "admin" || role === "operator";
  const canRegenerate = role === "admin" || role === "operator";
  const canSendTasks = role === "admin" || role === "operator";

  const teamReason = "Read-only for team members — ask an operator to make changes.";
  return {
    role, email, loading,
    canApprove, canEdit, canRegenerate, canSendTasks,
    approvalDeniedReason: canApprove ? "" : teamReason,
    editDeniedReason: canEdit ? "" : teamReason,
  };
}
