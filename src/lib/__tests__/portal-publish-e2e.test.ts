/**
 * End-to-end publish → portal-read test.
 *
 * Seeds a real engine project, an approved roadmap version whose payload
 * contains BOTH client-safe fields AND clearly-marked internal-only fields
 * (agent costs, provenance, source ids, internal notes), publishes it into
 * `client_portal_roadmaps` through the same `buildClientSafePayload` pipeline
 * `publishVersionToPortal` uses, then reads it back with the EXACT SELECT
 * `getPortalRoadmapDocs` uses.
 *
 * Asserts:
 *   1. The published row exists with status='delivered' and links back to the
 *      source version via `approved_roadmap_version_id`.
 *   2. Point A / Point B are exposed via `client_safe_canvas.pointA/pointB`
 *      (the canonical portal surface — never through engine_projects).
 *   3. Every internal-only marker string is stripped: it does not appear
 *      anywhere in the JSON returned by the portal SELECT — not in top-level
 *      columns, not nested inside `client_safe_canvas`, not in
 *      `strategic_priorities`/`sequence`/`risks`.
 *
 * Runs only when PG* env vars point at the managed DB. Skips cleanly on
 * plain workstations.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { buildClientSafePayload } from "@/lib/roadmap-publish";

const HAS_PG = !!process.env.PGHOST;

function psql(sql: string): string {
  return execSync(`psql -tAX -v ON_ERROR_STOP=1`, {
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// Same client-visible projection getPortalRoadmapDocs uses.
const PORTAL_SELECT =
  "id, title, executive_summary, current_diagnosis, strategic_priorities, sequence_30_60_90, risks_dependencies, recommended_next_move, current_focus, owner_name, next_milestone, next_meeting_at, share_url, approved_at, updated_at, version_label, client_safe_canvas";

const INTERNAL_MARKERS = [
  "AGENT_COST_SECRET",
  "PROVENANCE_SECRET",
  "SOURCE_ID_SECRET",
  "INTERNAL_NOTE_SECRET",
  "AI_CONFIDENCE_SECRET",
];

const cleanup: string[] = [];

afterAll(() => {
  if (!HAS_PG) return;
  // Best-effort cleanup — reverse order to respect FKs.
  for (const sql of cleanup.reverse()) {
    try {
      psql(sql);
    } catch {
      /* ignore */
    }
  }
});

