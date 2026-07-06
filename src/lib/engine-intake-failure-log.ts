/**
 * Durable intake-failure log writer (Pillar 2).
 *
 * engine_project_intake_failures has no FK to engine_projects, so rows here
 * survive rollbackHalfBornProject — once rollback wipes engine_activity this
 * table is the ONLY durable record of a failed intake. RLS grants
 * `authenticated` SELECT only, so this write MUST go through the
 * service-role client; supabase-js returns { error } instead of throwing,
 * so the result is checked explicitly and surfaced to the caller.
 */

export type IntakeFailureInsert = {
  attempted_project_id: string | null;
  attempted_project_name: string | null;
  attempted_client_id: string | null;
  actor_email: string | null;
  delivery_mode: string | null;
  failure_reason: string;
  payload: Record<string, unknown>;
};

type MinimalSupabase = {
  from: (table: string) => {
    insert: (row: IntakeFailureInsert) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

/**
 * Inserts the failure row and returns null on success, or the failure
 * message on any error (returned {error} or thrown). Never throws — the
 * caller is already unwinding a failed intake and must not lose the
 * original error, but it must know whether the durable record landed.
 */
export async function writeDurableIntakeFailure(
  adminSb: MinimalSupabase,
  row: IntakeFailureInsert,
): Promise<string | null> {
  try {
    const { error } = await adminSb.from("engine_project_intake_failures").insert(row);
    if (error) return error.message ?? JSON.stringify(error);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
