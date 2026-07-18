/**
 * End-to-end test for the Roadmap tab "Publish to client portal" flow.
 *
 * Exercises the real SECURITY DEFINER RPC (`public.publish_portal_roadmap`)
 * that `publishVersionToPortal` (called from
 * `src/routes/engine.projects.$projectId.roadmap.tsx` via
 * `ClientExportPreviewModal`'s "Publish to client portal" button) invokes.
 *
 * Coverage:
 *   1. Happy path — every publish updates the portal:
 *      - First publish inserts a `published` row + `published` event.
 *      - Second publish supersedes the first, inserts a NEW `published`
 *        row, and the portal read reflects the newest `version_label`.
 *   2. Failure paths surface as errors (never silent):
 *      - Non-staff caller → RPC raises "not authorized".
 *      - Missing caller email → RPC raises "caller email required".
 *      - Missing project ids → RPC raises "project ids required".
 *
 * Runs only when PG* env vars point at the managed DB. Skips on
 * plain workstations.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const HAS_PG = !!process.env.PGHOST;

function psql(sql: string): string {
  return execSync(`psql -tAX -q -v ON_ERROR_STOP=1`, {
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function tryPsql(sql: string): { ok: true; out: string } | { ok: false; err: string } {
  try {
    return { ok: true, out: psql(sql) };
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof err.stderr === "string" ? err.stderr : err.stderr?.toString?.() ?? "";
    return { ok: false, err: stderr || err.message || String(e) };
  }
}
function insertReturning(sql: string): string {
  return psql(`WITH ins AS (${sql}) SELECT * FROM ins`).split("\n")[0].trim();
}

const cleanup: string[] = [];
afterAll(() => {
  if (!HAS_PG) return;
  for (const sql of cleanup.reverse()) {
    try { psql(sql); } catch { /* ignore */ }
  }
}, 60000);

// Impersonation helpers: PostgREST-style JWT-claims GUC that auth.uid() /
// auth.email() read. Wrapping in a single transaction keeps SET LOCAL
// scoped to the RPC call so we don't pollute the connection.
function claims(userId: string, email: string): string {
  return JSON.stringify({ sub: userId, email });
}

