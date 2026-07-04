import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/ops/access";

export type EngineRole = "admin" | "operator" | "team_member" | "guest";

export interface EngineRoleState {
  role: EngineRole;
  email: string | null;
  loading: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  // Broadly permissive (operator + admin)
  canApprove: boolean;
  canEdit: boolean;
  canRegenerate: boolean;
  canSendTasks: boolean;
  // Admin-only, client-affecting / financial actions
  canPublish: boolean;              // approve version, publish to client portal
  canSendDelivery: boolean;         // send final delivery to client
  canEditInvestment: boolean;       // change investment ranges
  canEditClientPreview: boolean;    // change client-facing preview content
  canManageAgents: boolean;         // agent permissions + cost controls
  approvalDeniedReason: string;
  editDeniedReason: string;
  adminOnlyReason: string;
}

/**
 * Resolves the current signed-in user's role for engine UI gating.
 * team_member = read-only reviewer: cannot approve, edit, regenerate or send.
 * operator = internal read/write, but cannot publish, send delivery to
 *   clients, edit investment ranges, or manage agent permissions/costs.
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

  const isAdmin = role === "admin";
  const isOperator = role === "operator";
  const canApprove = isAdmin || isOperator;
  const canEdit = isAdmin || isOperator;
  const canRegenerate = isAdmin || isOperator;
  const canSendTasks = isAdmin || isOperator;

  const teamReason = "Read-only for team members — ask an operator to make changes.";
  const adminOnlyReason = "Admin only — operators cannot perform this action.";
  return {
    role, email, loading, isAdmin, isOperator,
    canApprove, canEdit, canRegenerate, canSendTasks,
    canPublish: isAdmin,
    canSendDelivery: isAdmin,
    canEditInvestment: isAdmin,
    canEditClientPreview: isAdmin,
    canManageAgents: isAdmin,
    approvalDeniedReason: canApprove ? "" : teamReason,
    editDeniedReason: canEdit ? "" : teamReason,
    adminOnlyReason,
  };
}
