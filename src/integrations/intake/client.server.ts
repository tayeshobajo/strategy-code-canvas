// Server-only Supabase client for the dedicated intake project.
// Uses the service role key — trusted server-side inserts that bypass RLS.
//
// ⚠️ SINGLE SOURCE OF TRUTH FOR INTAKE SESSION STATE ⚠️
// -------------------------------------------------------
// This client points at a SEPARATE Supabase project used for operator-facing
// submission review (roadmap_intake_reviews, roadmap_drafts, review_audit_log,
// intake_submissions read by the ops queue). That split is deliberate.
//
// Session state (`intake_drafts`) MUST NOT be read through this client.
// `saveDraft` writes drafts to the MAIN project via `supabaseAdmin`.
// Reading drafts through `getIntakeClient()` would silently target a
// different database, breaking the classifier, scorer, question generator,
// and reflection — the "split-brain" defect fixed in Phase 11 QA.
//
// Any handler that needs to gate on a live intake draft MUST import
// `supabaseAdmin` from "@/integrations/supabase/client.server" instead.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getIntakeClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.INTAKE_SUPABASE_URL;
  const key = process.env.INTAKE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Intake Supabase env not configured (INTAKE_SUPABASE_URL / INTAKE_SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  return cached;
}
