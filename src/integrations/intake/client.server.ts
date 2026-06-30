// Server-only Supabase client for the dedicated intake project.
// Uses the service role key — trusted server-side inserts that bypass RLS.
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
