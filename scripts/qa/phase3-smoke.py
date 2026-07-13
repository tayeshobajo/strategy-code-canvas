#!/usr/bin/env python3
"""
Phase 3 v4 — DB smoke PASS/FAIL harness.

Runs every case against a scratch portal project + roadmap fixture using psql.
Each case executes in its OWN transaction that is always rolled back so the
run is idempotent. A case PASSES when its actual outcome matches the
expectation encoded in the case definition (either a specific error
substring or "success").

Usage:
  PG* env vars must point at the target Supabase Postgres. Requires that
  the Phase 3 v4 migration and the Phase 3B RPCs are applied.

  python3 scripts/qa/phase3-smoke.py

Exits 0 iff all cases pass.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from typing import Optional


def psql(sql: str, *, allow_error: bool = False) -> tuple[int, str, str]:
    p = subprocess.run(
        ["psql", "-tAX", "-q", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True,
    )
    if not allow_error and p.returncode != 0:
        raise RuntimeError(f"psql failed:\n{p.stderr}")
    return p.returncode, p.stdout.strip(), p.stderr.strip()


@dataclass
class Case:
    id: str
    description: str
    sql: str
    expect: str  # "success" or an error substring


def build_fixture() -> dict[str, str]:
    """Seed two portal projects and three roadmap rows, return their ids."""
    ids = {
        "proj_a": str(uuid.uuid4()),
        "proj_b": str(uuid.uuid4()),
        "rmA1": str(uuid.uuid4()),  # published under proj_a
        "rmA2": str(uuid.uuid4()),  # in_progress under proj_a
        "rmB1": str(uuid.uuid4()),  # published under proj_b
    }
    setup = f"""
    INSERT INTO public.client_portal_projects (id, primary_email, portal_status, current_phase)
      VALUES ('{ids["proj_a"]}', 'smoke-a-{uuid.uuid4()}@t.local', 'roadmap_delivered', 'kickoff'),
             ('{ids["proj_b"]}', 'smoke-b-{uuid.uuid4()}@t.local', 'roadmap_delivered', 'kickoff');
    INSERT INTO public.client_portal_roadmaps (id, project_id, title, version_label, status, published_at, published_by)
      VALUES ('{ids["rmA1"]}', '{ids["proj_a"]}', 'A1', 'v1', 'published', now(), 'smoke@t.local'),
             ('{ids["rmB1"]}', '{ids["proj_b"]}', 'B1', 'v1', 'published', now(), 'smoke@t.local');
    INSERT INTO public.client_portal_roadmaps (id, project_id, title, version_label, status)
      VALUES ('{ids["rmA2"]}', '{ids["proj_a"]}', 'A2', 'v2', 'in_progress');
    """
    psql(setup)
    return ids


def teardown(ids: dict[str, str]) -> None:
    psql(f"""
    DELETE FROM public.client_portal_publish_events
      WHERE portal_project_id IN ('{ids["proj_a"]}', '{ids["proj_b"]}');
    DELETE FROM public.client_portal_roadmaps
      WHERE project_id IN ('{ids["proj_a"]}', '{ids["proj_b"]}');
    DELETE FROM public.client_portal_projects
      WHERE id IN ('{ids["proj_a"]}', '{ids["proj_b"]}');
    """, allow_error=True)


def cases(ids: dict[str, str]) -> list[Case]:
    a, b = ids["proj_a"], ids["proj_b"]
    rmA1, rmA2, rmB1 = ids["rmA1"], ids["rmA2"], ids["rmB1"]
    return [
        Case("S03", "unique-published rejects a second published row per project",
             f"INSERT INTO public.client_portal_roadmaps (project_id, title, version_label, status, published_at, published_by) "
             f"VALUES ('{a}', 't', 'v', 'published', now(), 'x@y');",
             "client_portal_roadmaps_one_published_per_project"),
        Case("S04", "published without published_at → CHECK",
             f"INSERT INTO public.client_portal_roadmaps (project_id, title, version_label, status) "
             f"VALUES ('{b}', 't', 'v', 'published');",
             "published_at_required"),
        Case("S05", "retracted without retraction fields → CHECK",
             f"INSERT INTO public.client_portal_roadmaps (project_id, title, version_label, status, published_at) "
             f"VALUES ('{b}', 't', 'v', 'retracted', now());",
             "retraction_fields_consistent"),
        Case("S06", "non-retracted with retraction fields → CHECK",
             f"UPDATE public.client_portal_roadmaps SET retraction_reason='x' WHERE id='{rmA1}';",
             "retraction_fields_consistent"),
        Case("S08", "UPDATE client_safe_canvas on published → immutability",
             f"UPDATE public.client_portal_roadmaps SET client_safe_canvas='{{}}'::jsonb WHERE id='{rmA1}';",
             "immutable"),
        Case("S11", "UPDATE acknowledged_at/by on published → ALLOWED",
             f"UPDATE public.client_portal_roadmaps SET acknowledged_at=now(), acknowledged_by_email='c@x' WHERE id='{rmA1}';",
             "success"),
        Case("S25", "recursive scrub — nested provenance rejected",
             f"UPDATE public.client_portal_roadmaps SET client_safe_canvas="
             f"'{{\"phases\":[{{\"items\":[{{\"provenance\":\"x\"}}]}}]}}'::jsonb WHERE id='{rmA2}';",
             "provenance"),
        Case("S26", "recursive scrub — metadata.publish.debug.agent_costs",
             f"UPDATE public.client_portal_roadmaps SET metadata="
             f"'{{\"publish\":{{\"debug\":{{\"agent_costs\":1}}}}}}'::jsonb WHERE id='{rmA2}';",
             "agent_costs"),
        Case("S27a", "transition whitelist — published → approved rejected",
             f"UPDATE public.client_portal_roadmaps SET status='approved' WHERE id='{rmA1}';",
             "invalid_status_transition"),
        Case("S27b", "transition whitelist — published → in_progress rejected",
             f"UPDATE public.client_portal_roadmaps SET status='in_progress' WHERE id='{rmA1}';",
             "invalid_status_transition"),
        Case("S29", "immutability — cannot change project_id on published row",
             f"UPDATE public.client_portal_roadmaps SET project_id='{b}' WHERE id='{rmA1}';",
             "immutable"),
        Case("S30a", "publish event ref — portal_roadmap_id foreign to project → rejected",
             f"INSERT INTO public.client_portal_publish_events "
             f"(portal_project_id, portal_roadmap_id, engine_project_id, event_type, actor_email) "
             f"VALUES ('{b}', '{rmA1}', gen_random_uuid(), 'published', 'x@y');",
             "belongs to different"),
        Case("S30b", "publish event ref — previous foreign → rejected",
             f"INSERT INTO public.client_portal_publish_events "
             f"(portal_project_id, portal_roadmap_id, previous_portal_roadmap_id, engine_project_id, event_type, actor_email) "
             f"VALUES ('{a}', '{rmA1}', '{rmB1}', gen_random_uuid(), 'rolled_back', 'x@y');",
             "belongs to different"),
        Case("S30c", "publish event ref — previous == current → rejected",
             f"INSERT INTO public.client_portal_publish_events "
             f"(portal_project_id, portal_roadmap_id, previous_portal_roadmap_id, engine_project_id, event_type, actor_email) "
             f"VALUES ('{a}', '{rmA1}', '{rmA1}', gen_random_uuid(), 'rolled_back', 'x@y');",
             "cannot equal"),
        Case("S30e", "publish event ref — valid same-project previous → ALLOWED",
             f"INSERT INTO public.client_portal_publish_events "
             f"(portal_project_id, portal_roadmap_id, previous_portal_roadmap_id, engine_project_id, event_type, actor_email) "
             f"VALUES ('{a}', '{rmA1}', '{rmA2}', gen_random_uuid(), 'rolled_back', 'x@y');",
             "success"),
    ]


def run_case(c: Case) -> tuple[bool, str]:
    """Run a single case in a savepoint that is always rolled back."""
    wrapped = f"BEGIN;\nSAVEPOINT s;\n{c.sql}\nROLLBACK;"
    rc, out, err = psql(wrapped, allow_error=True)
    if c.expect == "success":
        ok = rc == 0
        return ok, ("" if ok else err.splitlines()[-1] if err else "unknown failure")
    substr = c.expect.lower()
    hit = substr in (err.lower() + " " + out.lower())
    return hit, ("" if hit else f"expected '{c.expect}', got: {err or out}")


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("SKIP: PGHOST not set; harness requires Supabase psql env.")
        return 0
    ids = build_fixture()
    try:
        results: list[tuple[str, bool, str, str]] = []
        for c in cases(ids):
            ok, detail = run_case(c)
            results.append((c.id, ok, c.description, detail))
        passed = sum(1 for _, ok, _, _ in results if ok)
        for cid, ok, desc, detail in results:
            mark = "PASS" if ok else "FAIL"
            line = f"  [{mark}] {cid} — {desc}"
            if detail:
                line += f"    …  {detail}"
            print(line)
        print(f"\n{passed}/{len(results)} cases passed")
        return 0 if passed == len(results) else 1
    finally:
        teardown(ids)


if __name__ == "__main__":
    sys.exit(main())
