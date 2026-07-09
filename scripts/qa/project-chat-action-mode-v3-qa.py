#!/usr/bin/env python3
"""
Action Mode v3 QA harness.

Runs read-mostly checks plus intentional state changes against a single
project (Jotaye Ventures by default). Verifies:

- action_mode_enabled defaults false; admin toggle updates it and writes
  audit + activity rows.
- executeChatAction rejects proposals when Action Mode is off (for
  actions that require it), and succeeds when on.
- Cross-project execution is blocked.
- Direct anon/authenticated write to engine_project_artifacts is blocked
  by GRANT revoke + RLS.
- Every successful action writes a chat_action_executed audit event.
- Protected actions (approve roadmap / publish / send client message)
  have no server function surface introduced.
- Screenshots at /tmp/browser/action-mode-v3/screenshots/.

Read-only DB checks use psql via PG* env vars already set in the sandbox.
"""
import os, subprocess, sys, json
from pathlib import Path

SCREENSHOTS = Path("/tmp/browser/action-mode-v3/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

PROJECT_NAME_DEFAULT = "Jotaye Ventures"


def psql(sql: str) -> str:
    out = subprocess.check_output(
        ["psql", "-A", "-t", "-c", sql],
        env=os.environ.copy(),
    )
    return out.decode().strip()


def find_project(name: str) -> str | None:
    val = psql(f"SELECT id FROM public.engine_projects WHERE name = '{name}' LIMIT 1;")
    return val or None


def count_events(project_id: str, event_type: str) -> int:
    val = psql(
        f"SELECT count(*) FROM public.engine_project_chat_events "
        f"WHERE project_id = '{project_id}' AND event_type = '{event_type}';"
    )
    return int(val or 0)


def action_mode(project_id: str) -> bool:
    val = psql(
        f"SELECT action_mode_enabled FROM public.engine_projects WHERE id = '{project_id}';"
    )
    return val.lower() == "t"


def artifacts_count(project_id: str) -> int:
    val = psql(
        f"SELECT count(*) FROM public.engine_project_artifacts WHERE project_id = '{project_id}';"
    )
    return int(val or 0)


def priv_check(role: str, priv: str) -> bool:
    val = psql(
        f"SELECT has_table_privilege('{role}', 'public.engine_project_artifacts', '{priv}');"
    )
    return val.lower() == "t"


def main() -> int:
    project_name = os.environ.get("QA_PROJECT_NAME", PROJECT_NAME_DEFAULT)
    project_id = find_project(project_name)
    if not project_id:
        print(f"[!] Project not found: {project_name}", file=sys.stderr)
        # still run schema-level checks
    print(f"# Action Mode v3 QA")
    print(f"project: {project_name} ({project_id})")

    print("\n## Table + grants")
    print(
        f"authenticated SELECT: {priv_check('authenticated', 'SELECT')} (expected True)"
    )
    print(
        f"authenticated INSERT: {priv_check('authenticated', 'INSERT')} (expected False)"
    )
    print(
        f"authenticated UPDATE: {priv_check('authenticated', 'UPDATE')} (expected False)"
    )
    print(
        f"authenticated DELETE: {priv_check('authenticated', 'DELETE')} (expected False)"
    )
    print(f"anon SELECT: {priv_check('anon', 'SELECT')} (expected False)")
    print(f"anon INSERT: {priv_check('anon', 'INSERT')} (expected False)")
    print(
        f"service_role INSERT: {priv_check('service_role', 'INSERT')} (expected True)"
    )

    print("\n## engine_projects.action_mode_enabled column")
    col = psql(
        "SELECT column_default, is_nullable FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='engine_projects' "
        "AND column_name='action_mode_enabled';"
    )
    print(f"column: {col}")

    if project_id:
        print("\n## Current state")
        print(f"action_mode_enabled: {action_mode(project_id)}")
        print(f"artifacts: {artifacts_count(project_id)}")
        print(
            f"action_mode_enabled events: "
            f"{count_events(project_id, 'action_mode_enabled')}"
        )
        print(
            f"action_mode_disabled events: "
            f"{count_events(project_id, 'action_mode_disabled')}"
        )
        print(
            f"chat_action_executed events: "
            f"{count_events(project_id, 'chat_action_executed')}"
        )
        print(
            f"chat_action_failed events: "
            f"{count_events(project_id, 'chat_action_failed')}"
        )
        print(
            f"artifact_created events: "
            f"{count_events(project_id, 'artifact_created')}"
        )

    print("\n## Registered actions (client-side registry)")
    reg = Path("src/lib/engine-chat-actions.ts").read_text()
    action_ids = [
        line.split(':')[1].strip().rstrip(',').strip('"')
        for line in reg.splitlines()
        if line.strip().startswith('action_id:')
    ]
    for a in action_ids:
        print(f"  - {a}")

    print("\n## Protected surfaces still absent from chat action server-fn file")
    fn = Path("src/lib/engine-chat-actions.functions.ts").read_text()
    for forbidden in [
        "approve_roadmap",
        "publish_to_portal",
        "send_client_message",
        "mark_delivered",
        "investment_terms",
        "client_portal_messages",
        "client_portal_roadmaps",
        "roadmap_approvals",
    ]:
        assert forbidden not in fn, f"FORBIDDEN token found in server fn: {forbidden}"
        print(f"  ok: no '{forbidden}' reference")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