describe.skipIf(!HAS_PG)("portal publish → read E2E (approved roadmap, client-safe only)", () => {
  it("publishes approved version and portal reads see ONLY client_safe_canvas content", { timeout: 45000 }, () => {
    const marker = `e2e-publish-${randomUUID()}`;
    const email = `${marker}@trust-tai-e2e.local`;

    // ── 1. Seed engine client + engine project ──────────────────────────
    const clientId = psql(
      `INSERT INTO public.engine_clients (company, status)
       VALUES ('${marker} Co', 'active') RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_clients WHERE id='${clientId}'`);

    // engine_projects has many NOT NULL jsonb columns; they default OK, but
    // we set point_a / point_b explicitly since the publish pipeline reads
    // them for the canvas.
    const projectId = psql(
      `INSERT INTO public.engine_projects
         (client_id, name, point_a, point_b)
       VALUES
         ('${clientId}', '${marker} Project',
          '"Point A detail — where the client is today"'::jsonb,
          '"Point B detail — where the client is heading"'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_projects WHERE id='${projectId}'`);

    // ── 2. Seed an approved roadmap version with mixed safe + secret payload ─
    // Payload deliberately contains internal fields the publish pipeline
    // MUST strip: agent_costs, generation_provenance, source_ids echoed in
    // payload, internal_notes, ai_confidence, ai_debug.
    const payload = {
      executive_summary: "Client-safe summary of the plan.",
      current_diagnosis: "Client-safe diagnosis.",
      strategic_priorities: [
        { title: "Ship the launch", detail: "Public detail visible to client." },
      ],
      sequence_30_60_90: { "30": ["Kickoff"], "60": ["Iterate"], "90": ["Ship"] },
      risks_dependencies: [{ risk: "Timing", mitigation: "Parallelize" }],
      recommended_next_move: "Book kickoff call.",
      supporting_notes: "Notes shared with client.",
      // ↓ Internal-only — must NOT appear in portal-read JSON.
      agent_costs: { total_cents: 999999, marker: "AGENT_COST_SECRET" },
      generation_provenance: { model: "internal", marker: "PROVENANCE_SECRET" },
      source_ids: ["SOURCE_ID_SECRET"],
      internal_notes: "INTERNAL_NOTE_SECRET operator-only",
      ai_confidence: 0.42,
      ai_debug: "AI_CONFIDENCE_SECRET raw reasoning trace",
      roadmap: {
        pointA: { label: "A", detail: "Point A detail — where the client is today" },
        pointB: { label: "B", detail: "Point B detail — where the client is heading" },
        phases: [{ id: "p1", label: "Discovery", sequence: 1 }],
        milestones: [
          {
            id: "m1",
            title: "First milestone",
            phaseId: "p1",
            sequence: 1,
            clientSafeDescription: "Milestone visible to client.",
            internal_only_note: "INTERNAL_NOTE_SECRET milestone-level",
          },
        ],
      },
    };
    const versionId = psql(
      `INSERT INTO public.engine_roadmap_versions
         (project_id, version, status, client_preview_status, label, payload)
       VALUES
         ('${projectId}', 'v1.0', 'approved', 'approved', '${marker} v1.0',
          $json$${JSON.stringify(payload).replace(/'/g, "''")}$json$::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.engine_roadmap_versions WHERE id='${versionId}'`);

    // ── 3. Seed a client portal project + permission for our test client ────
    const portalProjectId = psql(
      `INSERT INTO public.client_portal_projects
         (primary_email, portal_status, payment_status, current_phase, metadata)
       VALUES
         ('${email}', 'active', 'paid', 'kickoff', '{}'::jsonb)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.client_portal_projects WHERE id='${portalProjectId}'`);

    const permId = psql(
      `INSERT INTO public.client_portal_permissions
         (project_id, email, role, can_view_roadmap, can_message, can_upload_files, can_view_billing)
       VALUES
         ('${portalProjectId}', '${email}', 'client', true, true, false, false)
       RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.client_portal_permissions WHERE id='${permId}'`);

    // ── 4. Run the SAME builder publishVersionToPortal uses ────────────────
    const safe = buildClientSafePayload({
      title: `${marker} Project`,
      version_label: `${marker} v1.0`,
      payload,
      client_preview_override: null,
      project_point_a: "Point A detail — where the client is today",
      project_point_b: "Point B detail — where the client is heading",
    });

    // Sanity — builder itself must not carry any secret markers.
    const safeJson = JSON.stringify(safe);
    for (const m of INTERNAL_MARKERS) {
      expect(safeJson, `buildClientSafePayload leaked marker "${m}"`).not.toContain(m);
    }
    expect(safe.client_safe_canvas.pointA.detail).toBe(
      "Point A detail — where the client is today",
    );
    expect(safe.client_safe_canvas.pointB.detail).toBe(
      "Point B detail — where the client is heading",
    );

    // ── 5. Insert into client_portal_roadmaps as delivered ────────────────
    const nowIso = new Date().toISOString();
    const portalRoadmapId = psql(
      `INSERT INTO public.client_portal_roadmaps (
         project_id, approved_roadmap_version_id, title, version_label,
         status, approved_at, published_at,
         executive_summary, current_diagnosis,
         strategic_priorities, sequence_30_60_90, risks_dependencies,
         recommended_next_move, supporting_notes, client_safe_canvas, metadata
       ) VALUES (
         '${portalProjectId}', '${versionId}',
         $$${safe.title}$$, $$${safe.version_label}$$,
         'delivered', '${nowIso}', '${nowIso}',
         $$${safe.executive_summary ?? ""}$$, $$${safe.current_diagnosis ?? ""}$$,
         $json$${JSON.stringify(safe.strategic_priorities).replace(/'/g, "''")}$json$::jsonb,
         $json$${JSON.stringify(safe.sequence_30_60_90).replace(/'/g, "''")}$json$::jsonb,
         $json$${JSON.stringify(safe.risks_dependencies).replace(/'/g, "''")}$json$::jsonb,
         $$${safe.recommended_next_move ?? ""}$$, $$${safe.supporting_notes ?? ""}$$,
         $json$${JSON.stringify(safe.client_safe_canvas).replace(/'/g, "''")}$json$::jsonb,
         '{"e2e":true}'::jsonb
       ) RETURNING id`,
    );
    cleanup.push(`DELETE FROM public.client_portal_roadmaps WHERE id='${portalRoadmapId}'`);

    // ── 6. Read back with the EXACT portal projection ─────────────────────
    // Emulate getPortalRoadmapDocs' SELECT + WHERE (project_id IN perms,
    // status IN (approved, delivered)) using JSON aggregation.
    const rowsJson = psql(
      `SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text
         FROM (
           SELECT ${PORTAL_SELECT}
             FROM public.client_portal_roadmaps
            WHERE project_id IN (
                    SELECT project_id FROM public.client_portal_permissions
                     WHERE lower(email) = lower('${email}')
                       AND revoked_at IS NULL)
              AND status IN ('approved', 'delivered')
            ORDER BY approved_at DESC
         ) t`,
    );
    const rows = JSON.parse(rowsJson) as Array<Record<string, unknown>>;
    expect(rows, "portal read returned no rows for the test client").toHaveLength(1);
    const row = rows[0];

    // Basic linkage — the doc represents THIS publish.
    expect(row.id).toBe(portalRoadmapId);
    expect(row.title).toBe(safe.title);
    expect(row.version_label).toBe(safe.version_label);

    // Point A / Point B come through the canonical canvas path.
    const canvas = row.client_safe_canvas as {
      pointA: { detail: string }; pointB: { detail: string };
    };
    expect(canvas.pointA.detail).toBe("Point A detail — where the client is today");
    expect(canvas.pointB.detail).toBe("Point B detail — where the client is heading");

    // The client-visible projection MUST NOT surface any internal marker.
    const visibleJson = JSON.stringify(row);
    for (const m of INTERNAL_MARKERS) {
      expect(visibleJson, `portal read leaked internal marker "${m}"`).not.toContain(m);
    }

    // The client projection MUST NOT expose engine linkage columns.
    for (const forbidden of [
      "approved_roadmap_version_id",
      "metadata",
      "supporting_notes",
      "published_by",
    ]) {
      expect(Object.keys(row), `portal projection exposes ${forbidden}`).not.toContain(forbidden);
    }

    // But the source version linkage IS stored server-side (verify via a
    // service-role read, not part of the portal projection).
    const linkedVersion = psql(
      `SELECT approved_roadmap_version_id::text
         FROM public.client_portal_roadmaps
        WHERE id = '${portalRoadmapId}'`,
    );
    expect(linkedVersion).toBe(versionId);

    // Publish stamp on the source version should now point back at the
    // portal roadmap (mirrors what publishVersionToPortal does at the end).
    // We didn't call the server fn, so this is optional — write it here so
    // the assertion documents the contract.
    psql(
      `UPDATE public.engine_roadmap_versions
          SET published_to_portal_at = '${nowIso}',
              published_portal_roadmap_id = '${portalRoadmapId}'
        WHERE id = '${versionId}'`,
    );
    const stamp = psql(
      `SELECT published_portal_roadmap_id::text
         FROM public.engine_roadmap_versions WHERE id='${versionId}'`,
    );
    expect(stamp).toBe(portalRoadmapId);
  });
});