function callPublishRpc(args: {
  actorUserId: string;
  actorEmail: string;
  portalProjectId: string | null;
  engineProjectId: string | null;
  engineVersionId: string;
  title: string;
  versionLabel: string;
  canvas: Record<string, unknown>;
}): { ok: true; eventId: string } | { ok: false; err: string } {
  const portal = args.portalProjectId ? `'${args.portalProjectId}'::uuid` : "NULL";
  const engine = args.engineProjectId ? `'${args.engineProjectId}'::uuid` : "NULL";
  const canvasJson = JSON.stringify(args.canvas).replace(/'/g, "''");
  return tryPsql(
    `BEGIN;
     SET LOCAL "request.jwt.claims" = '${claims(args.actorUserId, args.actorEmail)}';
     SELECT public.publish_portal_roadmap(
       ${portal}, ${engine}, '${args.engineVersionId}'::uuid,
       '${args.title.replace(/'/g, "''")}',
       '${args.versionLabel.replace(/'/g, "''")}',
       'summary', 'diagnosis',
       '[]'::jsonb, '{}'::jsonb, '[]'::jsonb,
       'next move',
       $json$${canvasJson}$json$::jsonb,
       '{}'::jsonb, '{}'::jsonb, 'e2e publish'
     ) AS event_id;
     COMMIT;`,
  ) as ReturnType<typeof callPublishRpc>;
}

describe.skipIf(!HAS_PG)("Roadmap tab → Publish to client portal (E2E via RPC)", () => {
  const marker = `e2e-rmp-${randomUUID()}`;
  const staffUserId = randomUUID();
  const staffEmail = `${marker}-staff@trust-tai-e2e.local`;
  const clientEmail = `${marker}-client@trust-tai-e2e.local`;
  const strangerUserId = randomUUID();
  const strangerEmail = `${marker}-stranger@trust-tai-e2e.local`;

  let engineClientId = "";
  let engineProjectId = "";
  let portalProjectId = "";
  let versionAId = "";
  let versionBId = "";

  beforeAll(() => {
    if (!HAS_PG) return;

    // Staff user + admin role → satisfies is_engine_staff() inside the RPC.
    psql(
      `INSERT INTO public.user_roles (user_id, email, role)
         VALUES ('${staffUserId}', '${staffEmail}', 'admin')
       ON CONFLICT DO NOTHING`,
    );
    cleanup.push(`DELETE FROM public.user_roles WHERE user_id='${staffUserId}'`);

    // Stranger user with NO role → drives the "not authorized" branch.
    // No user_roles row inserted on purpose.

    engineClientId = insertReturning(
      `INSERT INTO public.engine_clients (company, status)
         VALUES ('${marker} Co','active') RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_clients WHERE id='${engineClientId}'`);

    engineProjectId = insertReturning(
      `INSERT INTO public.engine_projects (client_id, name, point_a, point_b)
         VALUES ('${engineClientId}','${marker} Project',
                 '"A"'::jsonb, '"B"'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_projects WHERE id='${engineProjectId}'`);

    // Two approved versions so we can publish twice.
    versionAId = insertReturning(
      `INSERT INTO public.engine_roadmap_versions
         (project_id, version, status, client_preview_status, label, payload)
       VALUES ('${engineProjectId}','v1.0','approved','approved',
               '${marker} v1.0','{}'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_roadmap_versions WHERE id='${versionAId}'`);
    versionBId = insertReturning(
      `INSERT INTO public.engine_roadmap_versions
         (project_id, version, status, client_preview_status, label, payload)
       VALUES ('${engineProjectId}','v2.0','approved','approved',
               '${marker} v2.0','{}'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_roadmap_versions WHERE id='${versionBId}'`);

    // Portal project + client permission so the client-side read policy
    // (lower(email)=lower(auth.email()), status='published') returns rows.
    portalProjectId = insertReturning(
      `INSERT INTO public.client_portal_projects
         (primary_email, portal_status, payment_status, current_phase, metadata)
       VALUES ('${clientEmail}','roadmap_delivered','paid','kickoff','{}'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.client_portal_projects WHERE id='${portalProjectId}'`);

    const permId = insertReturning(
      `INSERT INTO public.client_portal_permissions
         (project_id, email, role, can_view_roadmap, can_message,
          can_upload_files, can_view_billing)
       VALUES ('${portalProjectId}','${clientEmail}','client',
               true, true, false, false)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.client_portal_permissions WHERE id='${permId}'`);
  }, 30000);

  it("publish succeeds and the portal reflects the newest publish every time", () => {
    // ── First publish ─────────────────────────────────────────────────
    const first = callPublishRpc({
      actorUserId: staffUserId,
      actorEmail: staffEmail,
      portalProjectId,
      engineProjectId,
      engineVersionId: versionAId,
      title: `${marker} Project`,
      versionLabel: `${marker} v1.0`,
      canvas: { pointA: { detail: "A1" }, pointB: { detail: "B1" }, marker: `${marker}-v1` },
    });
    expect(first.ok, first.ok ? "" : first.err).toBe(true);

    // Exactly one `published` row for this portal project.
    const publishedAfter1 = psql(
      `SELECT COUNT(*)::int FROM public.client_portal_roadmaps
        WHERE project_id='${portalProjectId}' AND status='published'`,
    );
    expect(Number(publishedAfter1)).toBe(1);

    // A `published` event was emitted linking to versionA.
    const eventsAfter1 = psql(
      `SELECT COUNT(*)::int FROM public.client_portal_publish_events
        WHERE portal_project_id='${portalProjectId}'
          AND event_type='published'
          AND engine_version_id='${versionAId}'`,
    );
    expect(Number(eventsAfter1)).toBe(1);

    // ── Second publish (updates the portal) ───────────────────────────
    const second = callPublishRpc({
      actorUserId: staffUserId,
      actorEmail: staffEmail,
      portalProjectId,
      engineProjectId,
      engineVersionId: versionBId,
      title: `${marker} Project`,
      versionLabel: `${marker} v2.0`,
      canvas: { pointA: { detail: "A2" }, pointB: { detail: "B2" }, marker: `${marker}-v2` },
    });
    expect(second.ok, second.ok ? "" : second.err).toBe(true);

    // Prior row must be superseded, newest row is `published`.
    const statuses = psql(
      `SELECT string_agg(status, ',' ORDER BY published_at)
         FROM public.client_portal_roadmaps
        WHERE project_id='${portalProjectId}'`,
    );
    expect(statuses).toBe("superseded,published");

    // A `superseded` event was emitted alongside a new `published` event.
    const supersededEvents = psql(
      `SELECT COUNT(*)::int FROM public.client_portal_publish_events
        WHERE portal_project_id='${portalProjectId}' AND event_type='superseded'`,
    );
    expect(Number(supersededEvents)).toBe(1);

    // ── Client-facing read (what the portal shows) reflects publish #2 ──
    // Emulate the portal RLS SELECT: authenticated client whose email
    // matches a permission row, restricted to status='published'.
    const clientView = psql(
      `BEGIN;
       SET LOCAL "request.jwt.claims" =
         '${claims(randomUUID(), clientEmail)}';
       SET LOCAL ROLE authenticated;
       SELECT COALESCE(jsonb_agg(row_to_json(t))::text, '[]')
         FROM (
           SELECT id::text, version_label, status,
                  client_safe_canvas->'pointA'->>'detail' AS point_a
             FROM public.client_portal_roadmaps
            WHERE project_id='${portalProjectId}'
         ) t;
       COMMIT;`,
    );
    const rows = JSON.parse(clientView.split("\n").filter(Boolean).pop() || "[]") as Array<{
      version_label: string; status: string; point_a: string;
    }>;
    // Under the "Clients read published roadmaps" policy, only the newest
    // publish is visible; the superseded prior row is hidden.
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("published");
    expect(rows[0].version_label).toBe(`${marker} v2.0`);
    expect(rows[0].point_a).toBe("A2");
  }, 45000);

  it("non-staff callers fail loudly (never silent no-op)", () => {
    const res = callPublishRpc({
      actorUserId: strangerUserId,
      actorEmail: strangerEmail,
      portalProjectId,
      engineProjectId,
      engineVersionId: versionAId,
      title: "x",
      versionLabel: "x",
      canvas: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.err).toMatch(/not authorized/i);
  });

  it("missing project ids fail loudly (never silent no-op)", () => {
    const res = callPublishRpc({
      actorUserId: staffUserId,
      actorEmail: staffEmail,
      portalProjectId: null,
      engineProjectId: null,
      engineVersionId: versionAId,
      title: "x",
      versionLabel: "x",
      canvas: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.err).toMatch(/project ids required/i);
  });

  it("missing caller email fails loudly (never silent no-op)", () => {
    // Impersonate a staff user_id but with an empty email claim — the RPC
    // must reject rather than write an anonymous publish.
    const emptyEmailUserId = randomUUID();
    psql(
      `INSERT INTO public.user_roles (user_id, email, role)
         VALUES ('${emptyEmailUserId}', '${marker}-noemail@trust-tai-e2e.local', 'admin')
       ON CONFLICT DO NOTHING`,
    );
    cleanup.push(`DELETE FROM public.user_roles WHERE user_id='${emptyEmailUserId}'`);
    const res = tryPsql(
      `BEGIN;
       SET LOCAL "request.jwt.claims" =
         '${JSON.stringify({ sub: emptyEmailUserId, email: "" })}';
       SELECT public.publish_portal_roadmap(
         '${portalProjectId}'::uuid, '${engineProjectId}'::uuid,
         '${versionAId}'::uuid,
         'x','x','','', '[]'::jsonb,'{}'::jsonb,'[]'::jsonb,'',
         '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'x'
       );
       COMMIT;`,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.err).toMatch(/caller email required/i);
  });
});
